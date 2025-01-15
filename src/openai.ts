import type { Context } from "hono";
import type { WSContext } from "hono/ws";
import OpenAI from "openai";
import { openaiApiKey } from "./env-vars";

export const setupOpenAI = (ws: WSContext, c: Context) => {
  const openai = new OpenAI({ apiKey: openaiApiKey });
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

    c.set("speaking", true);

    let fullMessage = "";
    let interrupted = false;

    for await (const chunk of stream) {
      // If the user interrupted the AI speech, there is no point to continue collecting this text stream.
      if (!c.get("speaking")) {
        interrupted = true;
        break;
      }

      const textChunk = chunk.choices[0]?.delta?.content || "";

      if (textChunk) {
        fullMessage += textChunk;
        c.get("phonic").generate(textChunk);
      }
    }

    if (!interrupted) {
      c.get("phonic").flush();
    }

    console.log(
      `OpenAI message${interrupted ? " (interrupted by user)" : ""}:`,
      fullMessage,
    );
  };

  c.set("promptLLM", promptLLM);
};
