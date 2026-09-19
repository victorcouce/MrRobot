"use client";

import { useEffect, useState } from "react";
import type { AgentSpec, Task, TaskComplexity, TaskType } from "../../lib/types";
import {
  AGENT_CHOICES,
  agentToChoice,
  choiceToAgent,
  monoAgentLabel,
  type AgentChoice,
} from "../../lib/agents";
import { TASK_TYPE_LABELS } from "../../lib/status";
import { api } from "../../lib/api";
import { Button } from "../ui/Button";
import { Field, Input, Select, Textarea } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { Dialog } from "../ui/Dialog";
import { CloseIcon, PlusIcon } from "../ui/icons";

export interface TaskFormData {
  title: string;
  description: string;
  type: string;
  complexity: string;
  agent: AgentChoice | "auto";
  dependsOn: string[];
  acceptanceCriteria: string[];
}

const COMPLEXITY_OPTIONS: ReadonlyArray<{
  id: string;
  label: string;
}> = [
  { id: "low", label: "low" },
  { id: "medium", label: "medium" },
  { id: "high", label: "high" },
  { id: "critical", label: "critical" },
];

export function TaskEditor({
  mode,
  task,
  tasks,
  allowedAgents,
  onClose,
  onSubmit,
  submitting,
  error,
}: {
  mode: "edit" | "create";
  task?: Task;
  tasks: Task[];
  allowedAgents?: AgentSpec[];
  onClose: () => void;
  onSubmit: (data: TaskFormData) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [type, setType] = useState<string>(task?.type ?? "coding");
  const [complexity, setComplexity] = useState<string>(
    task?.complexity ?? "medium",
  );
  const [agent, setAgent] = useState<AgentChoice | "auto">(
    task ? (task.agent ? agentToChoice(task.agent) : "auto") : "auto",
  );
  const [dependsOn, setDependsOn] = useState<string[]>(task?.dependsOn ?? []);
  const [criteria, setCriteria] = useState<string[]>(
    task?.acceptanceCriteria && task.acceptanceCriteria.length > 0
      ? task.acceptanceCriteria
      : [""],
  );
  const [fallbackChain, setFallbackChain] = useState<AgentSpec[]>([]);

  const otherTasks = tasks.filter((candidate) => candidate.id !== task?.id);
  const addableDeps = otherTasks.filter((c) => !dependsOn.includes(c.id));

  // La cadena la calcula `getFallbackChain` en el backend: se pide en vivo
  // según cambian tipo/complejidad/agente, en vez de replicar la lógica aquí.
  useEffect(() => {
    let cancelled = false;

    api
      .fallbackChain({
        type: type as TaskType,
        complexity: complexity as TaskComplexity,
        ...(agent !== "auto" ? { agent: choiceToAgent(agent) } : {}),
        ...(allowedAgents?.length ? { allowedAgents } : {}),
      })
      .then((chain) => {
        if (!cancelled) setFallbackChain(chain);
      })
      .catch(() => {
        if (!cancelled) setFallbackChain([]);
      });

    return () => {
      cancelled = true;
    };
  }, [type, complexity, agent, allowedAgents]);

  function updateCriterion(index: number, value: string) {
    setCriteria((current) =>
      current.map((item, i) => (i === index ? value : item)),
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      type,
      complexity,
      agent,
      dependsOn,
      acceptanceCriteria: criteria.map((line) => line.trim()).filter(Boolean),
    });
  }

  const chainHint =
    fallbackChain.length > 0 ? (
      <>
        Cadena si falla:{" "}
        <span className="font-mono text-[12px]">
          {fallbackChain.map((candidate) => monoAgentLabel(candidate)).join(" → ")}
        </span>
      </>
    ) : undefined;

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        <>
          {mode === "edit" ? "Editar tarea" : "Nueva tarea"}
          {mode === "edit" && task && (
            <span className="ml-2 font-mono text-[14px] font-normal text-ink-4">
              {task.id}
            </span>
          )}
        </>
      }
      description="Los cambios se validan contra el plan: sin dependencias inexistentes ni ciclos."
      width="max-w-[640px]"
      footer={
        <>
          {mode === "edit" && (
            <Button
              variant="ghost"
              className="text-danger hover:text-danger"
              onClick={onClose}
            >
              Eliminar tarea
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button onClick={onClose}>Cancelar</Button>
            <Button
              type="submit"
              form="task-editor-form"
              variant="primary"
              loading={submitting}
            >
              {mode === "edit" ? "Guardar tarea" : "Añadir tarea"}
            </Button>
          </div>
        </>
      }
    >
      <form id="task-editor-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="rounded-[12px] bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger-text">
            {error}
          </div>
        )}

        <Field id="task-title" label="Título">
          <Input
            id="task-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </Field>

        <Field id="task-description" label="Descripción">
          <Textarea
            id="task-description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
          />
        </Field>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[180px_minmax(0,1fr)]">
          <Field id="task-type" label="Tipo">
            <Select
              id="task-type"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              {Object.entries(TASK_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-ink-2">
              Complejidad
            </span>
            <Segmented
              options={COMPLEXITY_OPTIONS}
              value={complexity}
              onChange={setComplexity}
              label="Complejidad"
            />
          </div>
        </div>

        <Field id="task-agent" label="Agente" hint={chainHint}>
          <Select
            id="task-agent"
            value={agent}
            onChange={(event) =>
              setAgent(event.target.value as AgentChoice | "auto")
            }
          >
            <option value="auto">Automático</option>
            {AGENT_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-2">
            Depende de
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {dependsOn.map((dep) => (
              <span
                key={dep}
                className="inline-flex h-7 items-center gap-1 rounded-[8px] bg-muted pl-2.5 pr-1 font-mono text-[12px] text-ink-2"
              >
                {dep}
                <button
                  type="button"
                  aria-label={`Quitar dependencia ${dep}`}
                  onClick={() =>
                    setDependsOn((current) =>
                      current.filter((item) => item !== dep),
                    )
                  }
                  className="focus-ring inline-flex h-[22px] w-[22px] items-center justify-center rounded-[5px] text-ink-4 hover:bg-line"
                >
                  <CloseIcon size={11} strokeWidth={2.2} />
                </button>
              </span>
            ))}
            {addableDeps.length > 0 && (
              <label className="relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-medium text-ink-2 hover:bg-muted">
                <PlusIcon size={13} strokeWidth={2} />
                Añadir
                <select
                  aria-label="Añadir dependencia"
                  value=""
                  onChange={(event) => {
                    if (event.target.value) {
                      setDependsOn((current) => [...current, event.target.value]);
                    }
                  }}
                  className="absolute inset-0 cursor-pointer opacity-0"
                >
                  <option value="" />
                  {addableDeps.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.id} · {candidate.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-2">
            Criterios de aceptación
          </span>
          <div className="flex flex-col gap-1.5">
            {criteria.map((criterion, index) => (
              <div key={index} className="flex gap-1.5">
                <Input
                  aria-label={`Criterio ${index + 1}`}
                  value={criterion}
                  onChange={(event) => updateCriterion(index, event.target.value)}
                />
                <button
                  type="button"
                  aria-label={`Quitar criterio ${index + 1}`}
                  onClick={() =>
                    setCriteria((current) =>
                      current.length <= 1
                        ? [""]
                        : current.filter((_, i) => i !== index),
                    )
                  }
                  className="focus-ring inline-flex h-[38px] w-8 shrink-0 items-center justify-center rounded-btn text-ink-4 hover:bg-muted"
                >
                  <CloseIcon size={13} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setCriteria((current) => [...current, ""])}
              className="focus-ring inline-flex h-7 items-center gap-1.5 self-start rounded-[8px] px-2 text-[13px] font-medium text-ink-2 hover:bg-muted"
            >
              <PlusIcon size={13} strokeWidth={2} />
              Añadir criterio
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
