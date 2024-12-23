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
  const { data, error } = await phonic.tts.websocket({
    output_format: "mulaw_8000",
  });

  if (error !== null) {
    throw new Error(error.message);
  }

  const { phonicWebSocket } = data;

  phonicWebSocket.onMessage((message) => {
    if (message.type === "audio_chunk") {
      ws.send(
        JSON.stringify({
          event: "media",
          streamSid: ws.data.streamSid,
          media: {
            payload: message.audio,
          },
        }),
      );
    } else if (message.type === "error") {
      console.error("Phonic error:", message.error);
    }
  });

  phonicWebSocket.onClose((event) => {
    console.log(
      `Phonic WebSocket closed with code ${event.code} and reason "${event.reason}"`,
    );
  });

  phonicWebSocket.onError((event) => {
    console.log(`Error from Phonic WebSocket: ${event.message}`);
  });

  ws.data.phonic = {
    generate(text: string) {
      phonicWebSocket.generate({ text });
    },
    flush: phonicWebSocket.flush,
    stop: phonicWebSocket.stop,
    close: phonicWebSocket.close,
  };
};
