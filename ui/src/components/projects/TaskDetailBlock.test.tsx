import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Task } from "../../lib/types";
import { TaskDetailBlock } from "./TaskDetailBlock";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "TASK-001",
    title: "Scaffold del proyecto",
    description: "",
    status: "done",
    type: "coding",
    complexity: "low",
    ...overrides,
  };
}

describe("TaskDetailBlock", () => {
  it("no muestra el error de un intento anterior si la tarea acabó bien", () => {
    render(
      <TaskDetailBlock
        task={makeTask({
          status: "done",
          error: "review no aprobado tras 3 ciclos",
        })}
        reviews={[]}
      />,
    );

    expect(screen.queryByText("Error")).not.toBeInTheDocument();
    expect(
      screen.queryByText("review no aprobado tras 3 ciclos"),
    ).not.toBeInTheDocument();
  });

  it("muestra el error cuando la tarea ha fallado", () => {
    render(
      <TaskDetailBlock
        task={makeTask({ status: "failed", error: "fallo de red" })}
        reviews={[]}
      />,
    );

    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("fallo de red")).toBeInTheDocument();
  });
});
