"use client";

import { useState } from "react";
import type { Task } from "../../lib/types";
import { AGENT_CHOICES, agentToChoice, type AgentChoice } from "../../lib/agents";
import { TASK_TYPE_LABELS, COMPLEXITY_LABELS } from "../../lib/status";
import { Button } from "../ui/Button";
import { Field, Input, Select, Textarea } from "../ui/Field";
import { Dialog } from "../ui/Dialog";

export interface TaskFormData {
  title: string;
  description: string;
  type: string;
  complexity: string;
  agent: AgentChoice | "auto";
  dependsOn: string[];
  acceptanceCriteria: string[];
}

export function TaskEditor({
  mode,
  task,
  tasks,
  onClose,
  onSubmit,
  submitting,
  error,
}: {
  mode: "edit" | "create";
  task?: Task;
  tasks: Task[];
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
  const [criteria, setCriteria] = useState(
    (task?.acceptanceCriteria ?? []).join("\n"),
  );

  const otherTasks = tasks.filter((candidate) => candidate.id !== task?.id);

  function toggleDependency(id: string) {
    setDependsOn((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
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
      acceptanceCriteria: criteria
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={mode === "edit" ? `Editar ${task?.id}` : "Nueva tarea"}
      width="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-danger-text bg-danger-soft px-3 py-2 text-sm text-danger-text">
            {error}
          </div>
        )}

        <Field id="task-title" label="Title">
          <Input
            id="task-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </Field>

        <Field id="task-description" label="Description">
          <Textarea
            id="task-description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="task-type" label="Type">
            <Select
              id="task-type"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              {Object.entries(TASK_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="task-complexity" label="Complexity">
            <Select
              id="task-complexity"
              value={complexity}
              onChange={(event) => setComplexity(event.target.value)}
            >
              {Object.entries(COMPLEXITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field id="task-agent" label="Agent" hint="Auto usa el selector del motor según tipo y complejidad.">
          <Select
            id="task-agent"
            value={agent}
            onChange={(event) => setAgent(event.target.value as AgentChoice | "auto")}
          >
            <option value="auto">Auto</option>
            {AGENT_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="task-acceptance" label="Acceptance criteria" hint="Uno por línea.">
          <Textarea
            id="task-acceptance"
            rows={3}
            value={criteria}
            onChange={(event) => setCriteria(event.target.value)}
          />
        </Field>

        {otherTasks.length > 0 && (
          <Field id="task-deps" label="Dependencies">
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-line bg-subtle p-2">
              {otherTasks.map((candidate) => (
                <label
                  key={candidate.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={dependsOn.includes(candidate.id)}
                    onChange={() => toggleDependency(candidate.id)}
                    className="h-4 w-4 rounded border-line-strong accent-primary"
                  />
                  <span className="font-mono text-xs text-ink-4">{candidate.id}</span>
                  <span className="truncate text-ink-2">
                    {candidate.title}
                  </span>
                </label>
              ))}
            </div>
          </Field>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={submitting}>
            {mode === "edit" ? "Save" : "Add task"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
