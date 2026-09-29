import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSummary, ProjectSummary } from "@/lib/types";
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

const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const data = vi.hoisted(() => ({
  projects: [] as ProjectSummary[],
  chats: [] as ChatSummary[],
}));

vi.mock("@/lib/hooks", () => ({
  useProjects: () => ({ projects: data.projects }),
  useAllChats: () => ({ chats: data.chats }),
}));

import { api } from "@/lib/api";

function project(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: "p1",
    name: "calc-web",
    goal: "una calculadora",
    status: "ready",
    createdAt: ago(0),
    updatedAt: ago(0),
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
    ...overrides,
  };
}

function chat(overrides: Partial<ChatSummary> = {}): ChatSummary {
  return {
    id: "c1",
    title: "Ideas sueltas",
    createdAt: ago(HOUR),
    updatedAt: ago(HOUR),
    messageCount: 2,
    taskIds: [],
    ...overrides,
  };
}

describe("CommandPalette", () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(api.search).mockReset();
    data.projects = [project()];
    data.chats = [
      chat(),
      chat({ id: "c2", projectId: "p1", title: "Añadir login", updatedAt: ago(40 * 24 * HOUR) }),
      chat({ id: "c3", title: "Archivado", archivedAt: ago(HOUR) }),
    ];
  });

  it("no pinta nada cuando open es false", () => {
    const { container } = render(<CommandPalette open={false} onOpenChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("declara role=dialog y aria-modal para accesibilidad", () => {
    render(<CommandPalette open onOpenChange={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Buscar chats" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("sin búsqueda muestra «Nuevo chat» y los chats recientes por fecha, sin archivados", () => {
    render(<CommandPalette open onOpenChange={() => {}} />);
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Nuevo chat");
    expect(screen.getByText("Hoy")).toBeInTheDocument();
    expect(screen.getByText("Más antiguos")).toBeInTheDocument();
    expect(screen.getByText("Ideas sueltas")).toBeInTheDocument();
    // El chat de proyecto enseña el nombre del proyecto.
    const login = screen.getByText("Añadir login").closest('[role="option"]') as HTMLElement;
    expect(within(login).getByText("una calculadora")).toBeInTheDocument();
    expect(screen.queryByText("Archivado")).toBeNull();
    expect(api.search).not.toHaveBeenCalled();
  });

  it("Enter abre el chat seleccionado con las flechas", () => {
    const onOpenChange = vi.fn();
    render(<CommandPalette open onOpenChange={onOpenChange} />);
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/chats/c1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("«Nuevo chat» llama a onNewChat", () => {
    const onNewChat = vi.fn();
    render(<CommandPalette open onOpenChange={() => {}} onNewChat={onNewChat} />);
    fireEvent.click(screen.getByText("Nuevo chat"));
    expect(onNewChat).toHaveBeenCalled();
  });

  it("al escribir busca en el servidor y muestra chats con el fragmento, proyectos y tareas", async () => {
    vi.mocked(api.search).mockResolvedValue({
      chats: [
        { id: "c1", title: "Ideas sueltas", snippet: "…quiero un login con Google" },
      ],
      tasks: [
        { id: "C1-TASK-001", projectId: "p1", projectName: "calc-web", title: "Login" },
      ],
    });

    render(<CommandPalette open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Buscar chats…"), {
      target: { value: "login" },
    });

    await waitFor(() => expect(api.search).toHaveBeenCalledWith("login"));
    await waitFor(() => expect(screen.getByText("Ideas sueltas")).toBeInTheDocument());
    expect(screen.getByText("login", { selector: "mark" })).toBeInTheDocument();
    expect(screen.getByText("Tareas")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Ideas sueltas"));
    expect(push).toHaveBeenCalledWith("/chats/c1");
  });

  it("Escape cierra la paleta", () => {
    const onOpenChange = vi.fn();
    render(<CommandPalette open onOpenChange={onOpenChange} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
