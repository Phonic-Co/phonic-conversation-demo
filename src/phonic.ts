import type { Context } from "hono";
import type { WSContext } from "hono/ws";
import { type Phonic, PhonicClient } from "phonic";
import {phonicApiKey } from "./phonic-env-vars";

const phonic = new PhonicClient({ token: phonicApiKey });

export const setupPhonic = async (
  ws: WSContext,
  c: Context,
  config: Phonic.ConfigPayload,
) => {
  const phonicWebSocket = await phonic.sts.connect({
    downstream_websocket_url: "wss://phonic-co--sts-sts-websocket-app.modal.run/sts",
    Authorization: `Bearer ${phonicApiKey}`,
  });

  await phonicWebSocket.waitForOpen();

  phonicWebSocket.sendConfig(config);

  let userFinishedSpeakingTimestamp = performance.now();
  let isFirstAudioChunk = true;
  let isUserSpeaking = false;
  let isPhonicSocketOpen = true;

  phonicWebSocket.on("message", (message) => {
    switch (message.type) {
      case "input_text": {
        console.log(`\n\nUser: ${message.text}`);
        isFirstAudioChunk = true;
        break;
      }
      case "is_user_speaking": {
        if (isUserSpeaking && !message.is_user_speaking) {
          userFinishedSpeakingTimestamp = performance.now();
        }
        isUserSpeaking = message.is_user_speaking;
        break;
      }
      case "tool_call": {
        console.log("Tool call function name:", message.tool_name);
        console.log("Tool call request body:", message.parameters);
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

  phonicWebSocket.on("close", (event) => {
    console.log(
      `Phonic WebSocket closed with code ${event.code} and reason "${event.reason}"`,
    );
    isPhonicSocketOpen = false;
  });

  phonicWebSocket.on("error", (error) => {
    console.log(`Error from Phonic WebSocket: ${error.message}`);
    isPhonicSocketOpen = false;
  });

  return {
    audioChunk: (audio: string) => {
      if (isPhonicSocketOpen) {
        try {
          phonicWebSocket.sendAudioChunk({ type: "audio_chunk", audio });
        } catch (error) {
          console.warn("Failed to send audio chunk:", error instanceof Error ? error.message : String(error));
          isPhonicSocketOpen = false;
        }
      }
    },
    setExternalId: (externalId: string) => {
      if (isPhonicSocketOpen) {
        try {
          phonicWebSocket.sendSetExternalId({ type: "set_external_id", external_id: externalId });
        } catch (error) {
          console.warn("Failed to set external ID:", error instanceof Error ? error.message : String(error));
          isPhonicSocketOpen = false;
        }
      }
    },
    close: phonicWebSocket.close,
  };
};
