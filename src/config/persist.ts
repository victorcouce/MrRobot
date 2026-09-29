import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * Ajustes que sobreviven a un reinicio del backend: la config global tal como
 * llega por la API (se vuelve a validar al cargarla) y si el usuario ya pasó
 * por el asistente de configuración inicial.
 */
export interface PersistedSettings {
  config?: Record<string, unknown>;
  onboardingCompletedAt?: string;
}

/** Fichero `.env` que lee el backend al arrancar (`--env-file-if-exists`). */
export function envFilePath(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.MRROBOT_ENV_FILE ?? ".env");
}

function formatEnvValue(value: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error("El valor no puede contener saltos de línea.");
  }
  // Comillas solo si hacen falta: espacios, # o comillas cambiarían el valor.
  return /^[A-Za-z0-9_\-./:@+=,]*$/.test(value)
    ? value
    : `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Añade o reemplaza `key=value` en el fichero `.env`, conservando el resto de
 * líneas y comentarios. Lo crea si no existe, legible solo por su dueño porque
 * guarda secretos.
 */
export async function upsertEnvVar(
  path: string,
  key: string,
  value: string,
): Promise<void> {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`Nombre de variable no válido: ${key}`);
  }

  let current = "";
  try {
    current = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const line = `${key}=${formatEnvValue(value)}`;
  const pattern = new RegExp(`^\\s*(export\\s+)?${key}\\s*=`);
  const lines = current.length > 0 ? current.replace(/\n$/, "").split("\n") : [];
  let replaced = false;

  const next = lines.flatMap((existing) => {
    if (!pattern.test(existing)) return [existing];
    if (replaced) return [];
    replaced = true;
    return [line];
  });
  if (!replaced) next.push(line);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${next.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

export async function loadSettings(path: string): Promise<PersistedSettings> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as PersistedSettings)
      : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    // Un fichero corrupto no debe impedir que arranque el backend.
    console.warn(
      `[config] No se pudo leer ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {};
  }
}

export async function saveSettings(
  path: string,
  settings: PersistedSettings,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  // Escritura atómica: un corte a medias no deja el JSON truncado.
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

/**
 * Aplica la variable al proceso del backend y la guarda en `.env` para que
 * sobreviva a un reinicio. Devuelve el error de escritura, si lo hubo: la
 * variable sigue aplicada aunque no se haya podido guardar.
 */
export async function applyAndPersistEnvVar(
  key: string,
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ persisted: boolean; error?: string }> {
  env[key] = value;
  try {
    await upsertEnvVar(envFilePath(env), key, value);
    return { persisted: true };
  } catch (error) {
    return {
      persisted: false,
      error: `Aplicada, pero no se pudo guardar en .env: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
