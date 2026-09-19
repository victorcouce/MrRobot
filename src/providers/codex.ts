import { execCli } from "./exec.js";
import type { RunOptions } from "./types.js";

export function runCodex(
  prompt: string,
  options: RunOptions = {},
): Promise<string> {
  const sandbox = options.sandbox ?? "workspace-write";

  return execCli(
    "codex",
    "codex",
    ["exec", "--sandbox", sandbox, prompt],
    options,
  );
}
