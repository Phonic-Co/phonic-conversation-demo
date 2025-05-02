import { config } from "dotenv";

config({ path: ".env.local" });

const phonicWebhookSecret = process.env.PHONIC_WEBHOOK_SECRET;

export { phonicWebhookSecret };
