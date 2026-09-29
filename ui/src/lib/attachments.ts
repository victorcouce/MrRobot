/** Adjunto leído en el navegador, listo para enviarlo a la API. */
export interface ProcessedAttachment {
  id: string;
  name: string;
  type: "image" | "markdown";
  mimeType: string;
  size: number;
  data: string;
}

export const ATTACHMENT_ACCEPT = ".png,.jpg,.jpeg,.webp,.md";
export const ATTACHMENT_MAX_SIZE = 2 * 1024 * 1024;
export const ATTACHMENT_TOTAL_MAX_SIZE = 5 * 1024 * 1024;

const MIME_TO_TYPE: Record<string, ProcessedAttachment["type"]> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "text/markdown": "markdown",
  "text/plain": "markdown",
};

// Algunos navegadores no dan tipo MIME a los .md.
function mimeTypeOf(file: File): string {
  if (file.type) return file.type;
  return /\.md$/i.test(file.name) ? "text/markdown" : "application/octet-stream";
}

// `Buffer` no existe en el navegador: se codifica por bloques para no desbordar
// la pila al pasar los bytes a String.fromCharCode.
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

/**
 * Valida y codifica un archivo con los mismos límites que la API: PNG, JPG,
 * WebP o Markdown, 2 MB por archivo y 5 MB en total.
 */
export async function readAttachment(
  file: File,
  currentTotal: number,
): Promise<{ attachment: ProcessedAttachment } | { error: string }> {
  const mimeType = mimeTypeOf(file);
  const type = MIME_TO_TYPE[mimeType];

  if (!type) return { error: `Tipo de archivo no permitido: ${file.name}` };
  if (file.size > ATTACHMENT_MAX_SIZE) {
    return { error: `El archivo excede 2 MB: ${file.name}` };
  }
  if (currentTotal + file.size > ATTACHMENT_TOTAL_MAX_SIZE) {
    return { error: "El total de adjuntos excede 5 MB" };
  }

  try {
    return {
      attachment: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        name: file.name,
        type,
        mimeType,
        size: file.size,
        data: toBase64(await file.arrayBuffer()),
      },
    };
  } catch {
    return { error: `Error al leer el archivo: ${file.name}` };
  }
}

export function formatAttachmentSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
