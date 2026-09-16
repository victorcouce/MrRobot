import { execCli } from "./exec.js";
import type { RunOptions } from "./types.js";

export function runCodex(
  prompt: string,
  options: RunOptions = {},
): Promise<string> {
  return execCli(
    "codex",
    "codex",
    ["exec", "--sandbox", "workspace-write", prompt],
    options,
  );
}
