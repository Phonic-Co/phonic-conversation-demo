import type { Context } from "hono";
import type { WSContext } from "hono/ws";
import { Phonic, type PhonicSTSWebSocketResponseMessage, type PhonicSTSWebSocket, type PhonicSTSConfig } from "phonic";
import { phonicApiBaseUrl, phonicApiKey } from "./phonic-env-vars";

const phonic = new Phonic(phonicApiKey, {
  baseUrl: phonicApiBaseUrl || "https://api.phonic.co",
});

type ToolCallMessage = Extract<PhonicSTSWebSocketResponseMessage, { type: "tool_call" }>;

const handleToolCallOutput = (phonicWebSocket: PhonicSTSWebSocket, message: ToolCallMessage) => {
  const toolCallId = message.tool_call_id;
  const toolName = message.tool_name;
  const name = message.parameters.name;

  if (toolName !== "get_user_interests") {
    console.log(`Returning output for tool call ${toolCallId}: {error: true, message: "Tool not found"}`);
    phonicWebSocket.sendToolCallOutput({
      toolCallId,
      output: {
        error: true,
        message: "Tool not found",
      }
    });

    return;
  }

  const randomInterests = [
    "skydiving, origami, and competitive duck herding",
    "underwater basket weaving, cheese tasting, and yodeling",
    "extreme ironing, snail racing, and cloud watching",
    "urban beekeeping, llama grooming, and interpretive dance",
    "ferret legging, sandcastle architecture, and quantum chess",
    "competitive rock balancing, mushroom foraging, and silent discoing",
    "ice sculpting, medieval reenactment, and pancake art",
    "drone racing, soap carving, and synchronized swimming",
    "giant pumpkin growing, marble racing, and sand art",
    "speedcubing, kite fighting, and historical fencing"
  ];

  const interests =
    randomInterests[Math.floor(Math.random() * randomInterests.length)];

  setTimeout(() => {
    console.log(`Returning output for tool call ${toolCallId}: ${name}'s interests are: ${interests}`);
    phonicWebSocket.sendToolCallOutput({
      toolCallId,
      output: `${name}'s interests are: ${interests}`,
    });
  }, 3000); // Simulate Takes 3 seconds to run
};

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

      case "user_started_speaking": {
        isUserSpeaking = true;

        break;
      }

      case "user_finished_speaking": {
        if (isUserSpeaking) {
          userFinishedSpeakingTimestamp = performance.now();
        }

        isUserSpeaking = false;

        break;
      }


      case "tool_call_completed": {
        console.log("Tool call function name:", message.tool.name);
        console.log("Tool call request body:", message.request_body);

        break;
      }

      case "tool_call": {
        console.log("Tool call received:", message);

        handleToolCallOutput(phonicWebSocket, message);

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
