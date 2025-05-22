import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";
import { setupPhonic } from "./phonic";
import type { TwilioWebSocketMessage } from "./types";
// import { getSystemPrompt } from "./prompt";

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

const welcome_messages = {
  "rockstar": "Hi, this is Emma. Thanks for calling Rockstar. How can I help you today?",
  "cvent": "Hi, this is Anna. Thanks for calling Sea vent. How can I help you today?",
  "crmspot": "Hi, this is Emma. Thanks for calling CRM Spot. How can I help you today?",
  "rockefeller": "Hi, this is Emma. Thanks for calling the Rockefeller Center. How can I help you today?",
}

const recieving_number_to_customer_map = {
  "+15168537827": "rockstar",
  "+15853674664": "rockefeller",
  "+16822228368": "cvent",
  "+15413293276": "crmspot",
  "+12134637625": "rockefeller",
}

app.post("/inbound", async (c) => {
  // Print the POST request body
  const body = await c.req.parseBody();
  console.log("FROM PHONE NUMBER:", body.From);
  const inboundFromPhoneNumber = body.From as string;
  const inboundRecievingPhoneNumber = body.To as string;

  const customer = recieving_number_to_customer_map[inboundRecievingPhoneNumber as keyof typeof recieving_number_to_customer_map] || "cvent";

  const url = new URL(c.req.url);
  const response = new VoiceResponse();

  const stream = response.connect().stream({
    url: `wss://${url.host}/inbound-ws`,
  });

  stream.parameter({
    name: "phoneNumber",
    value: inboundFromPhoneNumber,
  });

  console.log("CUSTOMER:", customer);

  stream.parameter({
    name: "customer",
    value: customer,
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

            // @ts-ignore
            const phoneNumber = messageObj.start.customParameters.phoneNumber;
            console.log("[INBOUND-WS] PHONE NUMBER:", phoneNumber);

            // @ts-ignore
            const customer = messageObj.start.customParameters.customer;

            phonic = setupPhonic(ws, c, {
              project: "maven",
              input_format: "mulaw_8000",
              welcome_message: welcome_messages[customer as keyof typeof welcome_messages] || "Welcome to Phonic! How can I help you today?",
              voice_id: "greta",
              system_prompt: "",
              output_format: "mulaw_8000",
              vad_threshold: 0.5,
              experimental_params: {
                phone_number: phoneNumber,
                customer: customer,
              },
            });

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
