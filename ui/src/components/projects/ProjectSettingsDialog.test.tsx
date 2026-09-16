import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../lib/types";
import { ProjectSettingsDialog } from "./ProjectSettingsDialog";

vi.mock("../../lib/api", () => ({
  api: {
    info: vi.fn().mockResolvedValue({
      repoRoot: "/repo",
      baseRef: "base",
      mock: false,
      agents: [],
      config: {
        concurrency: 2,
        maxRetriesPerAgent: 1,
        maxReviewFixCycles: 2,
        plannerMaxAttempts: 2,
        plannerAgent: { provider: "claude", model: "opus" },
        reviewerAgent: { provider: "claude", model: "opus" },
        supervisorAgent: { provider: "claude", model: "opus" },
      },
    }),
    updateProjectConfig: vi.fn(),
  },
}));

import { api } from "../../lib/api";

const project: Project = {
  id: "p1",
  name: "P",
  goal: "g",
  status: "ready",
  baseRef: "base",
  tasks: [],
  config: {
    concurrency: 3,
    maxRetriesPerAgent: 2,
    maxReviewFixCycles: 1,
    plannerMaxAttempts: 2,
    plannerAgent: { provider: "claude", model: "opus" },
    reviewerAgent: { provider: "claude", model: "opus" },
    supervisorAgent: { provider: "claude", model: "opus" },
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  stats: {
    total: 0,
    done: 0,
    running: 0,
    failed: 0,
    blocked: 0,
    ready: 0,
    todo: 0,
    progress: 0,
    activeAgents: 0,
  },
  agentsUsed: [],
};

describe("ProjectSettingsDialog", () => {
  beforeEach(() => {
    vi.mocked(api.updateProjectConfig).mockClear();
    vi.mocked(api.updateProjectConfig).mockResolvedValue(project);
  });

  it("envía los modelos editados", async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();

    render(
      <ProjectSettingsDialog
        project={project}
        open
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText("Planner model"), {
      target: { value: "deepseek" },
    });
    fireEvent.change(screen.getByLabelText("Concurrency"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(api.updateProjectConfig).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ concurrency: 5, plannerAgent: "deepseek" }),
      );
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("no renderiza nada si está cerrado", async () => {
    render(
      <ProjectSettingsDialog
        project={project}
        open={false}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
