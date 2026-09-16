"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../lib/api";
import { AGENT_CHOICES, type AgentChoice } from "../../lib/agents";
import { useAppInfo } from "../../lib/hooks";
import { Button } from "../ui/Button";
import { Field, Input, Select, Textarea } from "../ui/Field";

export function CreateProjectForm() {
  const router = useRouter();
  const { info } = useAppInfo();

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [picking, setPicking] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [concurrency, setConcurrency] = useState(2);
  const [maxRetries, setMaxRetries] = useState(1);
  const [maxReviewCycles, setMaxReviewCycles] = useState(2);
  const [planner, setPlanner] = useState<AgentChoice>("claude-opus");
  const [reviewer, setReviewer] = useState<AgentChoice>("claude-opus");
  const [supervisor, setSupervisor] = useState<AgentChoice>("claude-opus");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    if (!goal.trim()) {
      setError("Describe qué quieres construir.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const config = {
        concurrency,
        maxRetriesPerAgent: maxRetries,
        maxReviewFixCycles: maxReviewCycles,
        plannerAgent: planner,
        reviewerAgent: reviewer,
        supervisorAgent: supervisor,
      };

      const project = await api.createProject({
        goal: goal.trim(),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(repoPath.trim() ? { repoPath: repoPath.trim() } : {}),
        ...(remoteUrl.trim() ? { remoteUrl: remoteUrl.trim() } : {}),
        config,
      });

      await api.generatePlan(project.id);
      router.push(`/projects/${project.id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <Field id="name" label="Name" hint="Opcional. Si lo dejas vacío se deriva del objetivo.">
        <Input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Poketo"
        />
      </Field>

      <Field id="goal" label="Goal">
        <Textarea
          id="goal"
          rows={6}
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="Crear una aplicación iOS para guardar contenido de Instagram, Twitter y Pinterest…"
        />
      </Field>

      <Field
        id="repo"
        label="Carpeta del proyecto"
        hint={
          info?.repoRoot
            ? `Si la dejas vacía se usa el repositorio actual (${info.repoRoot}). Si indicas una ruta, se crea e inicializa allí.`
            : "Si indicas una ruta, se crea e inicializa como repositorio git."
        }
      >
        <div className="flex gap-2">
          <Input
            id="repo"
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
        id="remote"
        label="Repositorio GitHub (opcional)"
        hint="Se configura como remoto origin del proyecto."
      >
        <Input
          id="remote"
          value={remoteUrl}
          onChange={(event) => setRemoteUrl(event.target.value)}
          placeholder="https://github.com/usuario/repo.git"
        />
      </Field>

      <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setAdvancedOpen((value) => !value)}
          className="focus-ring flex items-center gap-1 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          aria-expanded={advancedOpen}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            className={advancedOpen ? "rotate-90 transition-transform" : "transition-transform"}
            aria-hidden
          >
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Advanced settings
        </button>

        {advancedOpen && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="concurrency" label="Concurrency">
              <Input
                id="concurrency"
                type="number"
                min={1}
                value={concurrency}
                onChange={(event) => setConcurrency(Number(event.target.value))}
              />
            </Field>
            <Field id="max-retries" label="Max retries">
              <Input
                id="max-retries"
                type="number"
                min={0}
                value={maxRetries}
                onChange={(event) => setMaxRetries(Number(event.target.value))}
              />
            </Field>
            <Field id="max-review" label="Max review cycles">
              <Input
                id="max-review"
                type="number"
                min={0}
                value={maxReviewCycles}
                onChange={(event) => setMaxReviewCycles(Number(event.target.value))}
              />
            </Field>
            <Field id="planner" label="Planner model">
              <Select
                id="planner"
                value={planner}
                onChange={(event) => setPlanner(event.target.value as AgentChoice)}
              >
                {AGENT_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="reviewer" label="Reviewer model">
              <Select
                id="reviewer"
                value={reviewer}
                onChange={(event) => setReviewer(event.target.value as AgentChoice)}
              >
                {AGENT_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="supervisor" label="Supervisor model">
              <Select
                id="supervisor"
                value={supervisor}
                onChange={(event) => setSupervisor(event.target.value as AgentChoice)}
              >
                {AGENT_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" variant="primary" loading={submitting}>
          Generate plan
        </Button>
      </div>
    </form>
  );
}
