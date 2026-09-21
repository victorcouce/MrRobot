import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSummary, ProjectStats, ProjectSummary } from "../../lib/types";
import { AppShell } from "./AppShell";

const mocks = vi.hoisted(() => ({
  projects: [] as ProjectSummary[],
  chats: [] as ChatSummary[],
  info: null as { agents?: { connected: boolean }[] } | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("../../lib/hooks", () => ({
  useProjects: () => ({
    projects: mocks.projects,
    error: null,
    loading: false,
    refresh: vi.fn(),
  }),
  useAllChats: () => ({
    chats: mocks.chats,
    error: null,
    loading: false,
    refresh: vi.fn(),
  }),
  useAppInfo: () => ({ info: mocks.info, error: null, refresh: vi.fn() }),
}));

const stats: ProjectStats = {
  total: 0,
  done: 0,
  running: 0,
  failed: 0,
  blocked: 0,
  ready: 0,
  todo: 0,
  progress: 0,
  activeAgents: 0,
};

function makeProject(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  const now = new Date().toISOString();
  return {
    id: "p1",
    name: "Web",
    goal: "web",
    status: "ready",
    createdAt: now,
    updatedAt: now,
    stats,
    ...overrides,
  };
}

function makeChat(overrides: Partial<ChatSummary> = {}): ChatSummary {
  const now = new Date().toISOString();
  return {
    id: "c1",
    projectId: "p1",
    title: "Plan inicial",
    createdAt: now,
    updatedAt: now,
    messageCount: 1,
    taskIds: [],
    ...overrides,
  };
}

describe("AppShell", () => {
  beforeEach(() => {
    mocks.projects = [];
    mocks.chats = [];
    mocks.info = null;
  });

  it("muestra cada proyecto como iniciales enlazando a su página", () => {
    mocks.projects = [makeProject()];

    render(<AppShell>contenido</AppShell>);

    const link = screen.getByRole("link", { name: "Web" });
    expect(link).toHaveAttribute("href", "/projects/p1");
    expect(link).toHaveTextContent("WE");
  });

  it("mantiene Agentes, Actividad y Ajustes en la parte inferior", () => {
    render(<AppShell>contenido</AppShell>);

    expect(screen.getByRole("link", { name: "Agentes" })).toHaveAttribute(
      "href",
      "/agents",
    );
    expect(screen.getByRole("link", { name: "Actividad" })).toHaveAttribute(
      "href",
      "/activity",
    );
    expect(screen.getByRole("link", { name: "Ajustes" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("separa los proyectos de los chats y enlaza cada chat a su proyecto", () => {
    mocks.projects = [makeProject()];
    mocks.chats = [makeChat({ id: "c1", title: "Plan inicial" })];

    render(<AppShell>contenido</AppShell>);

    expect(screen.getByRole("navigation", { name: "Proyectos" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Chats" })).toBeTruthy();
    expect(screen.getByRole("separator")).toBeTruthy();

    const chatLink = screen.getByRole("link", { name: "Plan inicial" });
    expect(chatLink).toHaveAttribute("href", "/projects/p1?chat=c1");
  });

  it("muestra el separador y las etiquetas aunque no haya chats", () => {
    mocks.projects = [makeProject()];

    render(<AppShell>contenido</AppShell>);

    expect(screen.getByRole("navigation", { name: "Proyectos" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Chats" })).toBeTruthy();
    expect(screen.getByRole("separator")).toBeTruthy();
    expect(screen.getByText("Proyectos")).toBeTruthy();
    expect(screen.getByText("Chats")).toBeTruthy();
  });

  it("no ofrece control para expandir la barra lateral", () => {
    render(<AppShell>contenido</AppShell>);

    expect(
      screen.queryByRole("button", { name: /barra lateral/i }),
    ).toBeNull();
  });

  it("dispara las acciones de nuevo proyecto y buscar", async () => {
    const onNewProject = vi.fn();
    const onOpenSearch = vi.fn();

    render(
      <AppShell onNewProject={onNewProject} onOpenSearch={onOpenSearch}>
        contenido
      </AppShell>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Nuevo proyecto" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Buscar" }));

    expect(onNewProject).toHaveBeenCalledTimes(1);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it("marca Agentes cuando hay un agente conectado", () => {
    mocks.info = { agents: [{ connected: true }] };

    render(<AppShell>contenido</AppShell>);

    const agents = screen.getByRole("link", { name: "Agentes" });
    expect(agents.querySelector(".bg-success")).not.toBeNull();
  });
});
