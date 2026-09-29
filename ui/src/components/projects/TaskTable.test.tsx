import { fireEvent, render, screen } from "@testing-library/react";
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
    render(<TaskTable tasks={tasks} events={[]} onSelect={() => {}} />);
    expect(screen.getAllByText("TASK-001").length).toBeGreaterThan(0);
    expect(screen.getByText("Define architecture")).toBeInTheDocument();
    expect(screen.getByText("codex")).toBeInTheDocument();
    expect(screen.getByText("Tipo · complejidad")).toBeInTheDocument();
  });

  it("llama a onSelect al hacer click en una fila", () => {
    const onSelect = vi.fn();
    render(<TaskTable tasks={tasks} events={[]} onSelect={onSelect} />);
    screen.getByText("Define architecture").click();
    expect(onSelect).toHaveBeenCalledWith("TASK-001");
  });

  it("despliega el log de una tarea en curso al pulsar el chevron", () => {
    const running: Task = {
      id: "TASK-003",
      title: "Add parser",
      description: "",
      status: "running",
      type: "coding",
      complexity: "medium",
      dependsOn: [],
      startedAt: new Date().toISOString(),
    };

    render(
      <TaskTable
        tasks={[running]}
        events={[
          {
            id: "evt-1",
            projectId: "p1",
            type: "task.started",
            taskId: "TASK-003",
            createdAt: new Date().toISOString(),
          },
        ]}
        onSelect={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Ver actividad"));
    expect(screen.getByText("TASK-003 en curso")).toBeInTheDocument();
  });
});
