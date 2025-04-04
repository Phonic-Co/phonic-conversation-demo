import { config } from "dotenv";

config({ path: ".env.local" });

const phonicApiKey = process.env.PHONIC_API_KEY as string;

if (!phonicApiKey) {
  throw new Error("PHONIC_API_KEY environment variable is not set");
}

const phonicApiBaseUrl = process.env.PHONIC_API_BASE_URL;

const phonicProjectId = process.env.PHONIC_PROJECT_ID as string;

if (!phonicProjectId) {
  throw new Error("PHONIC_PROJECT_ID environment variable is not set");
}

export { phonicApiBaseUrl, phonicApiKey, phonicProjectId };
