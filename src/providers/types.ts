import type { HarnessConfig } from "../harness/types.js";
import type { AgentSpec } from "../agents/types.js";

export interface RunOptions {
  cwd?: string;
  signal?: AbortSignal;
  /** Recibe stdout/stderr en vivo, a medida que el CLI los emite. */
  onOutput?: (chunk: string) => void;
  /**
   * Nivel de acceso al disco del CLI. Los roles de orquestación (planner,
   * reviewer, supervisor) no deben modificar el repo, así que corren en
   * `read-only`; el worker escribe en su worktree y usa `workspace-write`
   * (valor por defecto). Codex lo traduce a `--sandbox` y Claude a
   * `--permission-mode`.
   */
  sandbox?: "read-only" | "workspace-write";
  /**
   * Cómo ejecuta un proveedor de API (DeepSeek). "text": una sola llamada de
   * chat, sin acceso a disco (comportamiento histórico). "agentic": bucle de
   * herramientas de MrRobot dentro de un sandbox anclado en `cwd`. Por defecto
   * "text": solo el runner de tareas lo sube a "agentic". Los CLIs (Codex,
   * Claude) lo ignoran: traen su propio bucle.
   */
  mode?: "text" | "agentic";
  harness?: HarnessConfig;
  agent?: AgentSpec;
  prompt?: string;
}
