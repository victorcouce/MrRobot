export interface CheckResult {
  command: string;
  success: boolean;
  stdout?: string;
  stderr?: string;
}
