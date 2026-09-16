import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StoredReview, Task } from "../../lib/types";
import { TaskDetail } from "./TaskDetail";

const task: Task = {
  id: "TASK-014",
  title: "Implement CloudKit persistence",
  description: "Persistir datos",
  status: "done",
  type: "coding",
  complexity: "high",
  dependsOn: ["TASK-004", "TASK-007"],
  attempts: [
    {
      agent: { provider: "codex" },
      attempt: 1,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: "failed",
      error: "rate limit",
    },
    {
      agent: { provider: "claude", model: "sonnet" },
      attempt: 2,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: "success",
      branchName: "agent/TASK-014",
      commitSha: "abc1234",
    },
  ],
  executedBy: { provider: "claude", model: "sonnet" },
};

const reviews: StoredReview[] = [
  {
    id: "r1",
    projectId: "p1",
    taskId: "TASK-014",
    attempt: 1,
    approved: true,
    summary: "ok",
    issues: [],
    createdAt: new Date().toISOString(),
  },
];

describe("TaskDetail", () => {
  it("muestra el fallback visible entre intentos", () => {
    render(<TaskDetail task={task} reviews={reviews} onClose={() => {}} />);
    expect(screen.getByText("FAILED")).toBeInTheDocument();
    expect(screen.getByText("SUCCESS")).toBeInTheDocument();
    expect(screen.getByText("fallback")).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(screen.getByText("Claude Sonnet")).toBeInTheDocument();
  });

  it("muestra la información de Git", () => {
    render(<TaskDetail task={task} reviews={reviews} onClose={() => {}} />);
    expect(screen.getByText("agent/TASK-014")).toBeInTheDocument();
    expect(screen.getByText("abc1234")).toBeInTheDocument();
  });
});
