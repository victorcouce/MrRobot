import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Task } from "../../lib/types";
import { TaskLog } from "./TaskLog";

const task: Task = {
  id: "TASK-001",
  title: "hacer algo",
  description: "",
  status: "running",
  type: "coding",
  complexity: "low",
};

describe("TaskLog", () => {
  it("muestra la salida en vivo del agente", () => {
    render(
      <TaskLog task={task} events={[]} liveOutput={"linea 1\nlinea 2"} />,
    );

    expect(screen.getByText("Salida en vivo")).toBeInTheDocument();
    expect(screen.getByText(/linea 1/)).toBeInTheDocument();
  });

  it("no muestra el bloque si no hay salida", () => {
    render(<TaskLog task={task} events={[]} />);
    expect(screen.queryByText("Salida en vivo")).not.toBeInTheDocument();
  });
});
