import type { Context } from "hono";
import type { WSContext } from "hono/ws";
import { type Phonic, PhonicClient } from "phonic";
import { phonicApiBaseUrl, phonicApiKey } from "./phonic-env-vars";

const phonic = new PhonicClient({
  baseUrl: phonicApiBaseUrl,
  token: phonicApiKey,
});

export const setupPhonic = (
  ws: WSContext,
  c: Context,
  config: Phonic.ConfigPayload,
) => {
  const pendingMessages: Array<() => void> = [];
  let isConnected = false;
  let phonicWebSocket: Awaited<ReturnType<typeof phonic.sts.connect>> | null =
    null;

  const withBuffer =
    <T extends unknown[]>(fn: (...args: T) => void) =>
    (...args: T) => {
      const action = () => fn(...args);
      if (isConnected && phonicWebSocket) {
        action();
      } else {
        pendingMessages.push(action);
      }
    };

  phonic.sts
    .connect()
    .then((socket) => {
      phonicWebSocket = socket;

      socket.on("open", () => {
        isConnected = true;
        pendingMessages.splice(0).forEach((action) => action());
      });

      withBuffer(socket.sendConfig.bind(socket))(config);

      socket.on("message", (message) => {
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

      socket.on("close", (event) => {
        console.log(
          `Phonic WebSocket closed with code ${event.code} and reason "${event.reason}"`,
        );
        isConnected = false;
      });

      socket.on("error", (error) => {
        console.log(`Error from Phonic WebSocket: ${error.message}`);
        isConnected = false;
      });
    })
    .catch((error) => {
      console.error("Failed to connect to Phonic:", error);
    });

  let userFinishedSpeakingTimestamp = performance.now();
  let isFirstAudioChunk = true;
  let isUserSpeaking = false;

  return {
    audioChunk: withBuffer((audio: string) =>
      phonicWebSocket?.sendAudioChunk({ type: "audio_chunk", audio }),
    ),
    setExternalId: withBuffer((externalId: string) =>
      phonicWebSocket?.sendSetExternalId({
        type: "set_external_id",
        external_id: externalId,
      }),
    ),
    sendToolCallOutput: withBuffer((toolCallId: string, output: unknown) =>
      phonicWebSocket?.sendToolCallOutput({
        type: "tool_call_output",
        tool_call_id: toolCallId,
        output,
      }),
    ),
    updateSystemPrompt: withBuffer((systemPrompt: string) =>
      phonicWebSocket?.sendUpdateSystemPrompt({
        type: "update_system_prompt",
        system_prompt: systemPrompt,
      }),
    ),
    close: () => phonicWebSocket?.close(),
  };
};
