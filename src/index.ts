import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { readFileSync } from "fs";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";
import { decode } from "node-wav";
import { setupPhonic } from "./phonic";
import { replayWavFilePath } from "./phonic-env-vars";
import type { TwilioWebSocketMessage } from "./types";

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
    const buffer = replayWavFilePath !== undefined ? readFileSync(replayWavFilePath) : undefined;
    const result = replayWavFilePath !== undefined ? decode(buffer) : undefined;
    const { sampleRate, channelData } = result;
    let replayPlaybackTime = replayWavFilePath !== undefined ? 0.0 : undefined;
    console.log("\n\nreading replay wav from:", replayWavFilePath, "\n\nsample rate:", sampleRate, "\n\nchannels:", channelData.length, "\n\nlength in samples:", channelData[0].length)
    let phonic: Awaited<ReturnType<typeof setupPhonic>>;
    let isPhonicReady = false;

    return {
      async onOpen(_event, ws) {
        c.set("streamSid", null);
        c.set("callSid", null);

        phonic = await setupPhonic(ws, c, {
          input_format: "mulaw_8000",
          welcome_message: "Hello, how can I help you today?",
          voice_id: "meredith",
          output_format: "mulaw_8000",
        });
        phonic.setExternalId(c.get("callSid"));

        isPhonicReady = true;
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
            c.set("callSid", messageObj.start.callSid);
          } else if (messageObj.event === "stop") {
            ws.close();
          } else if (
            isPhonicReady &&
            messageObj.event === "media" &&
            messageObj.media.track === "inbound"
          ) {
            if (replayPlaybackTime !== undefined) {
              phonic.audioChunk(channelData[0].slice(replayPlaybackTime * sampleRate, (replayPlaybackTime + 0.02) * sampleRate));
              replayPlaybackTime += 0.02;
            } else {
              phonic.audioChunk(messageObj.media.payload);
            }
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
    let phonic: Awaited<ReturnType<typeof setupPhonic>>;
    let isPhonicReady = false;

    return {
      async onOpen(_event, ws) {
        c.set("streamSid", null);
        c.set("callSid", null);

        phonic = await setupPhonic(ws, c, {
          input_format: "mulaw_8000",
          welcome_message:
            "Hello! This is your AI assistant calling. How are you doing today?",
          voice_id: "meredith",
          output_format: "mulaw_8000",
        });
        phonic.setExternalId(c.get("callSid"));

        isPhonicReady = true;
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
            c.set("callSid", messageObj.start.callSid);
          } else if (messageObj.event === "stop") {
            ws.close();
          } else if (
            isPhonicReady &&
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
