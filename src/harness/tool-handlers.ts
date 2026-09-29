/**
 * Manejadores de herramientas para el harness.
 * Cada función maneja_<nombre> recibe sandbox y argumentos, devuelve resultado o lanza.
 */

import type { Sandbox } from "../sandbox/types.js";

interface ListFilesArgs {
  path?: string;
  depth?: number;
}

export async function handle_list_files(
  sandbox: Sandbox,
  args: unknown,
): Promise<{ entries: Array<{ path: string; type: string; size?: number }> }> {
  const { path = ".", depth = 1 } = (args as ListFilesArgs) || {};
  const result = await sandbox.list(path, depth);
  return { entries: result.entries };
}

interface ReadFileArgs {
  path: string;
  start_line?: number;
  max_lines?: number;
}

export async function handle_read_file(
  sandbox: Sandbox,
  args: unknown,
): Promise<{ content: string; lines: number; truncated: boolean }> {
  const { path, start_line, max_lines } = (args as ReadFileArgs) || {};
  if (!path) throw new Error("path requerido en read_file");

  const result = await sandbox.read(path, {
    ...(start_line !== undefined ? { startLine: start_line } : {}),
    ...(max_lines !== undefined ? { maxLines: max_lines } : {}),
  });
  return result;
}

interface WriteFileArgs {
  path: string;
  content: string;
}

export async function handle_write_file(
  sandbox: Sandbox,
  args: unknown,
): Promise<{ bytes: number; created: boolean; message: string }> {
  const { path, content } = (args as WriteFileArgs) || {};
  if (!path) throw new Error("path requerido en write_file");
  if (typeof content !== "string") throw new Error("content debe ser texto");

  const result = await sandbox.write(path, content);
  return {
    ...result,
    message: result.created
      ? `${result.bytes} B, creado`
      : `${result.bytes} B, sobrescrito`,
  };
}

interface EditFileArgs {
  path: string;
  find: string;
  replace: string;
}

export async function handle_edit_file(
  sandbox: Sandbox,
  args: unknown,
): Promise<{ bytes: number; message: string }> {
  const { path, find, replace } = (args as EditFileArgs) || {};
  if (!path) throw new Error("path requerido en edit_file");
  if (!find) throw new Error("find requerido en edit_file");
  if (replace === undefined) throw new Error("replace requerido en edit_file");

  // Leer el archivo
  const readResult = await sandbox.read(path);
  let content = readResult.content;

  // Contar coincidencias
  const matches = content.split(find).length - 1;
  if (matches === 0) {
    throw new Error(
      `no se encontró el texto de "find" en ${path}; lee el archivo antes de editarlo`,
    );
  }
  if (matches > 1) {
    throw new Error(
      `"find" aparece ${matches} veces en ${path}; debe ser único`,
    );
  }

  // Reemplazar
  const newContent = content.replace(find, replace);
  const result = await sandbox.write(path, newContent);

  return {
    bytes: result.bytes,
    message: `reemplazado (${find.length} → ${replace.length} B)`,
  };
}

interface SearchFilesArgs {
  query: string;
  path?: string;
  max_results?: number;
}

export async function handle_search_files(
  sandbox: Sandbox,
  args: unknown,
): Promise<{ matches: Array<{ path: string; lineNumber: number; line: string }> }> {
  const { query, path, max_results } = (args as SearchFilesArgs) || {};
  if (!query) throw new Error("query requerido en search_files");

  const result = await sandbox.search(query, {
    ...(path ? { path } : {}),
    ...(max_results !== undefined ? { maxResults: max_results } : {}),
  });
  return { matches: result.matches };
}

interface RunCommandArgs {
  command: string;
  args?: string[];
}

export async function handle_run_command(
  sandbox: Sandbox,
  args: unknown,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { command, args: cmdArgs } = (args as RunCommandArgs) || {};
  if (!command) throw new Error("command requerido en run_command");

  const result = await sandbox.exec(command, cmdArgs || []);

  if (result.exitCode !== 0) {
    throw new Error(
      `command exited with code ${result.exitCode}: ${result.stderr || result.stdout}`,
    );
  }

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

interface FinishArgs {
  summary: string;
  files_changed?: string[];
}

export async function handle_finish(
  _sandbox: Sandbox,
  args: unknown,
): Promise<{ message: string }> {
  const { summary, files_changed } = (args as FinishArgs) || {};
  if (!summary) throw new Error("summary requerido en finish");

  return {
    message: `completado: ${summary}${
      files_changed?.length ? ` (${files_changed.length} archivos)` : ""
    }`,
  };
}
