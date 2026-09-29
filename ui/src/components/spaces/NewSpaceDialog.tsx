"use client";

import { useEffect, useRef, useState } from "react";
import { Lightbulb } from "lucide-react";
import { api } from "@/lib/api";
import { clsx } from "@/lib/cx";
import { DEFAULT_SPACE_ICON, SPACE_ICONS, spaceIcon } from "@/lib/space-icons";
import type { Space } from "@/lib/types";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field, Input } from "../ui/Field";

export function NewSpaceDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (space: Space) => void;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(DEFAULT_SPACE_ICON);
  const [path, setPath] = useState("");
  const [iconsOpen, setIconsOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iconsRef = useRef<HTMLDivElement>(null);

  // Cada apertura empieza con el formulario limpio.
  useEffect(() => {
    if (!open) return;
    setName("");
    setIcon(DEFAULT_SPACE_ICON);
    setPath("");
    setIconsOpen(false);
    setError(null);
    setSubmitting(false);
  }, [open]);

  useEffect(() => {
    if (!iconsOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (iconsRef.current && !iconsRef.current.contains(event.target as Node)) {
        setIconsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [iconsOpen]);

  async function handlePickFolder() {
    setPicking(true);
    setError(null);
    try {
      const result = await api.pickFolder();
      if (result.path) setPath(result.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el selector");
    } finally {
      setPicking(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !path.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const space = await api.createSpace({
        name: name.trim(),
        icon,
        path: path.trim(),
      });
      onCreated(space);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el proyecto");
      setSubmitting(false);
    }
  }

  const SelectedIcon = spaceIcon(icon);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Crear proyecto"
      width="max-w-[520px]"
      footer={
        <Button
          type="submit"
          form="new-space-form"
          variant="primary"
          loading={submitting}
          disabled={!name.trim() || !path.trim()}
          className="ml-auto"
        >
          Crear proyecto
        </Button>
      }
    >
      <form id="new-space-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div
            role="alert"
            className="rounded-[12px] bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger-text"
          >
            {error}
          </div>
        )}

        <Field id="space-name" label="Nombre del proyecto">
          <div className="relative flex items-center">
            <div ref={iconsRef} className="absolute left-1.5 z-10">
              <button
                type="button"
                onClick={() => setIconsOpen((value) => !value)}
                aria-haspopup="dialog"
                aria-expanded={iconsOpen}
                aria-label="Elegir icono"
                className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-btn text-ink-3 hover:bg-muted hover:text-ink"
              >
                <SelectedIcon className="h-4 w-4" aria-hidden />
              </button>

              {iconsOpen && (
                <div
                  role="dialog"
                  aria-label="Iconos"
                  className="absolute left-0 top-full z-50 mt-2 grid w-[248px] grid-cols-6 gap-1 rounded-[14px] border border-line-strong bg-surface p-2 shadow-modal"
                >
                  {SPACE_ICONS.map(({ name: iconName, label, Icon }) => (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => {
                        setIcon(iconName);
                        setIconsOpen(false);
                      }}
                      aria-label={label}
                      aria-pressed={icon === iconName}
                      title={label}
                      className={clsx(
                        "focus-ring inline-flex h-9 w-9 items-center justify-center rounded-btn text-ink-2 hover:bg-muted",
                        icon === iconName && "bg-primary-soft text-ink",
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Input
              id="space-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Calculadora con historial"
              maxLength={80}
              className="pl-10"
            />
          </div>
        </Field>

        <Field id="space-path" label="Carpeta del proyecto">
          <div className="flex gap-2">
            <Input
              id="space-path"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/ruta/a/mi/proyecto"
              className="font-mono text-[12.5px]"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handlePickFolder()}
              loading={picking}
            >
              Examinar…
            </Button>
          </div>
        </Field>

        <div className="flex items-start gap-3 rounded-[12px] bg-sidebar px-3.5 py-3 text-[13px] leading-normal text-ink-2">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
          <span>
            Un proyecto recuerda la carpeta donde trabaja MrRobot. Elígelo en el
            compositor y no tendrás que buscarla cada vez.
          </span>
        </div>
      </form>
    </Dialog>
  );
}
