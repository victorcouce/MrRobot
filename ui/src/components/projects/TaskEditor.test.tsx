import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../../lib/types";
import { TaskEditor } from "./TaskEditor";

vi.mock("../../lib/api", () => ({
  api: {
    fallbackChain: vi.fn(),
  },
  agentLabel: (agent: { provider: string; model?: string } | undefined) => {
    if (!agent) return "Auto";
    if (agent.provider === "codex") return "Codex";
    if (agent.provider === "claude") {
      if (agent.model === "opus") return "Claude Opus";
      if (agent.model === "haiku") return "Claude Haiku";
      return "Claude Sonnet";
    }
    return agent.model === "deepseek-v4-pro" ? "DeepSeek V4 Pro" : "DeepSeek Flash";
  },
}));

import { api } from "../../lib/api";

const tasks: Task[] = [
  {
    id: "T-001",
    title: "Scaffold",
    description: "",
    status: "todo",
    type: "coding",
    complexity: "low",
  },
];

describe("TaskEditor", () => {
  beforeEach(() => {
    vi.mocked(api.fallbackChain).mockReset();
    vi.mocked(api.fallbackChain).mockResolvedValue([]);
  });

  it("muestra las etiquetas del formulario en español", async () => {
    render(
      <TaskEditor
        mode="create"
        tasks={tasks}
        onClose={() => {}}
        onSubmit={() => {}}
        submitting={false}
        error={null}
      />,
    );

    expect(screen.getByText("Título")).toBeInTheDocument();
    expect(screen.getByText("Descripción")).toBeInTheDocument();
    expect(screen.getByText("Tipo")).toBeInTheDocument();
    expect(screen.getByText("Complejidad")).toBeInTheDocument();
    expect(screen.getByText("Agente")).toBeInTheDocument();
    expect(screen.getByText("Criterios de aceptación")).toBeInTheDocument();
    expect(screen.getByText("Depende de")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Añadir tarea" })).toBeInTheDocument();

    await waitFor(() => expect(api.fallbackChain).toHaveBeenCalled());
  });

  it("pide la cadena de fallback al motor y la muestra", async () => {
    vi.mocked(api.fallbackChain).mockResolvedValue([
      { provider: "deepseek", model: "deepseek-flash" },
      { provider: "claude", model: "sonnet" },
      { provider: "codex" },
    ]);

    render(
      <TaskEditor
        mode="create"
        tasks={tasks}
        onClose={() => {}}
        onSubmit={() => {}}
        submitting={false}
        error={null}
      />,
    );

    await waitFor(() =>
      expect(api.fallbackChain).toHaveBeenCalledWith({
        type: "coding",
        complexity: "medium",
      }),
    );

    const hint = await screen.findByText(/Cadena si falla/);
    const chain = hint.closest("p") as HTMLElement;
    expect(within(chain).getByText(/deepseek-flash/)).toBeInTheDocument();
    expect(within(chain).getByText(/claude \/ sonnet/)).toBeInTheDocument();
    expect(within(chain).getByText(/codex/)).toBeInTheDocument();
  });

  it("filtra la cadena por los agentes permitidos del chat", async () => {
    render(
      <TaskEditor
        mode="create"
        tasks={tasks}
        allowedAgents={[{ provider: "codex" }]}
        onClose={() => {}}
        onSubmit={() => {}}
        submitting={false}
        error={null}
      />,
    );

    await waitFor(() =>
      expect(api.fallbackChain).toHaveBeenCalledWith({
        type: "coding",
        complexity: "medium",
        allowedAgents: [{ provider: "codex" }],
      }),
    );
  });
});
