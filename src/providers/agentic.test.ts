import assert from "node:assert/strict";
import { test } from "node:test";
import type OpenAI from "openai";
import { OpenAIChatClient } from "./agentic.js";
import { withUsageMeter } from "../agents/usage.js";

test("OpenAIChatClient pide el modelo configurado y registra el uso", async () => {
  let requestedModel: string | undefined;
  const fake = {
    chat: {
      completions: {
        create: async (req: { model: string }) => {
          requestedModel = req.model;
          return {
            choices: [{ message: { content: "hola" } }],
            usage: { prompt_tokens: 20, completion_tokens: 3, prompt_cache_hit_tokens: 16 },
          };
        },
      },
    },
  } as unknown as OpenAI;

  const client = new OpenAIChatClient(fake, "deepseek / deepseek-v4-pro", "deepseek-v4-pro");
  const metered = await withUsageMeter(() =>
    client.complete({ messages: [{ role: "user", content: "hola" }], tools: [] }),
  );

  assert.equal(requestedModel, "deepseek-v4-pro");
  assert.deepEqual(metered.usage, { input: 20, cachedInput: 16, output: 3, calls: 1 });
});
