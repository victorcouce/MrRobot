import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSummary, ProjectStats, ProjectSummary, Space } from "../../lib/types";
import { AppShell } from "./AppShell";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  search: "",
  projects: [] as ProjectSummary[],
  chats: [] as ChatSummary[],
  spaces: [] as Space[],
  info: null as { agents?: { connected: boolean }[] } | null,
  push: vi.fn(),
  deleteProject: vi.fn(),
  deleteChatById: vi.fn(),
  updateChat: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.search),
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
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
  useSpaces: () => ({ spaces: mocks.spaces, refresh: vi.fn() }),
  useAppInfo: () => ({ info: mocks.info, error: null, refresh: vi.fn() }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    deleteProject: mocks.deleteProject,
    deleteChatById: mocks.deleteChatById,
    updateChat: mocks.updateChat,
    updateProject: mocks.updateProject,
  },
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

const DAY = 24 * 60 * 60 * 1000;

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function makeProject(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  const now = new Date().toISOString();
  return {
    id: "p1",
    name: "Web",
    goal: "Landing de la web",
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
    title: "Ajustar el header",
    createdAt: now,
    updatedAt: now,
    messageCount: 2,
    taskIds: [],
    ...overrides,
  };
}

function makeSpace(overrides: Partial<Space> = {}): Space {
  const now = new Date().toISOString();
  return {
    id: "s1",
    name: "Tienda",
    icon: "cart",
    path: "/repos/tienda",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Node trae su propio `localStorage` (incompleto) que tapa el de jsdom. */
function installMemoryStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  });
}

async function openMenu(label: string) {
  await userEvent.click(screen.getByRole("button", { name: `Opciones de ${label}` }));
  return screen.getByRole("menu", { name: `Opciones de ${label}` });
}

