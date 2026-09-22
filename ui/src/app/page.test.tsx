import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentAvailability, AgentSpec } from "@/lib/types";
import HomePage from "./page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  createProject: vi.fn(),
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
  },
}));

import { api } from "@/lib/api";

describe("Inicio", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.createProject.mockReset();
    mocks.createProject.mockResolvedValue({ id: "p1" });
    mocks.info.agents = [];
    mocks.info.config.defaultAllowedAgents = [];
    vi.mocked(api.pickFolder).mockReset();
  });

  it("muestra la carpeta elegida desde el composer", async () => {
    vi.mocked(api.pickFolder).mockResolvedValue({ path: "/proyectos/calc" });

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: /Seleccionar carpeta/ }));

    await waitFor(() => {
      expect(screen.getByText("/proyectos/calc")).toBeInTheDocument();
    });
    expect(api.pickFolder).toHaveBeenCalled();
  });

  it("crea el proyecto y abre el hilo del chat", async () => {
    vi.mocked(api.pickFolder).mockResolvedValue({ path: "/proyectos/calc" });

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("Objetivo del proyecto"), {
      target: { value: "una calculadora" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Seleccionar carpeta/ }));
    await screen.findByText("/proyectos/calc");

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

  it("sin carpeta resalta el campo en vez de continuar", () => {
    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("Objetivo del proyecto"), {
      target: { value: "una calculadora" },
    });

    const planificar = screen.getByRole("button", { name: /Planificar/ });
    expect(planificar).toBeEnabled();

    const carpeta = screen.getByRole("button", { name: /Seleccionar carpeta/ });

    fireEvent.click(planificar);
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(carpeta.className).toContain("shake-x");
    expect(carpeta.className).toContain("border-ink");
  });

  it("pasa los agentes marcados en el composer al crear el proyecto", async () => {
    vi.mocked(api.pickFolder).mockResolvedValue({ path: "/proyectos/calc" });
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
    fireEvent.click(screen.getByRole("button", { name: /Seleccionar carpeta/ }));
    await screen.findByText("/proyectos/calc");
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
    vi.mocked(api.pickFolder).mockResolvedValue({ path: "/proyectos/calc" });

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("Objetivo del proyecto"), {
      target: { value: "una calculadora" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Seleccionar carpeta/ }));
    await screen.findByText("/proyectos/calc");

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
