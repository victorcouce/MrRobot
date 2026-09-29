import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  detectPackageManager,
  findProjectRoot,
  type PackageJsonLike,
} from "../preview/preview.js";

/**
 * Cada intento de cada tarea corre en un worktree recién creado, que nace sin
 * `node_modules` (no está commiteado). Instalar desde cero ahí es, con
 * diferencia, lo más caro del ciclo: domina el tiempo del agente (que instala
 * para poder trabajar) y el de los checks.
 *
 * Este módulo mantiene un almacén de `node_modules` ya instalados, indexado por
 * el contenido del lockfile. Sembrar un worktree es entonces una copia por
 * enlaces duros (centésimas de segundo) en vez de una instalación completa, y
 * el `npm install` posterior —que se sigue ejecutando porque "instala sin
 * errores" es un criterio de aceptación habitual— encuentra el árbol resuelto y
 * termina en segundos.
 *
 * Es la misma técnica que usa pnpm con su store global.
 */

const LOCKFILES = ["pnpm-lock.yaml", "yarn.lock", "package-lock.json"];

/** Campos de package.json que determinan qué se instala. */
const MANIFEST_KEYS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "overrides",
  "resolutions",
  "packageManager",
];

/**
 * Directorio con el `package.json` del proyecto: la raíz o, si los agentes
 * dejaron la app en una subcarpeta (p. ej. `kanban-app/`), esa subcarpeta. Sin
 * esto el almacén nunca se usaba en esos proyectos y cada tarea reinstalaba.
 */
export function findPackageRoot(dir: string): Promise<string> {
  return findProjectRoot(dir, ["package.json"]);
}

export function depsStoreRoot(): string {
  return (
    process.env.MRROBOT_DEPS_CACHE ??
    join(homedir(), ".cache", "mrrobot", "deps")
  );
}

/**
 * Entorno para instalar. Solo se quita trabajo que no aporta nada al check
 * (auditoría, mensajes de financiación, barra de progreso). La caché de
 * paquetes se deja como esté: la de npm ya es global.
 *
 * En concreto no se fuerza `prefer-offline`. Resolvía más rápido, pero hace que
 * npm use los metadatos cacheados aunque estén obsoletos y falle con
 * `ETARGET / No matching version found` en dependencias publicadas después de
 * esa caché. Un check que falla sin motivo dispara un ciclo de review/fix
 * completo, mucho más caro que los segundos que ahorraba.
 */
export function installEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    npm_config_fund: "false",
    npm_config_audit: "false",
    npm_config_progress: "false",
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson(dir: string): Promise<PackageJsonLike | undefined> {
  try {
    return JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    ) as PackageJsonLike;
  } catch {
    return undefined;
  }
}

/**
 * Identidad del árbol de dependencias: el lockfile si lo hay (describe el árbol
 * exacto) y, si no, los campos de package.json que deciden qué se instala. El
 * resto del manifiesto (nombre, versión, scripts) no cambia lo instalado, así
 * que no entra en la clave: dos tareas del mismo proyecto comparten entrada.
 */
export async function dependencyKey(dir: string): Promise<string | undefined> {
  const pkg = await readPackageJson(dir);

  if (!pkg) {
    return undefined;
  }

  const manager = await detectPackageManager(dir, pkg);
  const hash = createHash("sha256").update(manager).update("\0");

  for (const lockfile of LOCKFILES) {
    try {
      hash.update(lockfile).update("\0");
      hash.update(await readFile(join(dir, lockfile), "utf8"));
      return `${manager}-${hash.digest("hex").slice(0, 24)}`;
    } catch {
      // Sin ese lockfile; se prueba el siguiente.
    }
  }

  const manifest = pkg as Record<string, unknown>;
  for (const key of MANIFEST_KEYS) {
    hash.update(key).update("\0");
    hash.update(JSON.stringify(manifest[key] ?? null));
  }

  return `${manager}-${hash.digest("hex").slice(0, 24)}`;
}

function run(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs }, (error) => {
      resolve(!error);
    });
  });
}

