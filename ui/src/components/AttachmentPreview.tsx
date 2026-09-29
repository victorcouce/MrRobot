"use client";

import { useState } from "react";
import { ChevronDown, Image, FileText } from "lucide-react";
import type { Attachment } from "@/lib/types";

interface AttachmentPreviewProps {
  attachments?: Attachment[];
}

export function AttachmentPreview({
  attachments,
}: AttachmentPreviewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 mt-3">
      {attachments.map((att) => (
        <div
          key={att.id}
          className="bg-subtle rounded-lg border border-line overflow-hidden"
        >
          <button
            onClick={() =>
              setExpandedId(expandedId === att.id ? null : att.id)
            }
            className="w-full flex items-center gap-3 p-3 hover:bg-muted transition-colors text-left"
          >
            {att.type === "image" ? (
              <Image className="h-4 w-4 text-primary flex-shrink-0" />
            ) : (
              <FileText className="h-4 w-4 text-primary flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink truncate">
                {att.name}
              </p>
              <p className="text-xs text-ink-3">
                {(att.size / 1024).toFixed(0)}KB
              </p>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-ink-3 flex-shrink-0 transition-transform ${
                expandedId === att.id ? "rotate-180" : ""
              }`}
            />
          </button>

          {expandedId === att.id && (
            <div className="border-t border-line p-3 bg-surface">
              {att.type === "image" && att.data ? (
                <img
                  src={`data:${att.mimeType};base64,${att.data}`}
                  alt={att.name}
                  className="max-w-full max-h-64 rounded-md"
                />
              ) : att.type === "markdown" && att.data ? (
                <pre className="text-xs overflow-auto max-h-48 bg-muted p-2 rounded border border-line-soft text-ink">
                  {Buffer.from(att.data, "base64").toString("utf-8").slice(0, 500)}
                  {Buffer.from(att.data, "base64").toString("utf-8").length > 500
                    ? "..."
                    : ""}
                </pre>
              ) : (
                <p className="text-xs text-ink-3">
                  Sin vista previa disponible
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
