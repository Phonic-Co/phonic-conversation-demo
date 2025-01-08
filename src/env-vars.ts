import { config } from "dotenv";

config({ path: ".env.local" });

const deepgramApiKey = process.env.DEEPGRAM_API_KEY as string;

if (!deepgramApiKey) {
  throw new Error("DEEPGRAM_API_KEY environment variable is not set");
}

const openaiApiKey = process.env.OPENAI_API_KEY as string;

if (!openaiApiKey) {
  throw new Error("OPENAI_API_KEY environment variable is not set");
}

const phonicApiKey = process.env.PHONIC_API_KEY as string;

if (!phonicApiKey) {
  throw new Error("PHONIC_API_KEY environment variable is not set");
}

const phonicApiBaseUrl = process.env.PHONIC_API_BASE_URL;

export { deepgramApiKey, openaiApiKey, phonicApiBaseUrl, phonicApiKey };
