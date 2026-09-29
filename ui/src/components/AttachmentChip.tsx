"use client";

import { FileText, X } from "lucide-react";
import { formatAttachmentSize } from "@/lib/attachments";

interface AttachmentChipProps {
  name: string;
  type: "image" | "markdown";
  mimeType: string;
  size: number;
  /** Base64 de la imagen; sin él la miniatura cae al icono de archivo. */
  data?: string | undefined;
  onRemove?: () => void;
}

/** Etiqueta compacta de un adjunto: miniatura o icono, nombre y tamaño. */
export function AttachmentChip({
  name,
  type,
  mimeType,
  size,
  data,
  onRemove,
}: AttachmentChipProps) {
  const thumbnail = type === "image" && data ? `data:${mimeType};base64,${data}` : null;

  return (
    <span
      title={name}
      className={`flex h-[30px] max-w-[240px] items-center gap-[7px] rounded-lg bg-muted pl-[5px] text-[12.5px] text-ink ${
        onRemove ? "pr-1" : "pr-2.5"
      }`}
    >
      {thumbnail ? (
        <span
          aria-hidden
          className="h-5 w-5 shrink-0 rounded-[4px] bg-cover bg-center"
          style={{ backgroundImage: `url("${thumbnail}")` }}
        />
      ) : (
        <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center text-ink-3">
          <FileText className="h-3.5 w-3.5" strokeWidth={1.8} />
        </span>
      )}
      <span className="truncate">{name}</span>
      <span className="whitespace-nowrap text-[11.5px] text-ink-4">
        {formatAttachmentSize(size)}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar ${name}`}
          className="focus-ring flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-[#E1DFD8]"
        >
          <X className="h-[11px] w-[11px]" strokeWidth={2.4} aria-hidden />
        </button>
      )}
    </span>
  );
}
