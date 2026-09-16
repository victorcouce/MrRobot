import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProjectEvent } from "../../lib/types";
import { ActivityLog } from "./ActivityLog";

const events: ProjectEvent[] = [
  {
    id: "e1",
    projectId: "p1",
    type: "task.started",
    taskId: "TASK-014",
    createdAt: new Date().toISOString(),
  },
  {
    id: "e2",
    projectId: "p1",
    type: "git.conflict",
    createdAt: new Date().toISOString(),
    payload: { message: "conflicto" },
  },
  {
    id: "e3",
    projectId: "p1",
    type: "project.completed",
    createdAt: new Date().toISOString(),
  },
];

describe("ActivityLog", () => {
  it("muestra los eventos", () => {
    render(<ActivityLog events={events} />);
    expect(screen.getByText("TASK-014 started")).toBeInTheDocument();
    expect(screen.getByText("Git conflict")).toBeInTheDocument();
  });

  it("filtra por categoría", () => {
    render(<ActivityLog events={events} />);
    fireEvent.click(screen.getByText("Git"));
    expect(screen.getByText("Git conflict")).toBeInTheDocument();
    expect(screen.queryByText("TASK-014 started")).not.toBeInTheDocument();
  });
});
