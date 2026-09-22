/**
 * `claude --print --output-format stream-json --verbose` emite un objeto NDJSON
 * por línea (mensajes `system`/`assistant`/`user`/`result`, con el mismo
 * formato que el SDK). Este módulo traduce ese stream a líneas legibles (qué
 * herramienta usa el agente y sobre qué, o un fragmento de su razonamiento) en
 * vez de mostrar el JSON crudo, y extrae el texto final de `result` para que
 * `runClaude` siga devolviendo solo la respuesta, no el stream entero.
 */

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface StreamMessage {
  type: string;
  message?: { content?: ContentBlock[] };
  result?: string;
  usage?: unknown;
}

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

const TOOL_NARRATORS: Record<string, (input: Record<string, unknown>) => string> = {
  Read: (input) => `Read: ${input.file_path ?? "?"}`,
  Write: (input) => `Write: ${input.file_path ?? "?"}`,
  Edit: (input) => `Edit: ${input.file_path ?? "?"}`,
  Bash: (input) => `Bash: ${truncate(String(input.command ?? ""), 140)}`,
  Grep: (input) =>
    `Grep: "${truncate(String(input.pattern ?? ""), 60)}"${input.path ? ` en ${input.path}` : ""}`,
  Glob: (input) => `Glob: ${input.pattern ?? "?"}`,
  WebFetch: (input) => `WebFetch: ${input.url ?? "?"}`,
  WebSearch: (input) => `WebSearch: ${truncate(String(input.query ?? ""), 80)}`,
  TodoWrite: () => "Actualiza la lista de tareas",
};

function narrateBlock(block: ContentBlock): string | undefined {
  if (block.type === "tool_use" && block.name) {
    const narrate = TOOL_NARRATORS[block.name];
    return narrate ? `🔧 ${narrate(block.input ?? {})}` : `🔧 ${block.name}`;
  }

  if (block.type === "text" && block.text) {
    const text = truncate(block.text, 160);
    return text ? `💬 ${text}` : undefined;
  }

  return undefined;
}

/**
 * Envuelve un `onOutput` para que reciba narración legible en vez del NDJSON
 * crudo. Mantiene un buffer entre llamadas porque una línea puede llegar
 * partida entre dos chunks de stdout.
 */
export function createStreamJsonRelay(
  onOutput: (chunk: string) => void,
): (chunk: string) => void {
  let buffer = "";

  return (chunk: string): void => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed: StreamMessage;
      try {
        parsed = JSON.parse(trimmed) as StreamMessage;
      } catch {
        continue;
      }

      if (parsed.type !== "assistant" || !parsed.message?.content) continue;

      for (const block of parsed.message.content) {
        const narration = narrateBlock(block);
        if (narration) onOutput(`${narration}\n`);
      }
    }
  };
}

/** Extrae el texto final (`result`) del stream NDJSON completo. */
export function extractStreamJsonResult(raw: string): string | undefined {
  let result: string | undefined;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed) as StreamMessage;
      if (parsed.type === "result" && typeof parsed.result === "string") {
        result = parsed.result;
      }
    } catch {
      // Línea parcial o no-JSON (no debería darse en el raw final): se ignora.
    }
  }

  return result;
}

/** Extrae el `usage` del mensaje `result` (stream NDJSON o `--output-format json`). */
export function extractStreamJsonUsage(raw: string): unknown {
  let usage: unknown;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;

    try {
      const parsed = JSON.parse(trimmed) as StreamMessage;
      if (parsed.type === "result" && parsed.usage) usage = parsed.usage;
    } catch {
      // Línea no-JSON: se ignora.
    }
  }

  return usage;
}
