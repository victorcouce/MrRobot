import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSummary, ProjectStats, ProjectSummary } from "../../lib/types";
import { AppShell } from "./AppShell";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  createChat: vi.fn(),
  refresh: vi.fn(),
  projects: [] as ProjectSummary[],
  chats: [] as ChatSummary[],
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: mocks.push }),
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
    refresh: mocks.refresh,
  }),
}));

vi.mock("../../lib/api", () => ({
  api: { createChat: mocks.createChat },
}));

vi.mock("./ThemeToggle", () => ({
  ThemeToggle: () => null,
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
    title: "Iterar login",
    createdAt: now,
    updatedAt: now,
    messageCount: 2,
    taskIds: ["C1-TASK-001"],
    ...overrides,
  };
}

describe("AppShell", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.createChat.mockReset();
    mocks.refresh.mockReset();
    mocks.projects = [];
    mocks.chats = [];
  });

  it("lista los chats agrupados por proyecto", () => {
    mocks.projects = [makeProject()];
    mocks.chats = [makeChat()];

    render(<AppShell>contenido</AppShell>);

    expect(screen.getByRole("link", { name: "Web" })).toHaveAttribute(
      "href",
      "/projects/p1",
    );
    expect(screen.getByRole("link", { name: /Iterar login/ })).toHaveAttribute(
      "href",
      "/projects/p1?chat=c1",
    );
  });

  it("crea un chat con el botón + y navega a él", async () => {
    mocks.projects = [makeProject()];
    mocks.createChat.mockResolvedValue({ id: "c9", projectId: "p1" });

    render(<AppShell>contenido</AppShell>);

    await userEvent.click(
      screen.getByRole("button", { name: "Nuevo chat en Web" }),
    );

    await waitFor(() => expect(mocks.createChat).toHaveBeenCalledWith("p1", {}));
    expect(mocks.push).toHaveBeenCalledWith("/projects/p1?chat=c9");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("deshabilita el botón + mientras el proyecto se ejecuta", () => {
    mocks.projects = [makeProject({ status: "running" })];

    render(<AppShell>contenido</AppShell>);

    expect(
      screen.getByRole("button", { name: "Nuevo chat en Web" }),
    ).toBeDisabled();
  });
});
