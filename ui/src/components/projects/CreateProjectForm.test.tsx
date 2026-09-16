import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateProjectForm } from "./CreateProjectForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    info: vi.fn().mockResolvedValue({
      repoRoot: "/repo",
      baseRef: "base",
      mock: false,
      agents: [],
      config: {
        concurrency: 2,
        maxRetriesPerAgent: 1,
        maxReviewFixCycles: 2,
        plannerMaxAttempts: 2,
        plannerAgent: { provider: "claude", model: "opus" },
        reviewerAgent: { provider: "claude", model: "opus" },
        supervisorAgent: { provider: "claude", model: "opus" },
      },
    }),
    createProject: vi.fn().mockResolvedValue({ id: "p1", status: "draft" }),
    generatePlan: vi.fn().mockResolvedValue({ id: "p1", status: "planning" }),
    pickFolder: vi.fn().mockResolvedValue({ path: null }),
  },
}));

import { api } from "../../lib/api";

describe("CreateProjectForm", () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(api.createProject).mockClear();
    vi.mocked(api.generatePlan).mockClear();
    vi.mocked(api.pickFolder).mockClear();
    vi.mocked(api.pickFolder).mockResolvedValue({ path: null });
  });

  it("crea el proyecto y genera el plan", async () => {
    render(<CreateProjectForm />);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Poketo" },
    });
    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "Crear una app iOS" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate plan" }));

    await waitFor(() => {
      expect(api.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ goal: "Crear una app iOS", name: "Poketo" }),
      );
    });
    await waitFor(() => {
      expect(api.generatePlan).toHaveBeenCalledWith("p1");
    });
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/projects/p1");
    });
  });

  it("valida que el objetivo no esté vacío", async () => {
    render(<CreateProjectForm />);
    fireEvent.click(screen.getByRole("button", { name: "Generate plan" }));
    await waitFor(() => {
      expect(screen.getByText("Describe qué quieres construir.")).toBeInTheDocument();
    });
    expect(api.createProject).not.toHaveBeenCalled();
  });

  it("incluye la carpeta elegida y el remoto de GitHub", async () => {
    vi.mocked(api.pickFolder).mockResolvedValue({ path: "/tmp/calc" });
    render(<CreateProjectForm />);

    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "Una calculadora web" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Examinar…" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Carpeta del proyecto")).toHaveValue(
        "/tmp/calc",
      );
    });

    fireEvent.change(screen.getByLabelText("Repositorio GitHub (opcional)"), {
      target: { value: "https://github.com/acme/calc.git" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate plan" }));

    await waitFor(() => {
      expect(api.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          goal: "Una calculadora web",
          repoPath: "/tmp/calc",
          remoteUrl: "https://github.com/acme/calc.git",
        }),
      );
    });
  });
});
