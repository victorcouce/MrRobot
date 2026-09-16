import { execCli } from "./exec.js";

export function runCodex(prompt: string): Promise<string> {
  return execCli("codex", "codex", [
    "exec",
    "--sandbox",
    "workspace-write",
    prompt,
  ]);
}
