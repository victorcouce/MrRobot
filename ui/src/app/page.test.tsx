import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentAvailability, AgentSpec } from "@/lib/types";
import HomePage from "./page";

const CALC_SPACE = {
  id: "s1",
  name: "Calculadora",
  icon: "calculator",
  path: "/proyectos/calc",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  search: "",
  createProject: vi.fn(),
  createStandaloneChat: vi.fn(),
  listSpaces: vi.fn(),
  createSpace: vi.fn(),
  info: {
    agents: [] as AgentAvailability[],
    config: { defaultAllowedAgents: [] as AgentSpec[] },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("@/lib/hooks", () => ({
  useAppInfo: () => ({ info: mocks.info, refresh: vi.fn() }),
}));

vi.mock("@/components/RobotLottie", () => ({
  RobotLottie: () => null,
}));

vi.mock("@/lib/api", () => ({
  api: {
    pickFolder: vi.fn(),
    createProject: mocks.createProject,
    createStandaloneChat: mocks.createStandaloneChat,
    listSpaces: mocks.listSpaces,
    createSpace: mocks.createSpace,
  },
}));

import { api } from "@/lib/api";
import { takePendingMessage } from "@/lib/pending-message";

async function pickCalcSpace() {
  fireEvent.click(screen.getByRole("button", { name: "Seleccionar proyecto" }));
  fireEvent.click(await screen.findByRole("button", { name: "Calculadora" }));
  await screen.findByRole("button", { name: /Proyecto: Calculadora/ });
}

describe("Inicio", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.search = "";
    mocks.createStandaloneChat.mockReset();
    mocks.createStandaloneChat.mockResolvedValue({ id: "c9" });
    mocks.createProject.mockReset();
    mocks.createProject.mockResolvedValue({ id: "p1" });
    mocks.info.agents = [];
    mocks.info.config.defaultAllowedAgents = [];
    mocks.listSpaces.mockReset();
    mocks.listSpaces.mockResolvedValue([CALC_SPACE]);
    mocks.createSpace.mockReset();
    vi.mocked(api.pickFolder).mockReset();
  });

  it("elige un proyecto existente desde el composer", async () => {
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "Seleccionar proyecto" }));
    fireEvent.change(await screen.findByLabelText("Buscar proyectos"), {
      target: { value: "calc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Calculadora" }));

    expect(
      await screen.findByRole("button", { name: /Proyecto: Calculadora/ }),
    ).toBeInTheDocument();
  });

  it("crea un proyecto nuevo con icono, nombre y carpeta", async () => {
    vi.mocked(api.pickFolder).mockResolvedValue({ path: "/proyectos/recetas" });
    mocks.createSpace.mockResolvedValue({
      ...CALC_SPACE,
      id: "s2",
      name: "Recetas",
      icon: "palette",
      path: "/proyectos/recetas",
    });

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "Seleccionar proyecto" }));
    fireEvent.click(screen.getByRole("button", { name: "Nuevo proyecto" }));

    const crear = screen.getByRole("button", { name: "Crear proyecto" });
    expect(crear).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Elegir icono" }));
    fireEvent.click(screen.getByRole("button", { name: "Paleta" }));
    fireEvent.change(screen.getByLabelText("Nombre del proyecto"), {
      target: { value: "Recetas" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Examinar/ }));
    await waitFor(() => {
      expect(screen.getByLabelText("Carpeta del proyecto")).toHaveValue(
        "/proyectos/recetas",
      );
    });

    fireEvent.click(crear);

    await waitFor(() => {
      expect(mocks.createSpace).toHaveBeenCalledWith({
        name: "Recetas",
        icon: "palette",
        path: "/proyectos/recetas",
      });
    });
    expect(
      await screen.findByRole("button", { name: /Proyecto: Recetas/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Crear proyecto" })).toBeNull();
  });

  it("crea el proyecto y abre el hilo del chat", async () => {

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("Mensaje"), {
      target: { value: "una calculadora" },
    });
    await pickCalcSpace();

    fireEvent.click(screen.getByRole("button", { name: /Planificar/ }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/projects/p1");
    });
    expect(mocks.createProject).toHaveBeenCalledWith({
      goal: "una calculadora",
      name: "Calculadora",
      icon: "calculator",
      repoPath: "/proyectos/calc",
    });
  });

  it("adjunta archivos al crear el proyecto", async () => {
    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("Mensaje"), {
      target: { value: "una calculadora" },
    });
    await pickCalcSpace();

    fireEvent.click(screen.getByRole("button", { name: /Adjuntar/ }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["# Requisitos"], "requisitos.md", {
      type: "text/markdown",
    });
    // jsdom no implementa Blob.arrayBuffer.
    file.arrayBuffer = async () => new TextEncoder().encode("# Requisitos").buffer;
    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByText("requisitos.md");
    fireEvent.click(screen.getByRole("button", { name: /Planificar/ }));

    await waitFor(() => expect(mocks.createProject).toHaveBeenCalled());
    expect(mocks.createProject).toHaveBeenCalledWith({
      goal: "una calculadora",
      name: "Calculadora",
      icon: "calculator",
      repoPath: "/proyectos/calc",
      attachments: [
        {
          name: "requisitos.md",
          type: "markdown",
          mimeType: "text/markdown",
          size: 12,
          data: btoa("# Requisitos"),
        },
      ],
    });
  });

  it("sin proyecto abre un chat suelto y le pasa el mensaje", async () => {
    render(<HomePage />);
    await waitFor(() => expect(mocks.listSpaces).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Mensaje"), {
      target: { value: "¿qué stack me recomiendas?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Enviar/ }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/chats/c9"));
    expect(mocks.createStandaloneChat).toHaveBeenCalledWith({});
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(takePendingMessage("c9")).toEqual({ content: "¿qué stack me recomiendas?" });
    // Solo se entrega una vez.
    expect(takePendingMessage("c9")).toBeUndefined();
  });

  it("desde «Nuevo proyecto» sin carpeta resalta el selector en vez de continuar", async () => {
    mocks.search = "nuevo=proyecto";
    render(<HomePage />);
    await waitFor(() => expect(mocks.listSpaces).toHaveBeenCalled());
    // Llega con el selector abierto.
    expect(await screen.findByRole("dialog", { name: "Proyectos" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.change(screen.getByLabelText("Mensaje"), {
      target: { value: "una calculadora" },
    });

    const planificar = screen.getByRole("button", { name: /Planificar/ });
    const proyecto = screen.getByRole("button", { name: "Seleccionar proyecto" });

    fireEvent.click(planificar);
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.createStandaloneChat).not.toHaveBeenCalled();
    expect(proyecto.className).toContain("shake-x");
    expect(proyecto.className).toContain("border-ink");
  });

  it("con un proyecto elegido se puede volver a solo chat", async () => {
    render(<HomePage />);
    fireEvent.change(screen.getByLabelText("Mensaje"), { target: { value: "hola" } });
    await pickCalcSpace();
    expect(screen.getByRole("button", { name: /Planificar/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Proyecto: Calculadora/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sin proyecto (solo chat)" }));

    expect(screen.getByRole("button", { name: /Enviar/ })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Modo rápido" })).toBeNull();
  });

  it("pasa los agentes marcados en el composer al crear el proyecto", async () => {
    mocks.info.agents = [
      { provider: "codex", label: "Codex", connected: true },
      { provider: "claude", label: "Claude", connected: true },
      {
        provider: "deepseek",
        label: "DeepSeek",
        connected: false,
        reason: "DEEPSEEK_API_KEY no está definida.",
      },
    ];
    mocks.info.config.defaultAllowedAgents = [
      { provider: "codex" },
      { provider: "claude", model: "sonnet" },
    ];

    render(<HomePage />);

    expect(
      screen.getByRole("button", {
        name: "Agentes de este chat: 2 de 6 marcados",
      }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Mensaje"), {
      target: { value: "una calculadora" },
    });
    await pickCalcSpace();
    fireEvent.click(screen.getByRole("button", { name: /Planificar/ }));

    await waitFor(() => {
      expect(mocks.createProject).toHaveBeenCalledWith({
        goal: "una calculadora",
        name: "Calculadora",
      icon: "calculator",
        repoPath: "/proyectos/calc",
        defaultAllowedAgents: [
          { provider: "codex" },
          { provider: "claude", model: "sonnet" },
        ],
      });
    });
  });

  it("con el modo rápido activo crea el proyecto con config.fastMode", async () => {

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("Mensaje"), {
      target: { value: "una calculadora" },
    });
    await pickCalcSpace();

    const toggle = screen.getByRole("switch", { name: "Modo rápido" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /Planificar/ }));

    await waitFor(() => {
      expect(mocks.createProject).toHaveBeenCalledWith({
        goal: "una calculadora",
        name: "Calculadora",
      icon: "calculator",
        repoPath: "/proyectos/calc",
        config: { fastMode: true },
      });
    });
  });

  it("con la ejecución automática activa crea el proyecto con config.autoRun", async () => {
    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("Mensaje"), {
      target: { value: "una calculadora" },
    });
    await pickCalcSpace();

    fireEvent.click(screen.getByRole("switch", { name: "Ejecución automática" }));
    fireEvent.click(screen.getByRole("button", { name: /Planificar/ }));

    await waitFor(() => {
      expect(mocks.createProject).toHaveBeenCalledWith({
        goal: "una calculadora",
        name: "Calculadora",
        icon: "calculator",
        repoPath: "/proyectos/calc",
        config: { autoRun: true },
      });
    });
  });
});
