import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { homedir } from "node:os";

const MAX_BUFFER = 1024 * 1024;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function git(args: string[], cwd?: string): Promise<string> {
  return new Promise((done, fail) => {
    execFile(
      "git",
      args,
      {
        cwd,
        maxBuffer: MAX_BUFFER,
        encoding: "utf8",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      },
      (error, stdout, stderr) => {
        if (error) {
          fail(new Error(stderr.trim() || error.message));
          return;
        }

        done(stdout.trim());
      },
    );
  });
}

export interface FolderCheck {
  /** Ruta absoluta ya expandida, la que se usaría al crear el proyecto. */
  path: string;
  exists: boolean;
  /** La carpeta no existe pero su padre sí: se puede crear. */
  creatable: boolean;
  isRepo: boolean;
  /** Raíz del repositorio, que puede ser un ancestro de la carpeta indicada. */
  root?: string;
  /** Rama base sobre la que trabajarían los agentes. */
  branch?: string;
  dirty?: boolean;
  error?: string;
}

export function expandPath(input: string): string {
  const trimmed = input.trim();

  if (trimmed === "~") {
    return homedir();
  }

  const expanded = trimmed.startsWith("~/")
    ? resolve(homedir(), trimmed.slice(2))
    : trimmed;

  return isAbsolute(expanded) ? expanded : resolve(expanded);
}

async function parentExists(path: string): Promise<boolean> {
  try {
    const parent = resolve(path, "..");
    return (await stat(parent)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Comprueba una carpeta antes de crear el proyecto: si existe, si ya es un
 * repositorio git y sobre qué rama se trabajaría. Nunca lanza: el resultado
 * describe lo que hay para que la UI lo muestre tal cual.
 */
export async function checkFolder(input: string): Promise<FolderCheck> {
  const path = expandPath(input);

  let isDirectory = false;

  try {
    isDirectory = (await stat(path)).isDirectory();
  } catch {
    isDirectory = false;
  }

  if (!isDirectory) {
    const creatable = await parentExists(path);

    return {
      path,
      exists: false,
      creatable,
      isRepo: false,
      ...(creatable
        ? {}
        : { error: "La carpeta no existe y su carpeta padre tampoco." }),
    };
  }

  try {
    const inside = await git(["rev-parse", "--is-inside-work-tree"], path);

    if (inside !== "true") {
      return { path, exists: true, creatable: false, isRepo: false };
    }
  } catch {
    // No es un repo: se inicializará al crear el proyecto.
    return { path, exists: true, creatable: false, isRepo: false };
  }

  const check: FolderCheck = {
    path,
    exists: true,
    creatable: false,
    isRepo: true,
  };

  try {
    check.root = await git(["rev-parse", "--show-toplevel"], path);
  } catch (error) {
    check.error = messageOf(error);
    return check;
  }

  try {
    const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"], path);
    // En un repo recién inicializado HEAD todavía no apunta a nada.
    if (branch && branch !== "HEAD") {
      check.branch = branch;
    }
  } catch {
    // Sin commits aún: no hay rama que mostrar.
  }

  try {
    check.dirty = (await git(["status", "--porcelain"], path)).length > 0;
  } catch {
    // El estado es informativo; si falla, se omite.
  }

  return check;
}

export interface RemoteCheck {
  url: string;
  /** Si se llegó a contactar con el remoto. */
  checked: boolean;
  ok: boolean;
  /** Falta GITHUB_TOKEN para poder comprobarlo. */
  needsToken: boolean;
  error?: string;
}

function isGithubHttps(url: string): boolean {
  return /^https:\/\/github\.com\//i.test(url);
}

/**
 * Verifica el remoto con `git ls-remote` antes de crear el proyecto. Sin
 * GITHUB_TOKEN no se puede comprobar un remoto de GitHub, y se dice.
 */
export async function checkRemote(input: string): Promise<RemoteCheck> {
  const url = input.trim();

  if (!url) {
    return { url, checked: false, ok: false, needsToken: false };
  }

  if (isGithubHttps(url) && !process.env.GITHUB_TOKEN) {
    return {
      url,
      checked: false,
      ok: false,
      needsToken: true,
      error: "Define GITHUB_TOKEN para comprobar el remoto y poder publicar.",
    };
  }

  const auth = process.env.GITHUB_TOKEN
    ? [
        "-c",
        "credential.helper=",
        "-c",
        'credential.helper=!f() { echo username=x-access-token; echo password="$GITHUB_TOKEN"; }; f',
      ]
    : [];

  try {
    await git([...auth, "ls-remote", "--exit-code", url]);
    return { url, checked: true, ok: true, needsToken: false };
  } catch (error) {
    return {
      url,
      checked: true,
      ok: false,
      needsToken: false,
      error: messageOf(error),
    };
  }
}
