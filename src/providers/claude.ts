import type { ClaudeModel } from "../agents/types.js";
import { execCli } from "./exec.js";
import type { RunOptions } from "./types.js";

export function runClaude(
  prompt: string,
  model?: ClaudeModel,
  options: RunOptions = {},
): Promise<string> {
  const args = ["-p", prompt];

  if (model) {
    args.push("--model", model);
  }

  return execCli("claude", "claude", args, options);
}
