import type { Context } from "hono";
import type { WSContext } from "hono/ws";
import { Phonic, type PhonicSTSConfig } from "phonic";
import { phonicApiBaseUrl, phonicApiKey } from "./phonic-env-vars";

const phonic = new Phonic(phonicApiKey, {
  baseUrl: phonicApiBaseUrl || "https://api.phonic.co",
});

export const setupPhonic = (
  ws: WSContext,
  c: Context,
  config: PhonicSTSConfig,
) => {
  const phonicWebSocket = phonic.sts.websocket(config);

  let userFinishedSpeakingTimestamp = performance.now();
  let isFirstAudioChunk = true;
  let isUserSpeaking = false;

  phonicWebSocket.onMessage((message) => {
    switch (message.type) {
      case "input_text": {
        console.log(`\n\nUser: ${message.text}`);

        isFirstAudioChunk = true;

        break;
      }

      case "is_user_speaking": {
        if (isUserSpeaking && !message.isUserSpeaking) {
          userFinishedSpeakingTimestamp = performance.now();
        }

        isUserSpeaking = message.isUserSpeaking;

        break;
      }

      case "audio_chunk": {
        if (isFirstAudioChunk) {
          console.log(
            "\nTTFB:",
            Math.round(performance.now() - userFinishedSpeakingTimestamp),
            "ms",
          );
          process.stdout.write("Assistant: ");

          isFirstAudioChunk = false;
        }

        if (message.text !== "") {
          process.stdout.write(message.text);
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
        break;
      }

      case "interrupted_response": {
        ws.send(
          JSON.stringify({
            event: "clear",
            streamSid: c.get("streamSid"),
          }),
        );
        break;
      }

      case "error": {
        console.error("Phonic error:", message.error);
        break;
      }

      case "assistant_ended_conversation": {
        ws.send(
          JSON.stringify({
            event: "mark",
            streamSid: c.get("streamSid"),
            mark: {
              name: "end_conversation_mark",
            },
          }),
        );
        break;
      }
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

  return {
    audioChunk: (audio: string) => {
      phonicWebSocket.audioChunk({ audio });
    },
    setExternalId: (externalId: string) => {
      phonicWebSocket.setExternalId({ externalId });
    },
    close: phonicWebSocket.close,
  };
};
