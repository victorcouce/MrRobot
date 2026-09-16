"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AGENT_CHOICES, agentToChoice, type AgentChoice } from "@/lib/agents";
import { useAppInfo } from "@/lib/hooks";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { LoadingState } from "@/components/ui/Badge";

export default function SettingsPage() {
  const { info, refresh } = useAppInfo();

  const [concurrency, setConcurrency] = useState(2);
  const [maxRetries, setMaxRetries] = useState(1);
  const [maxReviewCycles, setMaxReviewCycles] = useState(2);
  const [planner, setPlanner] = useState<AgentChoice>("claude-opus");
  const [reviewer, setReviewer] = useState<AgentChoice>("claude-opus");
  const [supervisor, setSupervisor] = useState<AgentChoice>("claude-opus");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!info) return;
    const config = info.config;
    setConcurrency(config.concurrency);
    setMaxRetries(config.maxRetriesPerAgent);
    setMaxReviewCycles(config.maxReviewFixCycles);
    setPlanner(agentToChoice(config.plannerAgent));
    setReviewer(agentToChoice(config.reviewerAgent));
    setSupervisor(agentToChoice(config.supervisorAgent));
  }, [info]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      await api.updateConfig({
        concurrency,
        maxRetriesPerAgent: maxRetries,
        maxReviewFixCycles: maxReviewCycles,
        plannerAgent: planner,
        reviewerAgent: reviewer,
        supervisorAgent: supervisor,
      });
      setSaved(true);
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-xl font-semibold tracking-tight">Settings</h1>

      {!info ? (
        <LoadingState label="Cargando configuración…" />
      ) : (
        <div className="space-y-6">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-sm font-semibold">Agents</h2>
            <ul className="space-y-2">
              {info.agents.map((agent) => (
                <li key={agent.provider} className="flex items-center justify-between">
                  <span className="text-sm">{agent.label}</span>
                  <span
                    className={
                      agent.connected
                        ? "text-sm text-emerald-600 dark:text-emerald-400"
                        : "text-sm text-zinc-400"
                    }
                  >
                    {agent.connected ? "Connected" : "Not connected"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="mb-4 text-sm font-semibold">Execution defaults</h2>

            {error && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </div>
            )}
            {saved && (
              <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                Configuración guardada.
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field id="settings-concurrency" label="Default concurrency">
                <Input
                  id="settings-concurrency"
                  type="number"
                  min={1}
                  value={concurrency}
                  onChange={(event) => setConcurrency(Number(event.target.value))}
                />
              </Field>
              <Field id="settings-retries" label="Max retries">
                <Input
                  id="settings-retries"
                  type="number"
                  min={0}
                  value={maxRetries}
                  onChange={(event) => setMaxRetries(Number(event.target.value))}
                />
              </Field>
              <Field id="settings-review-cycles" label="Max review cycles">
                <Input
                  id="settings-review-cycles"
                  type="number"
                  min={0}
                  value={maxReviewCycles}
                  onChange={(event) => setMaxReviewCycles(Number(event.target.value))}
                />
              </Field>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field id="settings-planner" label="Planner model">
                <Select
                  id="settings-planner"
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
              <Field id="settings-reviewer" label="Reviewer model">
                <Select
                  id="settings-reviewer"
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
              <Field id="settings-supervisor" label="Supervisor model">
                <Select
                  id="settings-supervisor"
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

            <div className="mt-5 flex justify-end">
              <Button type="submit" variant="primary" loading={saving}>
                Save
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
