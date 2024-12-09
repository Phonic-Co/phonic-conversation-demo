import type { ServerWebSocket } from "bun";
import { Phonic } from "phonic";
import type { WebSocketData } from "./types";

const phonicApiKey = Bun.env.PHONIC_API_KEY;

if (!phonicApiKey) {
  throw new Error("PHONIC_API_KEY environment variable is not set");
}

const phonic = new Phonic(phonicApiKey, {
  baseUrl: Bun.env.PHONIC_API_BASE_URL || "https://api.phonic.co",
});

export const setupPhonic = async (ws: ServerWebSocket<WebSocketData>) => {
  const { data, error } = await phonic.tts.websocket();

  if (error !== null) {
    console.error("Phonic WebSocket error:", error);
    return;
  }

  const { phonicWebSocket } = data;

  phonicWebSocket.onMessage((data) => {
    if (data instanceof Buffer) {
      // Send the generated speech to Twilio
      ws.send(
        JSON.stringify({
          event: "media",
          streamSid: ws.data.streamSid,
          media: {
            payload: data.toString("base64"),
          },
        }),
      );
    }
  });

  const generateSpeech = (script: string) => {
    phonicWebSocket.send({
      script,
      output_format: "mulaw_8000",
    });
  };

  ws.data.generateSpeech = generateSpeech;
};
