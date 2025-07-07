import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { mulaw } from "alawmulaw";
import { Hono } from "hono";
import { decode } from "node-wav";
import type {
  PhonicConfigurationEndpointRequestPayload,
  PhonicConfigurationEndpointResponsePayload,
} from "phonic";
import { Webhook } from "svix";
import twilio from "twilio";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";
import { twilioAccountSid, twilioAuthToken } from "./call-env-vars";
import { setupPhonic } from "./phonic";
import { replayWavFilePath } from "./phonic-env-vars";
import type { TwilioWebSocketMessage } from "./types";
import {
  phonicConfigWebhookAuthorization,
  phonicWebhookSecret,
} from "./webhook-env-vars";

const app = new Hono();
const twilioClient = twilio(twilioAccountSid, twilioAuthToken);

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
    const buffer =
      replayWavFilePath !== undefined
        ? readFileSync(replayWavFilePath)
        : undefined;
    const result = buffer !== undefined ? decode(buffer) : undefined;
    const sampleRate = result?.sampleRate;
    const channelData = result?.channelData;
    let replayPlaybackTime = replayWavFilePath !== undefined ? 0.0 : undefined;
    console.log(
      "\n\nreading replay wav from:",
      replayWavFilePath,
      "\n\nsample rate:",
      sampleRate,
      "\n\nchannels:",
      channelData?.length,
    );
    if (channelData !== undefined) {
      console.log("\n\nlength in samples:", channelData[0].length);
    }
    let phonic: ReturnType<typeof setupPhonic>;

    return {
      onOpen(_event, ws) {
        c.set("streamSid", null);

        // NOTE: This is our temporary fix while our LLM model is too trigger-happy with
        // the official end conversation tool call
        // phonic = setupPhonic(ws, c, {
        //   project: "main",
        //   input_format: "mulaw_8000",
        //   system_prompt: `You are a helpful conversational assistant speaking to someone on the phone. You should output text as normal without calling a tool call in most cases. Only call the provided functions when the conversation has fully finished. The functions available for use are: ${phonicTools}.`,
        //   welcome_message: "Hello, how can I help you today?",
        //   voice_id: "grant",
        //   output_format: "mulaw_8000",
        //   tools: ["natural_conversation_ending"],
        // });
        phonic = setupPhonic(ws, c, {
          project: "main",
          input_format: "mulaw_8000",
          system_prompt: `You are a helpful assistant. If you seek to end the call, say "It's time to say goodbye ∎". Saying ∎ will trigger the end of the conversation.`,
          welcome_message: "Hello, how can I help you today?",
          voice_id: "grant",
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
            c.set("callSid", messageObj.start.callSid);

            phonic.setExternalId(messageObj.start.callSid);
          } else if (messageObj.event === "stop") {
            ws.close();
          } else if (
            messageObj.event === "media" &&
            messageObj.media.track === "inbound"
          ) {
            if (
              replayWavFilePath !== undefined &&
              channelData !== undefined &&
              replayPlaybackTime !== undefined &&
              sampleRate !== undefined
            ) {
              const audioFloat32 = channelData[0].slice(
                replayPlaybackTime * sampleRate,
                (replayPlaybackTime + 0.02) * sampleRate,
              );
              const audioUint8MuLaw = new Uint8Array(audioFloat32.length);
              for (let i = 0; i < audioUint8MuLaw.length; i++) {
                audioUint8MuLaw[i] = mulaw.encodeSample(
                  Math.floor(audioFloat32[i] * 32768),
                );
              }
              const audioBase64 = Buffer.from(audioUint8MuLaw.buffer).toString(
                "base64",
              );
              phonic.audioChunk(audioBase64);
              replayPlaybackTime += 0.02;
              if ((replayPlaybackTime + 0.02) * sampleRate >= channelData[0].length) {
                replayPlaybackTime = 0.0;
              }
              ws.send(
                JSON.stringify({
                  event: "media",
                  streamSid: c.get("streamSid"),
                  media: {
                    payload: audioBase64,
                  },
                }),
              );
            } else {
              phonic.audioChunk(messageObj.media.payload);
            }
          } else if (
            messageObj.event === "mark" &&
            messageObj.mark.name === "end_conversation_mark"
          ) {
            twilioClient
              .calls(c.get("callSid"))
              .update({ status: "completed" })
              .then((call) =>
                console.log(`Ended call for ${JSON.stringify(call)}`),
              )
              .catch((err) => {
                console.log("Error ending call:", err);
              });
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
          project: "main",
          input_format: "mulaw_8000",
          system_prompt: `You are a helpful assistant. If you seek to end the call, say "It's time to say goodbye ∎". Saying ∎ will trigger the end of the conversation.`,
          welcome_message: "Hello, how can I help you today?",
          voice_id: "grant",
          output_format: "mulaw_8000",
          // tools: ["natural_conversation_ending"],
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
            c.set("callSid", messageObj.start.callSid);

            phonic.setExternalId(messageObj.start.callSid);
          } else if (messageObj.event === "stop") {
            ws.close();
          } else if (
            messageObj.event === "media" &&
            messageObj.media.track === "inbound"
          ) {
            phonic.audioChunk(messageObj.media.payload);
          } else if (
            messageObj.event === "mark" &&
            messageObj.mark.name === "end_conversation_mark"
          ) {
            twilioClient
              .calls(c.get("callSid"))
              .update({ status: "completed" })
              .then((call) =>
                console.log(`Ended call for ${JSON.stringify(call)}`),
              )
              .catch((err) => {
                console.log("Error ending call:", err);
              });
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

app.post("/webhooks/phonic", async (c) => {
  if (!phonicWebhookSecret) {
    return c.text("Bad Request", 400);
  }

  const rawBody = await c.req.text();
  const wh = new Webhook(phonicWebhookSecret);

  try {
    const payload = wh.verify(rawBody, {
      "svix-id": c.req.header("svix-id") ?? "",
      "svix-timestamp": c.req.header("svix-timestamp") ?? "",
      "svix-signature": c.req.header("svix-signature") ?? "",
    });

    console.log(payload);

    return c.text("OK", 200);
  } catch (error) {
    console.error("Failed to verify webhook:", error);

    return c.text("Bad Request", 400);
  }
});

app.post("/webhooks/phonic-config", async (c) => {
  if (c.req.header("Authorization") !== phonicConfigWebhookAuthorization) {
    return c.text("Bad Request", 400);
  }

  const body =
    (await c.req.json()) as PhonicConfigurationEndpointRequestPayload;
  const response: PhonicConfigurationEndpointResponsePayload = {
    welcome_message: "Hey {{customer_name}}, how can I help you today?",
    system_prompt: `
      ${body.agent.system_prompt}
      Last time customer called about {{subject}} was on 17th of April 2024.
    `.trim(),
    template_variables: {
      customer_name: "Alice",
      subject: "tennis",
    },
  };

  return c.json(response);
});

app.post("/webhooks/phonic-tools/next-appointment", async (c) => {
  if (c.req.header("Authorization") !== phonicConfigWebhookAuthorization) {
    return c.text("Bad Request", 400);
  }

  const body = await c.req.json();

  console.log(body);

  // Do something with the `body` here to construct the response

  return c.json({
    next_appointment: {
      date: "2026-04-17",
      location: "123 Main St, Anytown, USA",
    },
  });
});

const port = 3000;
const server = serve({
  fetch: app.fetch,
  port,
});

injectWebSocket(server);

console.log(`Listening on port ${port}`);
