import type { ClaudeModel } from "../agents/types.js";
import { execCli } from "./exec.js";

export function runClaude(prompt: string, model?: ClaudeModel): Promise<string> {
  const args = ["-p", prompt];

  if (model) {
    args.push("--model", model);
  }

  return execCli("claude", "claude", args);
}
