import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CheckResult } from "./types.js";

const MAX_OUTPUT = 4000;
const MAX_BUFFER = 10 * 1024 * 1024;

export const DEFAULT_CHECK_SCRIPTS = ["typecheck", "build", "test"];

function truncate(value: string): string {
  return value.length > MAX_OUTPUT ? `${value.slice(0, MAX_OUTPUT)}…` : value;
}

export async function detectCheckScripts(dir: string): Promise<string[]> {
  try {
    const raw = await readFile(join(dir, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    const scripts = pkg.scripts ?? {};

    return DEFAULT_CHECK_SCRIPTS.filter((name) => name in scripts);
  } catch {
    return [];
  }
}

function runScript(
  dir: string,
  script: string,
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      "npm",
      ["run", script],
      { cwd: dir, maxBuffer: MAX_BUFFER, encoding: "utf8" },
      (error, stdout, stderr) => {
        resolve({
          success: !error,
          stdout: stdout ?? "",
          stderr: stderr ?? "",
        });
      },
    );
  });
}

export async function runProjectChecks(
  dir: string,
  scripts: string[],
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const script of scripts) {
    const { success, stdout, stderr } = await runScript(dir, script);
    const result: CheckResult = {
      command: `npm run ${script}`,
      success,
    };

    if (stdout.trim()) result.stdout = truncate(stdout.trim());
    if (stderr.trim()) result.stderr = truncate(stderr.trim());

    results.push(result);
  }

  return results;
}
