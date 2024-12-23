import type { ServerWebSocket } from "bun";
import type { WebSocketData } from "./types";

const phonicApiKey = Bun.env.PHONIC_API_KEY;

if (!phonicApiKey) {
  throw new Error("PHONIC_API_KEY environment variable is not set");
}

const baseUrl = Bun.env.PHONIC_API_BASE_URL || "https://api.phonic.co";
const wsBaseUrl = baseUrl.replace(/^http/, "ws");
const queryString = new URLSearchParams({
  output_format: "mulaw_8000",
}).toString();
const webSocketUrl = `${wsBaseUrl}/v1/tts/ws?${queryString}`;

export const setupPhonic = async (ws: ServerWebSocket<WebSocketData>) => {
  console.log("Connecting to Phonic WebSocket at", webSocketUrl);

  const phonicWebSocket = new WebSocket(webSocketUrl, {
    // @ts-expect-error Looks like Bun types don't know yet about passing headers to WebSocket.
    // It's clearly communicated here: https://bun.sh/docs/api/websockets#connect-to-a-websocket-server
    headers: {
      Authorization: `Bearer ${Bun.env.PHONIC_API_KEY}`,
    },
  });

  phonicWebSocket.onmessage = (event) => {
    const message = JSON.parse(event.data);

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
  };

  ws.data.phonic = {
    sendText(text: string) {
      phonicWebSocket.send(
        JSON.stringify({
          type: "generate",
          text,
        }),
      );
    },
    flush() {
      phonicWebSocket.send(
        JSON.stringify({
          type: "flush",
        }),
      );
    },
    stop() {
      phonicWebSocket.send(
        JSON.stringify({
          type: "stop",
        }),
      );
    },
  };
};
