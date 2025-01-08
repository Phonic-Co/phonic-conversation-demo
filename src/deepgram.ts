import { LiveTranscriptionEvents, createClient } from "@deepgram/sdk";
import type { Context } from "hono";
import type { WSContext } from "hono/ws";
import { deepgramApiKey } from "./env-vars";

const deepgramClient = createClient(deepgramApiKey);

export const setupDeepgram = (ws: WSContext, c: Context) => {
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

  let keepAlive: NodeJS.Timeout | null = null;

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

          c.get("promptLLM")(utterance);
        }
      } else if (c.get("speaking")) {
        console.log("Sending clear message");

        ws.send(
          JSON.stringify({
            event: "clear",
            streamSid: c.get("streamSid"),
          }),
        );

        c.get("phonic").stop();
        c.set("speaking", false);
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

  c.set("transcribe", transcribe);
};
