"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { useAppInfo } from "../../lib/hooks";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field, Input, Select } from "../ui/Field";

export function ImportProjectDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { info } = useAppInfo();

  const [repoPath, setRepoPath] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState("");
  const [name, setName] = useState("");
  const [picking, setPicking] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadBranches = useCallback(async (path: string) => {
    setLoadingBranches(true);
    setError(null);

    try {
      const result = await api.listFinalBranches(path);
      setBranches(result.branches);
      setBranch(result.branches[0] ?? "");
    } catch (error) {
      setBranches([]);
      setBranch("");
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingBranches(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    const path = repoPath.trim();
    if (!path) {
      setBranches([]);
      setBranch("");
      return;
    }

    clearTimeout(timer.current);
    timer.current = setTimeout(() => void loadBranches(path), 400);
    return () => clearTimeout(timer.current);
  }, [open, repoPath, loadBranches]);

  async function handlePickFolder() {
    setPicking(true);
    setError(null);

    try {
      const result = await api.pickFolder();
      if (result.path) setRepoPath(result.path);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setPicking(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!repoPath.trim()) {
      setError("Indica la carpeta del proyecto.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const project = await api.importProject({
        repoPath: repoPath.trim(),
        ...(branch ? { branch } : {}),
        ...(name.trim() ? { name: name.trim() } : {}),
      });

      onClose();
      router.push(`/projects/${project.id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Importar proyecto"
      description="Reconstruye un proyecto a partir de una rama final que MrRobot ya generó."
      width="max-w-[600px]"
      footer={
        <div className="ml-auto flex gap-2">
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="import-project-form"
            variant="primary"
            loading={submitting}
          >
            Importar
          </Button>
        </div>
      }
    >
      <form
        id="import-project-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        {error && (
          <div className="rounded-[12px] bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger-text">
            {error}
          </div>
        )}

        <Field
          id="import-repo"
          label="Carpeta del repositorio"
          hint="Repositorio que contiene una rama final (agent/project-*-final)."
        >
          <div className="flex gap-2">
            <Input
              id="import-repo"
              value={repoPath}
              onChange={(event) => setRepoPath(event.target.value)}
              placeholder={info?.repoRoot || "/ruta/a/mi/proyecto"}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handlePickFolder}
              loading={picking}
            >
              Examinar…
            </Button>
          </div>
        </Field>

        <Field
          id="import-branch"
          label="Rama final"
          hint={
            loadingBranches
              ? "Buscando ramas…"
              : branches.length === 0
                ? "No se encontraron ramas finales."
                : undefined
          }
        >
          <Select
            id="import-branch"
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            disabled={branches.length === 0}
          >
            {branches.length === 0 && <option value="">—</option>}
            {branches.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="import-name" label="Nombre" hint="Opcional.">
          <Input
            id="import-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Calculadora"
          />
        </Field>

        <div className="rounded-[12px] bg-sidebar px-3.5 py-3 text-[13px] leading-normal text-ink-2">
          Cada commit{" "}
          <span className="font-mono text-[12px]">
            agent(&lt;id&gt;): &lt;título&gt;
          </span>{" "}
          se convierte en una tarea hecha. El proyecto se crea como Completado y
          puedes seguir iterando desde un chat.
        </div>
      </form>
    </Dialog>
  );
}
