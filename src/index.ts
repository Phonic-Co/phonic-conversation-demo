import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";
import { setupPhonic } from "./phonic";
import type { TwilioWebSocketMessage } from "./types";
// import { getSystemPrompt } from "./prompt";

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.post("/inbound", (c) => {
  const url = new URL(c.req.url);
  const response = new VoiceResponse();

  response.connect().stream({
    url: `wss://${url.host}/inbound-ws`,
  });

  return c.text(response.toString(), 200, { "Content-Type": "text/xml" });
});

app.get(
  "/inbound-ws",
  upgradeWebSocket((c) => {
    let phonic: ReturnType<typeof setupPhonic>;

    return {
      onOpen(_event, ws) {
        c.set("streamSid", null);

        phonic = setupPhonic(ws, c, {
          project: "maven",
          input_format: "mulaw_8000",
          welcome_message: "Hi, this is Anna. Thanks for calling CRM spot. How can I help you today?",
          voice_id: "greta",
          system_prompt: "",
          output_format: "mulaw_8000",
          vad_threshold: 0.5,
        });
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

            phonic.setExternalId(messageObj.start.callSid);
          } else if (messageObj.event === "stop") {
            ws.close();
          } else if (
            messageObj.event === "media" &&
            messageObj.media.track === "inbound"
          ) {
            phonic.audioChunk(messageObj.media.payload);
          }
        } catch (error) {
          console.error("Failed to parse Twilio message:", error);
        }
      },
      onClose() {
        console.log("\n\nTwilio call finished");

        phonic.close();
      },
    };
  }),
);

app.post("/outbound", (c) => {
  const url = new URL(c.req.url);
  const response = new VoiceResponse();

  response.connect().stream({
    url: `wss://${url.host}/outbound-ws`,
  });

  return c.text(response.toString(), 200, { "Content-Type": "text/xml" });
});

app.get(
  "/outbound-ws",
  upgradeWebSocket((c) => {
    let phonic: ReturnType<typeof setupPhonic>;

    return {
      onOpen(_event, ws) {
        c.set("streamSid", null);

        phonic = setupPhonic(ws, c, {
          project: "maven",
          input_format: "mulaw_8000",
          welcome_message: "Hello, this is Anna. Thanks for calling the Rockefeller Center. How can I help you today?",
          voice_id: "greta",
          system_prompt: "",
          output_format: "mulaw_8000",
        });
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

            phonic.setExternalId(messageObj.start.callSid);
          } else if (messageObj.event === "stop") {
            ws.close();
          } else if (
            messageObj.event === "media" &&
            messageObj.media.track === "inbound"
          ) {
            phonic.audioChunk(messageObj.media.payload);
          }
        } catch (error) {
          console.error("Failed to parse Twilio message:", error);
        }
      },
      onClose() {
        console.log("\n\nTwilio call finished");

        phonic.close();
      },
    };
  }),
);

const port = 3000;
const server = serve({
  fetch: app.fetch,
  port,
});

injectWebSocket(server);

console.log(`Listening on port ${port}`);
