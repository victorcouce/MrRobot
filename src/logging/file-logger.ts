import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { formatLogLine, formatTaskOutputLines } from "../../shared/log-format.js";
import type { ProjectEvent } from "../storage/types.js";

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
 * Añade una o más líneas al fichero `.log` del proyecto (uno por proyecto,
 * bajo `MRROBOT_LOG_DIR` o `.mrrobot/logs/`). Es un registro temporal en
 * texto plano de lo que hace cada agente, con qué herramientas y cuánto
 * tarda, pensado para leer/grep-ear y detectar cuellos de botella; la
 * persistencia "real" del evento sigue siendo el event log de `storage`
 * (`task.output` es la excepción: solo vive aquí y en el SSE, ver
 * `projects/service.ts`).
 */
export async function appendProjectLog(event: ProjectEvent): Promise<void> {
  const lines =
    event.type === "task.output" ? formatTaskOutputLines(event) : [formatLogLine(event)];

  if (!lines || lines.length === 0) return;

  const file = projectLogPath(event.projectId);

  try {
    await ensureDir(dirname(file));
    await appendFile(file, `${lines.join("\n")}\n`, "utf8");
  } catch (error) {
    // El log de monitorización es "best effort": un fallo al escribirlo no
    // debe interrumpir la ejecución del proyecto.
    console.error(`No se pudo escribir el log de ${event.projectId}:`, error);
  }
}
