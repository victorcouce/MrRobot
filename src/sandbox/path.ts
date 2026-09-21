/**
 * Jaula de rutas: validación de que una ruta cae dentro de la raíz del
 * worktree, con protección contra symlinks y rutas vetadas como `.git`.
 *
 * Módulo puro, totalmente testeable, sin I/O.
 */

import { resolve, relative, dirname } from "node:path";
import { realpathSync, lstatSync, existsSync } from "node:fs";
import { SandboxViolationError } from "./types.js";

/**
 * Comprueba si una ruta contiene el carácter nulo, que es inválido en
 * nombres de archivos del sistema de archivos.
 */
export function hasNullByte(path: string): boolean {
  return path.includes("\0");
}

/**
 * Navega hasta el ancestro más profundo que existe en el filesystem,
 * comprueba que su realpath cae dentro de `realRoot`, y re-ancla la
 * cola inexistente. Detecta symlinks de directorios padres que escaparían.
 */
function resolveWithSymlinkDetection(
  realRoot: string,
  candidate: string,
): string {
  if (existsSync(candidate)) {
    return realpathSync(candidate);
  }

  // Navegar hacia atrás hasta encontrar un ancestro que exista
  let current = candidate;
  while (current !== dirname(current)) {
    current = dirname(current);
    if (existsSync(current)) {
      break;
    }
  }

  const real = realpathSync(current);
  if (!real.startsWith(realRoot + "/") && real !== realRoot) {
    throw new SandboxViolationError(
      `symlink de directorio escape fuera de la raíz: ${candidate}`,
    );
  }

  // Re-anclar la cola inexistente
  const tail = relative(current, candidate);
  return resolve(real, tail);
}

/**
 * Valida que `candidate` cae dentro de `realRoot`, rechazando `../`, symlinks
 * hacia afuera, `.git`, rutas nulas, y accesos que no sean léxicamente válidos.
 */
export function validatePath(
  realRoot: string,
  candidate: string,
  intent: "read" | "write",
): string {
  if (hasNullByte(candidate)) {
    throw new SandboxViolationError(`ruta contiene \\0: ${candidate}`);
  }

  // Las rutas relativas se resuelven contra la raíz del worktree, no contra el
  // cwd del proceso: si no, `styles.css` apuntaría al repo del orquestador.
  const full = resolveWithSymlinkDetection(realRoot, resolve(realRoot, candidate));

  // Contención léxica
  if (full !== realRoot && !full.startsWith(realRoot + "/")) {
    throw new SandboxViolationError(
      `ruta fuera de la raíz: ${full} (raíz: ${realRoot})`,
    );
  }

  // Veto por segmento: extraer el primer componente bajo la raíz
  const relPath = relative(realRoot, full);
  if (relPath) {
    const firstSegment = relPath.split("/")[0];
    if (firstSegment === ".git") {
      throw new SandboxViolationError(
        `.git está vedado (por seguridad de credenciales)`,
      );
    }
  }

  // En escritura, rechazar si el archivo final existe y es un symlink
  if (intent === "write" && existsSync(full)) {
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) {
      throw new SandboxViolationError(
        `no se puede sobrescribir symlink: ${relPath || full}`,
      );
    }
  }

  return full;
}

/**
 * Valida el comando: rechazar si contiene `/`, `\`, `..` o espacios.
 * Estos caracteres podrían permitir bypass de la allowlist de comandos.
 */
export function validateCommand(command: string): void {
  if (
    command.includes("/") ||
    command.includes("\\") ||
    command.includes("..") ||
    command.includes(" ")
  ) {
    throw new SandboxViolationError(
      `comando no válido: "${command}" (sin /, \\, .., espacios)`,
    );
  }
}
