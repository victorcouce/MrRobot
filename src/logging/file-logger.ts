import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { formatLogLine } from "../../shared/log-format.js";
import type { ProjectEvent } from "../storage/types.js";

/**
 * Eventos de salida en vivo del agente (stdout/stderr): van por SSE pero no al
 * fichero .log, igual que no se persisten en el event log (ver `task.output`
 * en projects/service.ts). Escribir cada chunk saturaría el fichero sin
 * aportar nada al objetivo de encontrar cuellos de botella (duración por
 * tarea/agente).
 */
const SKIP_TYPES = new Set(["task.output"]);

function logDir(): string {
  return process.env.MRROBOT_LOG_DIR ?? ".mrrobot/logs";
}

export function projectLogPath(projectId: string): string {
  return join(logDir(), `${projectId}.log`);
}

const ensuredDirs = new Set<string>();

async function ensureDir(dir: string): Promise<void> {
  if (ensuredDirs.has(dir)) return;
  await mkdir(dir, { recursive: true });
  ensuredDirs.add(dir);
}

/**
 * Añade una línea al fichero `.log` del proyecto (uno por proyecto, bajo
 * `MRROBOT_LOG_DIR` o `.mrrobot/logs/`). Es un registro temporal en texto
 * plano de lo que hace cada agente y cuánto tarda, pensado para leer/grep-ear
 * y detectar cuellos de botella; la persistencia "real" del evento sigue
 * siendo el event log de `storage`.
 */
export async function appendProjectLog(event: ProjectEvent): Promise<void> {
  if (SKIP_TYPES.has(event.type)) return;

  const file = projectLogPath(event.projectId);

  try {
    await ensureDir(dirname(file));
    await appendFile(file, `${formatLogLine(event)}\n`, "utf8");
  } catch (error) {
    // El log de monitorización es "best effort": un fallo al escribirlo no
    // debe interrumpir la ejecución del proyecto.
    console.error(`No se pudo escribir el log de ${event.projectId}:`, error);
  }
}
