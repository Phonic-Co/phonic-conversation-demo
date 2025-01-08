import type { Context } from "hono";
import type { WSContext } from "hono/ws";
import { Phonic } from "phonic";
import { phonicApiBaseUrl, phonicApiKey } from "./env-vars";

const phonic = new Phonic(phonicApiKey, {
  baseUrl: phonicApiBaseUrl || "https://api.phonic.co",
});

export const setupPhonic = async (ws: WSContext, c: Context) => {
  const { data, error } = await phonic.tts.websocket({
    output_format: "mulaw_8000",
  });

  if (error !== null) {
    throw new Error(error.message);
  }

  const { phonicWebSocket } = data;
  let isFirstTextChunk = true;
  let firstTextChunkSent = 0;
  let isFirstAudioChunk = true;

  phonicWebSocket.onMessage((message) => {
    if (message.type === "audio_chunk") {
      if (isFirstAudioChunk) {
        console.info(
          "TTFB:",
          Math.round(performance.now() - firstTextChunkSent),
          "ms",
        );

        isFirstAudioChunk = false;
      }

      ws.send(
        JSON.stringify({
          event: "media",
          streamSid: c.get("streamSid"),
          media: {
            payload: message.audio,
          },
        }),
      );
    } else if (
      message.type === "flush_confirm" ||
      message.type === "stop_confirm"
    ) {
      isFirstAudioChunk = true;
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

  c.set("phonic", {
    generate(text: string) {
      phonicWebSocket.generate({ text });

      if (isFirstTextChunk) {
        firstTextChunkSent = performance.now();
      }

      isFirstTextChunk = false;
    },
    flush: () => {
      phonicWebSocket.flush();

      isFirstTextChunk = true;
    },
    stop: () => {
      phonicWebSocket.stop();

      isFirstTextChunk = true;
    },
    close: phonicWebSocket.close,
  });
};
