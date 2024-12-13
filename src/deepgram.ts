import { LiveTranscriptionEvents, createClient } from "@deepgram/sdk";
import type { ServerWebSocket } from "bun";
import type { WebSocketData } from "./types";

const deepgramApiKey = Bun.env.DEEPGRAM_API_KEY;

if (!deepgramApiKey) {
  throw new Error("DEEPGRAM_API_KEY environment variable is not set");
}

const deepgramClient = createClient(Bun.env.DEEPGRAM_API_KEY);

export const setupDeepgram = (ws: ServerWebSocket<WebSocketData>) => {
  const deepgram = deepgramClient.listen.live({
    // Model
    model: "nova-2-phonecall",
    language: "en",
    // Formatting
    smart_format: true,
    // Audio
    encoding: "mulaw",
    sample_rate: 8000,
    channels: 1,
    multichannel: false,
    // End of Speech
    no_delay: true,
    interim_results: true,
    endpointing: 300,
    utterance_end_ms: 1000,
  });

  let keepAlive: Timer | null = null;

  if (keepAlive !== null) {
    clearInterval(keepAlive);
  }

  keepAlive = setInterval(() => {
    deepgram.keepAlive();
  }, 10 * 1000);

  let isFinals: string[] = [];

  deepgram.addListener(LiveTranscriptionEvents.Open, async () => {
    deepgram.addListener(LiveTranscriptionEvents.Transcript, (data) => {
      const transcript = data.channel.alternatives[0].transcript as string;

      if (transcript === "") {
        return;
      }

      if (data.is_final) {
        isFinals.push(transcript);

        if (data.speech_final) {
          const utterance = isFinals.join(" ");

          console.log("You said:", utterance);

          isFinals = [];

          ws.data.promptLLM(utterance);
        }
      } else if (ws.data.speaking) {
        console.log("Sending clear message");

        ws.send(
          JSON.stringify({
            event: "clear",
            streamSid: ws.data.streamSid,
          }),
        );
        ws.data.phonic.sendStop();
        ws.data.speaking = false;
      }
    });

    deepgram.addListener(LiveTranscriptionEvents.Close, () => {
      if (keepAlive !== null) {
        clearInterval(keepAlive);
      }

      deepgram.requestClose();
    });

    deepgram.addListener(LiveTranscriptionEvents.Error, (error) => {
      console.error("Deepgram error:", error);
    });
  });

  const transcribe = (audioinBase64: string) => {
    const rawAudio = Buffer.from(audioinBase64, "base64");

    deepgram.send(new Blob([rawAudio]));
  };

  ws.data.transcribe = transcribe;
};
