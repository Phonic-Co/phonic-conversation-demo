import { Phonic } from "phonic";
import { phonicApiBaseUrl, phonicApiKey } from "./phonic-env-vars";

console.log(`Initializing Phonic on base URL: ${phonicApiBaseUrl} with API key: ${phonicApiKey}`);
const phonic = new Phonic(phonicApiKey, {
  baseUrl: phonicApiBaseUrl 
});

export async function createToolIfNotExists(toolConfig: {
  name: string;
  description: string;
  type: "custom_websocket";
  executionMode: "sync" | "async";
  parameters?: Array<{
    type: string;
    name: string;
    description: string;
    isRequired: boolean;
  }>;
}) {
  const existingTool = await phonic.tools.get(toolConfig.name);
  if (existingTool.error) {
    console.log(`Creating tool with config: ${JSON.stringify(toolConfig)}`);
    const newTool = await phonic.tools.create(toolConfig);
    console.log(`Created new tool: ${JSON.stringify(newTool)}`);
    return newTool;
  }
  console.log(`Tool ${JSON.stringify(existingTool)} already exists`);
  return existingTool;
}

export async function upsertAgent(agentConfig: {
  name: string;
  project?: string;
  phoneNumber?: string;
  voiceId?: string;
  systemPrompt?: string;
  welcomeMessage?: string;
  tools?: string[];
}) {
  const existingAgent = await phonic.agents.get(agentConfig.name);

  if (existingAgent.error) {
    const newAgent = await phonic.agents.create(agentConfig);
    console.log(`Created new agent: ${JSON.stringify(newAgent)}`);
    return newAgent;
  }

  console.log(`Agent ${JSON.stringify(existingAgent)} already exists, updating...`);
  const updatedAgent = await phonic.agents.update(agentConfig.name, agentConfig);
  console.log(`Updated agent: ${JSON.stringify(updatedAgent)}`);
  return updatedAgent;
}

export async function setupFileTools() {
  console.log("Setting up file management tools...");

  const listFilesTool = await createToolIfNotExists({
    name: "list_files",
    description: "Lists all files and directories in the current directory",
    type: "custom_websocket",
    executionMode: "sync",
    parameters: []
  });

  const readFileTool = await createToolIfNotExists({
    name: "read_file", 
    description: "Returns the contents of a specified file",
    type: "custom_websocket",
    executionMode: "sync",
    parameters: [
      {
        type: "string",
        name: "filename",
        description: "The name of the file to read",
        isRequired: true
      }
    ]
  });

  const writeFileTool = await createToolIfNotExists({
    name: "write_file",
    description: "Creates a file and writes content to it",
    type: "custom_websocket", 
    executionMode: "async",
    // toolCallOutputTimeoutMs: 60000,
    parameters: [
      {
        type: "string",
        name: "filename",
        description: "The name of the file to create/write",
        isRequired: true
      },
      {
        type: "string", 
        name: "content",
        description: "The content to write to the file",
        isRequired: true
      }
    ]
  });

  console.log("File management tools setup complete!");
  return { listFilesTool, readFileTool, writeFileTool };
}

export async function createGrantAgent() {
  console.log("Creating Grant agent...");

  const grant = await upsertAgent({
    name: "grant",
    project: "main",
    systemPrompt: "You are Grant, a helpful filesystem assistant. You can help users explore, read, and manage files in their current directory. You have access to tools that let you list files, read file contents, and write new files. Always be helpful and explain what you're doing when working with the filesystem.",
    welcomeMessage: "Hi! I'm Grant, your filesystem assistant. I can help you explore and manage files in your directory. What would you like to do?",
    voiceId: "grant",
    tools: ["list_files", "read_file", "write_file", "natural_conversation_ending"]
  });

  console.log("Grant agent created successfully!");
  return grant;
}

export async function initializePhonicSetup() {
  console.log("Initializing Phonic setup...");
  
  await setupFileTools();
  await createGrantAgent();
  
  console.log("Phonic setup completed!");
}
