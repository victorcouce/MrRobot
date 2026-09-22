export interface CheckResult {
  command: string;
  success: boolean;
  stdout?: string;
  stderr?: string;
  /** Duración del comando (ms), para medir el coste de cada fase. */
  durationMs?: number;
}
