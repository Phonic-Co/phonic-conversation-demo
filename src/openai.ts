import type { ServerWebSocket } from "bun";
import OpenAI from "openai";
import type { WebSocketData } from "./types";

const openaiApiKey = Bun.env.OPENAI_API_KEY;

if (!openaiApiKey) {
  throw new Error("OPENAI_API_KEY environment variable is not set");
}

export const setupOpenAI = (ws: ServerWebSocket<WebSocketData>) => {
  const openai = new OpenAI();
  const promptLLM = async (prompt: string) => {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "assistant",
          content:
            "You are friendly and very helpful, providing short and to the point answers.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      stream: true,
    });

    ws.data.speaking = true;

    let fullMessage = "";
    let interrupted = false;

    for await (const chunk of stream) {
      // If the user interrupted the AI speech, there is no point to continue collecting this text stream.
      if (!ws.data.speaking) {
        interrupted = true;
        break;
      }

      const textChunk = chunk.choices[0]?.delta?.content || "";

      if (textChunk) {
        fullMessage += textChunk;
        ws.data.phonic.generate(textChunk);
      }
    }

    ws.data.phonic.flush();

    console.log(
      `OpenAI message${interrupted ? " (interrupted by user)" : ""}:`,
      fullMessage,
    );
  };

  ws.data.promptLLM = promptLLM;
};
