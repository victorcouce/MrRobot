"use client";

import { useCallback, useState } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ProcessedAttachment {
  id: string;
  name: string;
  type: "image" | "markdown";
  mimeType: string;
  size: number;
  data: string;
}

interface AttachmentUploadProps {
  attachments: ProcessedAttachment[];
  onAdd: (attachment: ProcessedAttachment) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

const ALLOWED_TYPES = {
  image: ["image/png", "image/jpeg", "image/webp"],
  markdown: ["text/markdown", "text/plain"],
};

const MIME_TO_TYPE = {
  "image/png": "image" as const,
  "image/jpeg": "image" as const,
  "image/webp": "image" as const,
  "text/markdown": "markdown" as const,
  "text/plain": "markdown" as const,
};

const MAX_SIZE = 2 * 1024 * 1024;
const TOTAL_MAX_SIZE = 5 * 1024 * 1024;

export function AttachmentUpload({
  attachments,
  onAdd,
  onRemove,
  disabled,
}: AttachmentUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getTotalSize = useCallback(
    () => attachments.reduce((sum, att) => sum + att.size, 0),
    [attachments],
  );

  const processFile = useCallback(
    async (file: File) => {
      setError(null);

      const mimeType = file.type || "application/octet-stream";
      const type = MIME_TO_TYPE[mimeType as keyof typeof MIME_TO_TYPE];

      if (!type) {
        setError(`Tipo de archivo no permitido: ${mimeType}`);
        return;
      }

      if (file.size > MAX_SIZE) {
        setError(`El archivo excede 2MB: ${file.name}`);
        return;
      }

      if (getTotalSize() + file.size > TOTAL_MAX_SIZE) {
        setError("El total de adjuntos excede 5MB");
        return;
      }

      try {
        const data = await file.arrayBuffer();
        const base64 = Buffer.from(data).toString("base64");

        onAdd({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          type,
          mimeType,
          size: file.size,
          data: base64,
        });
      } catch (err) {
        setError(`Error al leer el archivo: ${file.name}`);
      }
    },
    [getTotalSize, onAdd],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);

      if (disabled) return;

      const files = Array.from(e.dataTransfer.files);
      files.forEach((file) => processFile(file));
    },
    [processFile, disabled],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.files);
      if (files.length > 0) {
        e.preventDefault();
        files.forEach((file) => processFile(file));
      }
    },
    [processFile],
  );

  const handleSelectFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      files.forEach((file) => processFile(file));
    },
    [processFile],
  );

  const totalSize = getTotalSize();
  const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onPaste={handlePaste}
        className={`relative rounded-lg border-2 border-dashed p-4 transition-colors ${
          dragging
            ? "border-primary bg-primary-soft"
            : "border-line-soft bg-muted"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <input
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.md"
          onChange={handleSelectFiles}
          disabled={disabled}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
          <Upload className="h-6 w-6 text-ink-3" />
          <div>
            <p className="text-sm font-medium text-ink">
              Arrastra archivos o haz clic
            </p>
            <p className="text-xs text-ink-3">
              PNG, JPG, WebP, Markdown (máx 2MB cada uno)
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-sm text-danger bg-danger-soft rounded-md p-3">
          {error}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-ink-3">
            {attachments.length} archivo{attachments.length !== 1 ? "s" : ""} ·{" "}
            {totalSizeMB}MB / 5MB
          </div>
          <div className="space-y-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center justify-between gap-2 p-3 bg-muted rounded-lg border border-line-soft"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">
                    {att.name}
                  </p>
                  <p className="text-xs text-ink-3">
                    {(att.size / 1024).toFixed(0)}KB ·{" "}
                    {att.type === "image" ? "Imagen" : "Markdown"}
                  </p>
                </div>
                <Button
                  onClick={() => onRemove(att.id)}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={disabled}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
