import type { Attachment } from "./types.js";

/** Tope de texto que se inyecta por adjunto markdown, para no inflar el prompt. */
const MAX_INLINE_CHARS = 8000;

/**
 * Referencia corta y estable que se le enseña al planner. Los UUID reales no
 * sobreviven bien a un LLM, así que fuera de la aplicación los adjuntos se
 * nombran por su posición.
 */
export function attachmentRef(index: number): string {
  return `ADJ-${index + 1}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function decodeText(attachment: Attachment): string | undefined {
  if (attachment.type !== "markdown" || !attachment.data) {
    return undefined;
  }

  try {
    const text = Buffer.from(attachment.data, "base64").toString("utf8");

    return text.length > MAX_INLINE_CHARS
      ? `${text.slice(0, MAX_INLINE_CHARS)}\n…[truncado]`
      : text;
  } catch {
    return undefined;
  }
}

/**
 * Bloque de prompt con los adjuntos. El contenido de los markdown se inyecta
 * tal cual; de las imágenes solo van los metadatos, porque los proveedores se
 * invocan por CLI y solo aceptan texto.
 */
export function renderAttachments(
  attachments: Attachment[],
  options: { refs?: boolean } = {},
): string[] {
  if (attachments.length === 0) {
    return [];
  }

  const parts: string[] = ["", "ADJUNTOS"];

  attachments.forEach((attachment, index) => {
    const label = options.refs === false ? "" : `[${attachmentRef(index)}] `;
    const kind = attachment.type === "image" ? "imagen" : "markdown";

    parts.push(
      `${label}${attachment.name} (${kind}, ${attachment.mimeType}, ${formatSize(attachment.size)})`,
    );

    const text = decodeText(attachment);

    if (text) {
      parts.push(`--- contenido de ${attachment.name} ---`, text, "---");
    }
  });

  return parts;
}

/**
 * Traduce lo que devuelve el planner (`ADJ-1`, o el nombre del fichero) a ids
 * reales de adjunto. Las referencias que no casan se descartan.
 */
export function resolveAttachmentRefs(
  refs: string[],
  attachments: Attachment[],
): string[] {
  if (refs.length === 0 || attachments.length === 0) {
    return [];
  }

  const byRef = new Map<string, string>();

  attachments.forEach((attachment, index) => {
    byRef.set(attachmentRef(index).toLowerCase(), attachment.id);
    byRef.set(attachment.name.toLowerCase(), attachment.id);
    byRef.set(attachment.id.toLowerCase(), attachment.id);
  });

  const ids = new Set<string>();

  for (const ref of refs) {
    const id = byRef.get(ref.trim().toLowerCase());
    if (id) ids.add(id);
  }

  return [...ids];
}

export function pickAttachments(
  ids: string[] | undefined,
  attachments: Attachment[],
): Attachment[] {
  if (!ids?.length) {
    return [];
  }

  const wanted = new Set(ids);
  return attachments.filter((attachment) => wanted.has(attachment.id));
}
