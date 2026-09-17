import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../../lib/types";
import { TaskTable } from "./TaskTable";

const tasks: Task[] = [
  {
    id: "TASK-001",
    title: "Define architecture",
    description: "",
    status: "ready",
    type: "architecture",
    complexity: "high",
    dependsOn: [],
  },
  {
    id: "TASK-002",
    title: "Implement sum",
    description: "",
    status: "done",
    type: "coding",
    complexity: "low",
    dependsOn: ["TASK-001"],
    agent: { provider: "codex" },
  },
];

describe("TaskTable", () => {
  it("renderiza las tareas con ID, agente y dependencias", () => {
    render(<TaskTable tasks={tasks} onSelect={() => {}} />);
    expect(screen.getAllByText("TASK-001").length).toBeGreaterThan(0);
    expect(screen.getByText("Define architecture")).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(screen.getByText("Lista")).toBeInTheDocument();
    expect(screen.getByText("Hecha")).toBeInTheDocument();
  });

  it("llama a onSelect al hacer click en una fila", () => {
    const onSelect = vi.fn();
    render(<TaskTable tasks={tasks} onSelect={onSelect} />);
    screen.getByText("Define architecture").click();
    expect(onSelect).toHaveBeenCalledWith("TASK-001");
  });
});
