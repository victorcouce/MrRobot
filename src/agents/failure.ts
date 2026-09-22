/**
 * Clasificación de los fallos de agentes, compartida por las métricas, el
 * prompt de reintento del worker y el cortafuegos del supervisor.
 */

/**
 * Clasifica el error de un intento de agente en una categoría legible para el
 * panel de actividad. Es heurístico: solo agrupa por el patrón más relevante.
 */
export function classifyFailure(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("agotadas") && m.includes("iteraciones")) {
    return "harness: iteraciones";
  }
  if (m.includes("máximo de llamadas")) return "harness: tool calls";
  if (m.includes("superó el plazo")) return "harness: plazo";
  if (m.includes("role 'tool'")) return "API: tool huérfano (400)";
  if (m.includes("symlink")) return "sandbox: symlink";
  if (m.includes("ruta fuera de la raíz")) return "sandbox: ruta fuera";
  if (m.includes("no permitido")) return "sandbox: comando no permitido";
  if (m.includes("vetado")) return "sandbox: comando vetado";
  if (m.includes(".git")) return "sandbox: .git";
  if (m.includes("no creó ni modificó")) return "agente sin cambios";
  if (m.includes("rate limit") || m.includes("session limit") || m.includes("429")) {
    return "rate limit";
  }
  if (m.includes("no disponible")) return "agente no disponible";

  return "otros";
}

/**
 * Pista para el siguiente intento de una tarea según cómo falló el anterior,
 * o `undefined` si el fallo no depende de cómo trabaje el agente (límites,
 * disponibilidad).
 */
export function failureHint(kind: string): string | undefined {
  if (kind.startsWith("harness")) {
    return (
      "agotó su presupuesto de iteraciones o herramientas, casi siempre explorando. " +
      "No recorras el repo entero: lee solo los archivos que vas a tocar, escribe " +
      "pronto y llama a finish() en cuanto se cumplan los criterios."
    );
  }
  if (kind === "agente sin cambios") {
    return "terminó sin crear ni modificar archivos; esta tarea exige cambios en disco.";
  }
  if (kind.startsWith("sandbox")) {
    return "chocó con el sandbox: usa rutas relativas y solo los comandos permitidos.";
  }
  if (kind === "otros") return "falló.";

  return undefined;
}

/** Cuántos fallos anteriores se resumen en el prompt del reintento. */
const MAX_PREVIOUS_FAILURES = 3;

/**
 * Bloque para el prompt del worker con los fallos anteriores de la tarea (de
 * ejecuciones previas y de candidatos anteriores de esta misma), para que el
 * siguiente intento no repita el mismo camino. Vacío si no hay nada útil.
 */
export function renderPreviousFailures(
  attempts: { status: string; error?: string | undefined }[],
): string {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const attempt of [...attempts].reverse()) {
    if (attempt.status !== "failed" || !attempt.error) continue;

    const kind = classifyFailure(attempt.error);
    const hint = failureHint(kind);
    if (!hint || seen.has(kind)) continue;

    seen.add(kind);
    const detail = attempt.error.replace(/\s+/g, " ").slice(0, 200);
    lines.push(`- Un intento anterior ${hint} (${detail})`);
    if (lines.length >= MAX_PREVIOUS_FAILURES) break;
  }

  return lines.length > 0
    ? `INTENTOS ANTERIORES FALLIDOS\n${lines.join("\n")}`
    : "";
}
