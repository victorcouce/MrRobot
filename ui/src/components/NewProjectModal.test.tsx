import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewProjectModal } from "./NewProjectModal";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    info: vi.fn(),
    pickFolder: vi.fn(),
    checkFolder: vi.fn(),
    checkRemote: vi.fn(),
    createProject: vi.fn(),
    generatePlan: vi.fn(),
    createChat: vi.fn(),
  },
}));

import { api } from "@/lib/api";

const INFO = {
  repoRoot: "/repo",
  baseRef: "base",
  mock: false,
  agents: [
    { provider: "codex" as const, label: "codex", connected: true },
    { provider: "claude" as const, label: "claude", connected: true },
    { provider: "deepseek" as const, label: "deepseek", connected: false },
  ],
  githubToken: false,
  config: {
    concurrency: 2,
    maxRetriesPerAgent: 1,
    maxReviewFixCycles: 2,
    plannerMaxAttempts: 2,
    plannerAgent: { provider: "claude" as const, model: "opus" as const },
    reviewerAgent: { provider: "claude" as const, model: "opus" as const },
    supervisorAgent: { provider: "claude" as const, model: "opus" as const },
    checks: { commands: [] },
    defaultAllowedAgents: [
      { provider: "codex" as const },
      { provider: "claude" as const, model: "sonnet" as const },
    ],
  },
};

describe("NewProjectModal", () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(api.info).mockResolvedValue(INFO);
    vi.mocked(api.checkFolder).mockReset();
    vi.mocked(api.checkRemote).mockReset();
    vi.mocked(api.createProject).mockReset();
    vi.mocked(api.generatePlan).mockReset();
  });

  it("muestra la rama base que devuelve el backend, no un texto fijo", async () => {
    vi.mocked(api.checkFolder).mockResolvedValue({
      path: "/proyectos/calc",
      exists: true,
      creatable: false,
      isRepo: true,
      root: "/proyectos/calc",
      branch: "develop",
      dirty: false,
    });

    render(<NewProjectModal open onClose={() => {}} />);

    // Sin carpeta no se afirma nada sobre git.
    expect(screen.queryByText(/Repositorio git/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("~/proyectos/calc"), {
      target: { value: "/proyectos/calc" },
    });

    await waitFor(
      () => {
        expect(screen.getByText(/Repositorio git/)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    expect(screen.getByText("develop")).toBeInTheDocument();
    expect(api.checkFolder).toHaveBeenCalledWith("/proyectos/calc");
  });

  it("impide crear si la carpeta no es accesible", async () => {
    vi.mocked(api.checkFolder).mockResolvedValue({
      path: "/no/existe/nada",
      exists: false,
      creatable: false,
      isRepo: false,
      error: "La carpeta no existe y su carpeta padre tampoco.",
    });

    render(<NewProjectModal open onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText(/Calculadora web/), {
      target: { value: "una calculadora" },
    });
    fireEvent.change(screen.getByPlaceholderText("~/proyectos/calc"), {
      target: { value: "/no/existe/nada" },
    });

    await waitFor(
      () => {
        expect(
          screen.getByText("La carpeta no existe y su carpeta padre tampoco."),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    expect(
      screen.getByRole("button", { name: /Crear y planificar/ }),
    ).toBeDisabled();
    expect(api.createProject).not.toHaveBeenCalled();
  });

  it("genera el plan al crear cuando la opción está marcada", async () => {
    vi.mocked(api.createProject).mockResolvedValue({ id: "p1" } as never);
    vi.mocked(api.generatePlan).mockResolvedValue({ id: "p1" } as never);

    render(<NewProjectModal open onClose={() => {}} />);

    // Los chips se marcan cuando llega la configuración del backend.
    await waitFor(() => {
      expect(screen.getByLabelText(/Codex/)).toBeChecked();
    });

    fireEvent.change(screen.getByPlaceholderText(/Calculadora web/), {
      target: { value: "una calculadora" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Crear y planificar/ }));

    await waitFor(() => {
      expect(api.generatePlan).toHaveBeenCalledWith("p1");
    });

    expect(push).toHaveBeenCalledWith("/projects/p1");
    // Los agentes marcados en Ajustes llegan como defecto del proyecto.
    expect(vi.mocked(api.createProject).mock.calls[0]?.[0]).toMatchObject({
      defaultAllowedAgents: [
        { provider: "codex" },
        { provider: "claude", model: "sonnet" },
      ],
    });
  });

  it("no genera el plan si se desactiva la opción", async () => {
    vi.mocked(api.createProject).mockResolvedValue({ id: "p2" } as never);

    render(<NewProjectModal open onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText(/Calculadora web/), {
      target: { value: "otra cosa" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Más opciones/ }));
    fireEvent.click(screen.getByLabelText(/Generar el plan al crear/));

    fireEvent.click(screen.getByRole("button", { name: /Crear proyecto/ }));

    await waitFor(() => {
      expect(api.createProject).toHaveBeenCalled();
    });

    expect(api.generatePlan).not.toHaveBeenCalled();
  });
});
