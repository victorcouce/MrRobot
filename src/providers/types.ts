export interface RunOptions {
  cwd?: string;
  signal?: AbortSignal;
  /** Recibe stdout/stderr en vivo, a medida que el CLI los emite. */
  onOutput?: (chunk: string) => void;
  /**
   * Nivel de acceso al disco del CLI de Codex. Los roles de orquestación
   * (planner, reviewer, supervisor) no deben modificar el repo, así que corren
   * en `read-only`; el worker escribe en su worktree y usa `workspace-write`.
   */
  sandbox?: "read-only" | "workspace-write";
}
