import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";
import { setupDeepgram } from "./deepgram";
import { setupOpenAI } from "./openai";
import { setupPhonic } from "./phonic";
import type { TwilioWebSocketMessage } from "./types";

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.post("/incoming-call", (c) => {
  const url = new URL(c.req.url);
  const response = new VoiceResponse();

  response.say("Speak now");

  response.connect().stream({
    url: `wss://${url.host}/ws`,
  });

  return c.text(response.toString(), 200, { "Content-Type": "text/xml" });
});

app.get(
  "/ws",
  upgradeWebSocket((c) => {
    return {
      async onOpen(_event, ws) {
        c.set("streamSid", null);
        c.set("speaking", false);

        setupDeepgram(ws, c);
        setupOpenAI(ws, c);
        await setupPhonic(ws, c);
      },
      onMessage(event, ws) {
        const message = event.data;

        if (typeof message !== "string") {
          return;
        }

        try {
          const messageObj = JSON.parse(message) as TwilioWebSocketMessage;

          if (messageObj.event === "start") {
            c.set("streamSid", messageObj.streamSid);
          } else if (messageObj.event === "stop") {
            ws.close();
          } else if (
            messageObj.event === "media" &&
            messageObj.media.track === "inbound"
          ) {
            c.get("transcribe")(messageObj.media.payload);
          }
        } catch (error) {
          console.error("Failed to parse Twilio message:", error);
        }
      },
      onClose() {
        console.log("Twilio call finished");

        c.get("phonic").close();
      },
    };
  }),
);

const server = serve(app);

injectWebSocket(server);
