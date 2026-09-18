import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    search: vi.fn(),
  },
}));

const projects = [
  {
    id: "p1",
    name: "calc-web",
    goal: "una calculadora",
    status: "ready" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
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
  },
];

vi.mock("@/lib/hooks", () => ({
  useProjects: () => ({ projects }),
}));

import { api } from "@/lib/api";

describe("CommandPalette", () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(api.search).mockReset();
  });

  it("no pinta nada cuando open es false", () => {
    const { container } = render(
      <CommandPalette open={false} onOpenChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("declara role=dialog y aria-modal para accesibilidad", () => {
    render(<CommandPalette open onOpenChange={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Buscar" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("sin búsqueda muestra acciones y proyectos, sin pedir chats/tareas al servidor", () => {
    render(<CommandPalette open onOpenChange={() => {}} />);
    expect(screen.getByText("Nuevo proyecto")).toBeInTheDocument();
    expect(screen.getByText("calc-web")).toBeInTheDocument();
    expect(api.search).not.toHaveBeenCalled();
  });

  it("al escribir busca en el servidor (debounced) y muestra chats y tareas", async () => {
    vi.mocked(api.search).mockResolvedValue({
      chats: [
        { id: "c1", projectId: "p1", projectName: "calc-web", title: "añade login" },
      ],
      tasks: [
        { id: "C1-TASK-001", projectId: "p1", projectName: "calc-web", title: "Scaffold" },
      ],
    });

    render(<CommandPalette open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Busca proyectos/), {
      target: { value: "login" },
    });

    await waitFor(() => expect(api.search).toHaveBeenCalledWith("login"));
    await waitFor(() => expect(screen.getByText("añade login")).toBeInTheDocument());
    expect(screen.getByText("Scaffold")).toBeInTheDocument();
  });

  it("Escape cierra la paleta", () => {
    const onOpenChange = vi.fn();
    render(<CommandPalette open onOpenChange={onOpenChange} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