describe("AppShell", () => {
  beforeEach(() => {
    mocks.pathname = "/";
    mocks.search = "";
    mocks.projects = [];
    mocks.chats = [];
    mocks.spaces = [];
    mocks.info = null;
    mocks.push.mockReset();
    mocks.deleteProject.mockReset().mockResolvedValue({ deleted: true });
    mocks.deleteChatById.mockReset().mockResolvedValue({ deleted: true });
    mocks.updateChat.mockReset().mockImplementation(async (id: string, patch: object) => ({
      ...mocks.chats.find((chat) => chat.id === id),
      ...patch,
      messages: [],
    }));
    mocks.updateProject.mockReset().mockResolvedValue({});
    installMemoryStorage();
  });

  it("separa Proyectos (fijados primero, por actividad) de los Chats sueltos", () => {
    mocks.projects = [
      makeProject({ id: "a", goal: "Reciente", updatedAt: ago(1000) }),
      makeProject({ id: "b", goal: "Antiguo fijado", updatedAt: ago(30 * DAY), pinned: true }),
      makeProject({ id: "x", goal: "Archivado", archivedAt: ago(1000) }),
    ];
    mocks.chats = [
      makeChat({ id: "loose", projectId: undefined, title: "Idea suelta" }),
      makeChat({ id: "gone", projectId: undefined, title: "Viejo", archivedAt: ago(1000) }),
    ];

    render(<AppShell>contenido</AppShell>);

    const projects = within(screen.getByRole("region", { name: "Proyectos" }));
    const links = projects.getAllByRole("link").map((link) => link.textContent);
    expect(links[0]).toMatch(/Antiguo fijado/);
    expect(links[1]).toMatch(/Reciente/);
    expect(projects.queryByRole("link", { name: /Archivado/ })).toBeNull();

    const chats = within(screen.getByRole("region", { name: "Chats" }));
    expect(chats.getByRole("link", { name: "Idea suelta" })).toHaveAttribute(
      "href",
      "/chats/loose",
    );
    expect(chats.queryByRole("link", { name: "Viejo" })).toBeNull();
  });

  it("sin chats sueltos no pinta la sección Chats", () => {
    mocks.projects = [makeProject()];
    mocks.chats = [makeChat()];
    render(<AppShell>contenido</AppShell>);
    expect(screen.queryByRole("region", { name: "Chats" })).toBeNull();
  });

  it("colapsa una sección y lo recuerda", async () => {
    mocks.projects = [makeProject()];

    const { unmount } = render(<AppShell>contenido</AppShell>);
    await userEvent.click(screen.getByRole("button", { name: /^Proyectos/ }));

    expect(screen.queryByRole("link", { name: /Landing de la web/ })).toBeNull();
    unmount();

    render(<AppShell>contenido</AppShell>);
    expect(screen.queryByRole("link", { name: /Landing de la web/ })).toBeNull();
  });

  it("despliega los chats del proyecto abierto y marca el chat activo", () => {
    mocks.pathname = "/projects/p1";
    mocks.search = "chat=c2";
    mocks.projects = [makeProject()];
    mocks.chats = [makeChat(), makeChat({ id: "c2", title: "Arreglar el footer" })];

    render(<AppShell>contenido</AppShell>);

    const chats = screen.getByRole("list", { name: /Chats de Landing de la web/ });
    const active = within(chats).getByRole("link", { name: "Arreglar el footer" });
    expect(active).toHaveAttribute("href", "/projects/p1?chat=c2");
    expect(active).toHaveAttribute("aria-current", "page");
  });

  it("marca el chat suelto abierto", () => {
    mocks.pathname = "/chats/loose";
    mocks.chats = [makeChat({ id: "loose", projectId: undefined, title: "Idea" })];
    render(<AppShell>contenido</AppShell>);
    expect(screen.getByRole("link", { name: "Idea" })).toHaveAttribute("aria-current", "page");
  });

  it("muestra «Sin chats aún» al desplegar un proyecto sin chats", async () => {
    mocks.projects = [makeProject()];

    render(<AppShell>contenido</AppShell>);
    await userEvent.click(screen.getByRole("button", { name: /Mostrar chats de/ }));

    expect(screen.getByText("Sin chats aún")).toBeTruthy();
  });

  it("lista cada espacio como un proyecto con sus objetivos dentro", async () => {
    mocks.spaces = [makeSpace()];
    mocks.projects = [
      makeProject({ id: "a", goal: "Carrito", repoPath: "/repos/tienda" }),
      makeProject({ id: "b", goal: "Otra cosa", repoPath: "/repos/otro" }),
    ];

    render(<AppShell>contenido</AppShell>);
    expect(screen.getByRole("link", { name: /Otra cosa/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Carrito/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Tienda/ }));
    expect(screen.getByRole("link", { name: /Carrito/ })).toBeTruthy();
  });

  it("renombra un chat desde el menú «⋯» en la propia fila", async () => {
    mocks.chats = [makeChat({ id: "loose", projectId: undefined, title: "Idea" })];
    render(<AppShell>contenido</AppShell>);

    const menu = await openMenu("Idea");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Renombrar" }));
    const input = screen.getByRole("textbox", { name: "Nuevo nombre del chat" });
    await userEvent.clear(input);
    await userEvent.type(input, "Idea buena{Enter}");

    expect(mocks.updateChat).toHaveBeenCalledWith("loose", { title: "Idea buena" });
  });

  it("Escape cancela el renombrado", async () => {
    mocks.projects = [makeProject()];
    render(<AppShell>contenido</AppShell>);

    const menu = await openMenu("Landing de la web");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Renombrar" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Nuevo nombre del proyecto" }),
      "xx{Escape}",
    );

    expect(mocks.updateProject).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /Landing de la web/ })).toBeTruthy();
  });

  it("fija y archiva un proyecto; archivar el abierto vuelve al inicio", async () => {
    mocks.pathname = "/projects/p1";
    mocks.projects = [makeProject()];
    render(<AppShell>contenido</AppShell>);

    let menu = await openMenu("Landing de la web");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Fijar proyecto" }));
    expect(mocks.updateProject).toHaveBeenCalledWith("p1", { pinned: true });

    menu = await openMenu("Landing de la web");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Archivar" }));
    expect(mocks.updateProject).toHaveBeenCalledWith("p1", { archived: true });
    expect(mocks.push).toHaveBeenCalledWith("/");
  });

  it("mueve un chat suelto a un proyecto desde el submenú", async () => {
    mocks.projects = [makeProject()];
    mocks.chats = [makeChat({ id: "loose", projectId: undefined, title: "Idea" })];
    render(<AppShell>contenido</AppShell>);

    const menu = await openMenu("Idea");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Mover a proyecto" }));
    const submenu = screen.getByRole("menu", { name: "Mover a proyecto" });
    await userEvent.click(within(submenu).getByRole("menuitem", { name: "Landing de la web" }));

    expect(mocks.updateChat).toHaveBeenCalledWith("loose", { projectId: "p1" });
  });

  it("arrastrar un chat sobre un proyecto lo mueve", () => {
    mocks.projects = [makeProject()];
    mocks.chats = [makeChat({ id: "loose", projectId: undefined, title: "Idea" })];
    render(<AppShell>contenido</AppShell>);

    const store = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => void store.set(type, value),
      getData: (type: string) => store.get(type) ?? "",
      get types() {
        return [...store.keys()];
      },
      effectAllowed: "",
      dropEffect: "",
    };
    fireEvent.dragStart(screen.getByRole("link", { name: "Idea" }), { dataTransfer });
    const target = screen.getByRole("link", { name: /Landing de la web/ });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    expect(mocks.updateChat).toHaveBeenCalledWith("loose", { projectId: "p1" });
  });

  it("enseña el error si el servidor rechaza mover el chat", async () => {
    mocks.projects = [makeProject(), makeProject({ id: "p2", goal: "Otro" })];
    mocks.chats = [makeChat()];
    mocks.pathname = "/projects/p1";
    mocks.updateChat.mockRejectedValue(new Error("No se puede mover este chat: ya generó tareas."));
    render(<AppShell>contenido</AppShell>);

    const menu = await openMenu("Ajustar el header");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Quitar del proyecto" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/ya generó tareas/);
  });

  it("borra un proyecto tras confirmar y vuelve al inicio si era el abierto", async () => {
    mocks.pathname = "/projects/p1";
    mocks.projects = [makeProject()];

    render(<AppShell>contenido</AppShell>);
    const menu = await openMenu("Landing de la web");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Eliminar proyecto" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar" }),
    );

    expect(mocks.deleteProject).toHaveBeenCalledWith("p1");
    expect(mocks.push).toHaveBeenCalledWith("/");
  });

  it("no deja borrar ni archivar un proyecto que se está ejecutando", async () => {
    mocks.projects = [makeProject({ status: "running" })];

    render(<AppShell>contenido</AppShell>);
    const menu = await openMenu("Landing de la web");

    expect(within(menu).getByRole("menuitem", { name: "Eliminar proyecto" })).toBeDisabled();
    expect(within(menu).getByRole("menuitem", { name: "Archivar" })).toBeDisabled();
  });

  it("borra un chat tras confirmar", async () => {
    mocks.pathname = "/projects/p1";
    mocks.projects = [makeProject()];
    mocks.chats = [makeChat()];

    render(<AppShell>contenido</AppShell>);
    const menu = await openMenu("Ajustar el header");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Eliminar" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar" }),
    );

    expect(mocks.deleteChatById).toHaveBeenCalledWith("c1");
  });

  it("el menú se navega con flechas y se cierra con Escape", async () => {
    mocks.projects = [makeProject()];
    render(<AppShell>contenido</AppShell>);

    const menu = await openMenu("Landing de la web");
    const items = within(menu).getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("clic derecho en una fila abre su menú", () => {
    mocks.chats = [makeChat({ id: "loose", projectId: undefined, title: "Idea" })];
    render(<AppShell>contenido</AppShell>);
    fireEvent.contextMenu(screen.getByRole("link", { name: "Idea" }), { clientX: 40, clientY: 40 });
    expect(screen.getByRole("menu", { name: "Opciones de Idea" })).toBeTruthy();
  });

  it("dispara nuevo chat, nuevo proyecto y la búsqueda", async () => {
    const onNewChat = vi.fn();
    const onNewProject = vi.fn();
    const onOpenSearch = vi.fn();

    render(
      <AppShell onNewChat={onNewChat} onNewProject={onNewProject} onOpenSearch={onOpenSearch}>
        contenido
      </AppShell>,
    );

    const sidebar = screen.getByRole("complementary", { name: "Barra lateral" });
    await userEvent.click(within(sidebar).getByRole("button", { name: /Nuevo chat/ }));
    await userEvent.click(within(sidebar).getByRole("button", { name: "Nuevo proyecto" }));
    await userEvent.click(within(sidebar).getByRole("button", { name: /Buscar chats/ }));

    expect(onNewChat).toHaveBeenCalledTimes(1);
    expect(onNewProject).toHaveBeenCalledTimes(1);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it("mantiene Agentes, Actividad, Archivados y Ajustes en el pie y marca agentes conectados", () => {
    mocks.info = { agents: [{ connected: true }] };

    render(<AppShell>contenido</AppShell>);

    const agents = screen.getByRole("link", { name: "Agentes" });
    expect(agents).toHaveAttribute("href", "/agents");
    expect(agents.querySelector(".bg-success")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Actividad" })).toHaveAttribute("href", "/activity");
    expect(screen.getByRole("link", { name: "Archivados" })).toHaveAttribute("href", "/archived");
    expect(screen.getByRole("link", { name: "Ajustes" })).toHaveAttribute("href", "/settings");
  });

  it("contraída deja una barra de iconos con los proyectos y la vuelve a expandir", async () => {
    mocks.pathname = "/projects/p1";
    mocks.projects = [makeProject({ icon: "calculator" })];
    const onNewChat = vi.fn();

    render(<AppShell onNewChat={onNewChat}>contenido</AppShell>);

    const sidebar = screen.getByRole("complementary", { name: "Barra lateral" });
    await userEvent.click(screen.getByRole("button", { name: "Ocultar barra lateral" }));
    expect(sidebar.className).toContain("md:hidden");

    const rail = screen.getByRole("complementary", { name: "Barra lateral contraída" });
    const project = within(rail).getByRole("link", { name: "Landing de la web" });
    expect(project).toHaveAttribute("href", "/projects/p1");
    expect(project).toHaveAttribute("aria-current", "page");
    expect(project.querySelector("svg")).not.toBeNull();
    expect(within(rail).getByRole("link", { name: "Ajustes" })).toHaveAttribute("href", "/settings");
    await userEvent.click(within(rail).getByRole("button", { name: "Nuevo chat" }));
    expect(onNewChat).toHaveBeenCalledTimes(1);

    await userEvent.click(within(rail).getByRole("button", { name: "Mostrar barra lateral" }));
    expect(screen.queryByRole("complementary", { name: "Barra lateral contraída" })).toBeNull();
    expect(sidebar.className).not.toContain("md:hidden");
  });
});
