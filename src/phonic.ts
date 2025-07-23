import type { Context } from "hono";
import type { WSContext } from "hono/ws";
import { Phonic, type PhonicSTSConfig } from "phonic";
import { phonicApiBaseUrl, phonicApiKey } from "./phonic-env-vars";
import { listFiles, readFile, writeFile } from "./file-tools";

console.log(`Initializing Phonic on base URL in phonic.ts: ${phonicApiBaseUrl} with API key: ${phonicApiKey}`);
const phonic = new Phonic(phonicApiKey, {
  baseUrl: phonicApiBaseUrl
});

const toolRegistry = {
  list_files: async () => {
    try {
      const files = listFiles();
      return { success: true, result: files };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
  read_file: async (parameters: { filename: string }) => {
    try {
      const content = readFile(parameters.filename);
      return { success: true, result: content };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
  write_file: async (parameters: { filename: string; content: string }) => {
    try {
      await writeFile(parameters.filename, parameters.content);
      return { success: true, result: `File '${parameters.filename}' written successfully` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
};

async function executeTool(toolName: string, parameters: any, phonicWebSocket: any, toolCallId: string) {
  const tool = toolRegistry[toolName as keyof typeof toolRegistry];
  if (!tool) {
    const errorResult = { success: false, error: `Unknown tool: ${toolName}` };
    phonicWebSocket.sendToolCallOutput({toolCallId, output: errorResult});
    return errorResult;
  }
  
  const result = await tool(parameters);
  phonicWebSocket.sendToolCallOutput({toolCallId, output: result});
  return result;
}

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
        if (isUserSpeaking && !message.is_user_speaking) {
          userFinishedSpeakingTimestamp = performance.now();
        }

        isUserSpeaking = message.is_user_speaking;

        break;
      }

      case "tool_call": {
        console.log("Tool call function name:", message.tool_name);
        console.log("Tool call parameters:", message.parameters);
        const toolCallResult = executeTool(message.tool_name, message.parameters, phonicWebSocket, message.tool_call_id);
        console.log("Tool call result:", toolCallResult);
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
