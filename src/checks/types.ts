export interface CheckResult {
  command: string;
  success: boolean;
  stdout?: string;
  stderr?: string;
  /** Duración del comando (ms), para medir el coste de cada fase. */
  durationMs?: number;
  /**
   * `npm run test` falló solo porque aún no hay tests (la carpeta o los
   * ficheros que busca el runner no existen). Se da por bueno: ver
   * `isNoTestsFailure` en `checks.ts`.
   */
  noTests?: boolean;
}
