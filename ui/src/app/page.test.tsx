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
  createProject: vi.fn(),
  listSpaces: vi.fn(),
  createSpace: vi.fn(),
  info: {
    agents: [] as AgentAvailability[],
    config: { defaultAllowedAgents: [] as AgentSpec[] },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
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
    listSpaces: mocks.listSpaces,
    createSpace: mocks.createSpace,
  },
}));

import { api } from "@/lib/api";

async function pickCalcSpace() {
  fireEvent.click(screen.getByRole("button", { name: "Seleccionar proyecto" }));
  fireEvent.click(await screen.findByRole("button", { name: "Calculadora" }));
  await screen.findByRole("button", { name: /Proyecto: Calculadora/ });
}

describe("Inicio", () => {
  beforeEach(() => {
    mocks.push.mockReset();
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

    fireEvent.change(screen.getByLabelText("Objetivo del proyecto"), {
      target: { value: "una calculadora" },
    });
    await pickCalcSpace();

    fireEvent.click(screen.getByRole("button", { name: /Planificar/ }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/projects/p1");
    });
    expect(mocks.createProject).toHaveBeenCalledWith({
      goal: "una calculadora",
      name: "una-calculadora",
      repoPath: "/proyectos/calc",
    });
  });

  it("sin proyecto resalta el selector en vez de continuar", async () => {
    render(<HomePage />);
    await waitFor(() => expect(mocks.listSpaces).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Objetivo del proyecto"), {
      target: { value: "una calculadora" },
    });

    const planificar = screen.getByRole("button", { name: /Planificar/ });
    expect(planificar).toBeEnabled();

    const proyecto = screen.getByRole("button", { name: "Seleccionar proyecto" });

    fireEvent.click(planificar);
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(proyecto.className).toContain("shake-x");
    expect(proyecto.className).toContain("border-ink");
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

    fireEvent.change(screen.getByLabelText("Objetivo del proyecto"), {
      target: { value: "una calculadora" },
    });
    await pickCalcSpace();
    fireEvent.click(screen.getByRole("button", { name: /Planificar/ }));

    await waitFor(() => {
      expect(mocks.createProject).toHaveBeenCalledWith({
        goal: "una calculadora",
        name: "una-calculadora",
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

    fireEvent.change(screen.getByLabelText("Objetivo del proyecto"), {
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
        name: "una-calculadora",
        repoPath: "/proyectos/calc",
        config: { fastMode: true },
      });
    });
  });
});
