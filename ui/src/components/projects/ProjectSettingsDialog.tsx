"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { AGENT_CHOICES, agentToChoice, type AgentChoice } from "../../lib/agents";
import { useAppInfo } from "../../lib/hooks";
import type { Project } from "../../lib/types";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field, Input, Select } from "../ui/Field";

export function ProjectSettingsDialog({
  project,
  open,
  onClose,
  onSaved,
}: {
  project: Project;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { info } = useAppInfo();

  const [concurrency, setConcurrency] = useState(2);
  const [maxRetries, setMaxRetries] = useState(1);
  const [maxReviewCycles, setMaxReviewCycles] = useState(2);
  const [planner, setPlanner] = useState<AgentChoice>("claude-opus");
  const [reviewer, setReviewer] = useState<AgentChoice>("claude-opus");
  const [supervisor, setSupervisor] = useState<AgentChoice>("claude-opus");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const config = project.config ?? info?.config;
    if (!config) return;
    setConcurrency(config.concurrency);
    setMaxRetries(config.maxRetriesPerAgent);
    setMaxReviewCycles(config.maxReviewFixCycles);
    setPlanner(agentToChoice(config.plannerAgent));
    setReviewer(agentToChoice(config.reviewerAgent));
    setSupervisor(agentToChoice(config.supervisorAgent));
    setError(null);
  }, [open, project.config, info]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await api.updateProjectConfig(project.id, {
        concurrency,
        maxRetriesPerAgent: maxRetries,
        maxReviewFixCycles: maxReviewCycles,
        plannerAgent: planner,
        reviewerAgent: reviewer,
        supervisorAgent: supervisor,
      });
      onSaved();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Project settings"
      width="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field id="project-concurrency" label="Concurrency">
            <Input
              id="project-concurrency"
              type="number"
              min={1}
              value={concurrency}
              onChange={(event) => setConcurrency(Number(event.target.value))}
            />
          </Field>
          <Field id="project-retries" label="Max retries">
            <Input
              id="project-retries"
              type="number"
              min={0}
              value={maxRetries}
              onChange={(event) => setMaxRetries(Number(event.target.value))}
            />
          </Field>
          <Field id="project-review-cycles" label="Max review cycles">
            <Input
              id="project-review-cycles"
              type="number"
              min={0}
              value={maxReviewCycles}
              onChange={(event) => setMaxReviewCycles(Number(event.target.value))}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field id="project-planner" label="Planner model">
            <Select
              id="project-planner"
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
          <Field id="project-reviewer" label="Reviewer model">
            <Select
              id="project-reviewer"
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
          <Field id="project-supervisor" label="Supervisor model">
            <Select
              id="project-supervisor"
              value={supervisor}
              onChange={(event) =>
                setSupervisor(event.target.value as AgentChoice)
              }
            >
              {AGENT_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