/**
 * Copia `from` en `to` enlazando los archivos en vez de duplicarlos. Es lo que
 * hace barata la siembra: un `node_modules` de cientos de MB se "copia" en
 * décimas de segundo. Si el enlace duro no es posible (otro sistema de
 * archivos, Windows), cae a una copia normal, que sigue siendo mucho más rápida
 * que instalar.
 */
async function copyTree(from: string, to: string): Promise<boolean> {
  if (process.platform === "win32") {
    return run("robocopy", [from, to, "/E", "/NFL", "/NDL", "/NJH", "/NJS"], 300_000);
  }

  if (await run("cp", ["-al", from, to], 300_000)) {
    return true;
  }

  await rm(to, { recursive: true, force: true });
  return run("cp", ["-a", from, to], 300_000);
}

/**
 * `runTask` commitea el worktree con `git add -A`, y un repo recién creado por
 * `prepareProjectRepo` no trae `.gitignore`: sin esto, el `node_modules`
 * sembrado entraría en el commit de la tarea y se propagaría por los
 * cherry-pick de integración. Un `.gitignore` con `*` dentro de `node_modules`
 * lo excluye entero, a sí mismo incluido, sin tocar el `.gitignore` del
 * proyecto. Si el proyecto ya ignora `node_modules`, es inocuo.
 */
async function ignoreDependencies(target: string): Promise<void> {
  try {
    await writeFile(join(target, ".gitignore"), "*\n", { flag: "wx" });
  } catch {
    // Ya existe: sirve igual.
  }
}

export type PrimeOutcome = "hit" | "miss" | "present" | "skip";

/**
 * Deja `node_modules` listo en `dir` a partir del almacén, si hay una entrada
 * para su lockfile. Nunca lanza: si algo falla, el worktree se queda como
 * estaba y la instalación normal se encarga.
 */
export async function primeDependencies(
  worktree: string,
): Promise<PrimeOutcome> {
  try {
    const dir = await findPackageRoot(worktree);
    const target = join(dir, "node_modules");

    if (await exists(target)) {
      return "present";
    }

    const key = await dependencyKey(dir);

    if (!key) {
      return "skip";
    }

    const source = join(depsStoreRoot(), key);

    if (!(await exists(source))) {
      return "miss";
    }

    const staging = join(dir, `.node_modules-${process.pid}-${Date.now()}`);

    if (!(await copyTree(source, staging))) {
      await rm(staging, { recursive: true, force: true });
      return "skip";
    }

    try {
      await rename(staging, target);
    } catch {
      // Otro proceso llegó antes: su árbol sirve igual.
      await rm(staging, { recursive: true, force: true });
      await ignoreDependencies(target);
      return "present";
    }

    await ignoreDependencies(target);

    return "hit";
  } catch {
    return "skip";
  }
}

/**
 * Guarda el `node_modules` de `dir` en el almacén si aún no hay entrada para su
 * lockfile, para que los siguientes worktrees lo reciban sembrado. Devuelve si
 * escribió una entrada nueva. Nunca lanza.
 */
export async function saveDependencies(worktree: string): Promise<boolean> {
  try {
    const dir = await findPackageRoot(worktree);
    const source = join(dir, "node_modules");

    if (!(await exists(source))) {
      return false;
    }

    const key = await dependencyKey(dir);

    if (!key) {
      return false;
    }

    const root = depsStoreRoot();
    const target = join(root, key);

    if (await exists(target)) {
      return false;
    }

    await mkdir(root, { recursive: true });

    // Se escribe aparte y se renombra: el rename es atómico, así que dos tareas
    // guardando a la vez nunca dejan una entrada a medias en el almacén.
    const staging = join(root, `.tmp-${process.pid}-${Date.now()}`);

    if (!(await copyTree(source, staging))) {
      await rm(staging, { recursive: true, force: true });
      return false;
    }

    await ignoreDependencies(staging);

    try {
      await rename(staging, target);
      return true;
    } catch {
      await rm(staging, { recursive: true, force: true });
      return false;
    }
  } catch {
    return false;
  }
}
