import { Hono } from "hono";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";
import { setupDeepgram } from "./deepgram";
import { setupOpenAI } from "./openai";
import { setupPhonic } from "./phonic";
import type { TwilioWebSocketMessage, WebSocketData } from "./types";

const app = new Hono();

app.post("/incoming-call", (c) => {
  const url = new URL(c.req.url);
  const response = new VoiceResponse();

  response.say("Speak now");

  response.connect().stream({
    url: `wss://${url.host}/ws`,
  });

  return c.text(response.toString(), 200, { "Content-Type": "text/xml" });
});

Bun.serve<WebSocketData>({
  fetch: (req, server) => {
    const url = new URL(req.url);
    const { pathname } = url;

    if (pathname === "/ws") {
      const upgraded = server.upgrade(req, {
        data: {
          streamSid: null,
          speaking: false,
          transcribe: () => {},
          promptLLM: () => {},
          generateSpeech: () => {},
        },
      });

      if (upgraded) {
        return;
      }

      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    return app.fetch(req);
  },
  websocket: {
    async open(ws) {
      setupDeepgram(ws);
      setupOpenAI(ws);
      await setupPhonic(ws);
    },
    message(ws, message) {
      if (typeof message !== "string") {
        return;
      }

      try {
        const messageObj = JSON.parse(message) as TwilioWebSocketMessage;

        if (messageObj.event === "start") {
          ws.data.streamSid = messageObj.streamSid;
        } else if (messageObj.event === "stop") {
          ws.close();
        } else if (
          messageObj.event === "media" &&
          messageObj.media.track === "inbound"
        ) {
          ws.data.transcribe(messageObj.media.payload);
        }
      } catch (error) {
        console.error("Failed to parse Twilio message:", error);
      }
    },
    close() {
      console.log("Twilio call finished");
    },
  },
});
