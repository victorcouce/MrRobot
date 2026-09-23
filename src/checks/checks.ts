import { execFile, spawn, type ChildProcess } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  detectPackageManager,
  parsePreviewUrl,
  pickPreviewScript,
  runCommand,
  type PackageJsonLike,
} from "../preview/preview.js";
import {
  installEnv,
  primeDependencies,
  saveDependencies,
} from "./deps-store.js";
import type { CheckResult } from "./types.js";

const MAX_OUTPUT = 4000;
const MAX_BUFFER = 10 * 1024 * 1024;
/** Margen para que el servidor de desarrollo imprima su URL antes de darlo por fallido. */
const DEV_SMOKE_TIMEOUT_MS = 15000;

export const DEFAULT_CHECK_SCRIPTS = ["typecheck", "build", "test"];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Asegura que el worktree de checks tenga dependencias instaladas. Sin esto,
 * `npm run typecheck|build|test` falla porque `node_modules` no está commiteado
 * y el worktree nace limpio desde el commit de la tarea.
 */
export async function ensureDependencies(dir: string): Promise<void> {
  if (await exists(join(dir, "node_modules"))) {
    return;
  }

  await primeDependencies(dir);

  if (await exists(join(dir, "node_modules"))) {
    return;
  }

  const install = await runInstallCheck(dir);

  if (install && !install.success) {
    throw new Error(
      `"${install.command}" falló: ${install.stderr?.trim() ?? "error desconocido"}`,
    );
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

function killProcessTree(child: ChildProcess | undefined): void {
  if (!child?.pid) return;

  try {
    if (process.platform === "win32") {
      child.kill();
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // El proceso ya terminó.
    }
  }
}

/**
 * Ejecuta el gestor de paquetes y devuelve el resultado como check. A
 * diferencia de `ensureDependencies`, no se salta la instalación aunque exista
 * `node_modules`: el criterio "npm install instala sin errores" solo se puede
 * verificar ejecutándolo. Devuelve `undefined` si no hay package.json.
 */
export async function runInstallCheck(
  dir: string,
): Promise<CheckResult | undefined> {
  const pkg = await readPackageJson(dir);

  if (!pkg) {
    return undefined;
  }

  const manager = await detectPackageManager(dir, pkg);

  // Sembrar antes de instalar convierte la instalación en una verificación
  // barata: npm encuentra el árbol ya resuelto en vez de bajarlo entero.
  await primeDependencies(dir);

  const startedAt = Date.now();
  const result = await new Promise<CheckResult>((resolve) => {
    execFile(
      manager,
      ["install"],
      {
        cwd: dir,
        maxBuffer: MAX_BUFFER,
        encoding: "utf8",
        env: installEnv(),
      },
      (error, stdout, stderr) => {
        const outcome: CheckResult = {
          command: `${manager} install`,
          success: !error,
          durationMs: Date.now() - startedAt,
        };

        if (stdout.trim()) outcome.stdout = truncate(stdout.trim());
        if (stderr.trim()) outcome.stderr = truncate(stderr.trim());

        resolve(outcome);
      },
    );
  });

  if (result.success) {
    // El primer worktree que instala paga el coste completo y deja el árbol en
    // el almacén; los siguientes lo reciben ya hecho.
    await saveDependencies(dir);
  }

  return result;
}

/**
 * Arranca el servidor de desarrollo (`dev`/`start`/`serve`/`preview`), espera a
 * que imprima una URL local y lo mata. Verifica de verdad que "npm run dev
 * levanta un servidor" en vez de asumirlo. Devuelve `undefined` si no hay
 * script de arranque.
 */
export async function runDevSmokeCheck(
  dir: string,
): Promise<CheckResult | undefined> {
  const pkg = await readPackageJson(dir);

  if (!pkg) {
    return undefined;
  }

  const script = pickPreviewScript(pkg);

  if (!script) {
    return undefined;
  }

  const manager = await detectPackageManager(dir, pkg);
  const command = runCommand(manager, script);

  return new Promise<CheckResult>((resolve) => {
    const child = spawn(command, {
      cwd: dir,
      shell: true,
      detached: process.platform !== "win32",
      env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (success: boolean, detail?: string): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      killProcessTree(child);

      const result: CheckResult = { command, success };
      const text = `${output}${detail ?? ""}`.trim();

      if (text) {
        if (success) result.stdout = truncate(text);
        else result.stderr = truncate(text);
      }

      resolve(result);
    };

    const onData = (chunk: Buffer): void => {
      const text = chunk.toString("utf8");
      output = (output + text).slice(-MAX_OUTPUT * 2);

      if (parsePreviewUrl(text)) {
        finish(true);
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    child.on("error", (error) => finish(false, error.message));
    child.on("exit", (code) => {
      if (!settled) {
        finish(
          false,
          `El servidor de desarrollo terminó antes de arrancar (code=${code ?? "null"}).`,
        );
      }
    });

    timer = setTimeout(
      () =>
        finish(
          false,
          `Timeout: el servidor de desarrollo no arrancó en ${DEV_SMOKE_TIMEOUT_MS} ms.`,
        ),
      DEV_SMOKE_TIMEOUT_MS,
    );
  });
}

// npm, tsc y los runners de tests escriben el error y el resumen al final.
function truncate(value: string): string {
  return value.length > MAX_OUTPUT ? `…${value.slice(-MAX_OUTPUT)}` : value;
}

export async function detectCheckScripts(dir: string): Promise<string[]> {
  try {
    const raw = await readFile(join(dir, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    const scripts = pkg.scripts ?? {};

    return DEFAULT_CHECK_SCRIPTS.filter((name) => name in scripts);
  } catch {
    return [];
  }
}

function runScript(
  dir: string,
  script: string,
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      "npm",
      ["run", script],
      { cwd: dir, maxBuffer: MAX_BUFFER, encoding: "utf8" },
      (error, stdout, stderr) => {
        resolve({
          success: !error,
          stdout: stdout ?? "",
          stderr: stderr ?? "",
        });
      },
    );
  });
}

/**
 * Mensajes con los que los runners de tests fallan cuando no encuentran ningún
 * test: `node --test <dir>` con la carpeta aún inexistente, Vitest y Jest.
 */
const NO_TESTS_PATTERNS: RegExp[] = [
  /^Could not find '[^']+'$/m,
  /^No test files found/m,
  /^No tests found/m,
];

/**
 * El check de tests corre en todas las tareas, también en el scaffolding que
 * deja `"test": "node --test tests/"` antes de que otra tarea cree `tests/`.
 * Tratarlo como fallo rechazaba una tarea correcta y gastaba un ciclo de fix
 * (TASK-001 de la calculadora, 23-09). Solo cuenta si no se ejecutó ningún
 * test: un fallo real imprime el resumen del runner y no casa.
 */
export function isNoTestsFailure(output: string): boolean {
  if (/^\s*(?:ℹ|#)\s*tests\s+[1-9]/m.test(output)) return false;
  return NO_TESTS_PATTERNS.some((pattern) => pattern.test(output));
}

async function runCheck(dir: string, script: string): Promise<CheckResult> {
  const startedAt = Date.now();
  const run = await runScript(dir, script);
  const { stdout, stderr } = run;
  const noTests =
    !run.success && script === "test" && isNoTestsFailure(`${stdout}\n${stderr}`);
  const result: CheckResult = {
    command: `npm run ${script}`,
    success: run.success || noTests,
    durationMs: Date.now() - startedAt,
  };

  if (noTests) result.noTests = true;

  if (stdout.trim()) result.stdout = truncate(stdout.trim());
  if (stderr.trim()) result.stderr = truncate(stderr.trim());

  return result;
}

/**
 * Ejecuta los checks en paralelo salvo `build` y `test`, que se mantienen en
 * orden (test puede necesitar los artefactos del build). El resto (typecheck,
 * lint…) corre en paralelo con esa cadena. Los resultados se devuelven en el
 * orden original de `scripts`.
 */
export async function runProjectChecks(
  dir: string,
  scripts: string[],
): Promise<CheckResult[]> {
  if (scripts.length <= 1) {
    return Promise.all(scripts.map((script) => runCheck(dir, script)));
  }

  const ordered = scripts.filter(
    (script) => script === "build" || script === "test",
  );
  const concurrent = scripts.filter(
    (script) => script !== "build" && script !== "test",
  );

  const byScript = new Map<string, CheckResult>();

  await Promise.all([
    (async () => {
      for (const script of ordered) {
        byScript.set(script, await runCheck(dir, script));
      }
    })(),
    ...concurrent.map(async (script) => {
      byScript.set(script, await runCheck(dir, script));
    }),
  ]);

  return scripts.map((script) => byScript.get(script) as CheckResult);
}
