import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImportProjectDialog } from "./ImportProjectDialog";

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
    pickFolder: vi.fn().mockResolvedValue({ path: null }),
    listFinalBranches: vi.fn(),
    importProject: vi.fn(),
  },
}));

import { api } from "../../lib/api";

describe("ImportProjectDialog", () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(api.listFinalBranches).mockReset();
    vi.mocked(api.importProject).mockReset();
  });

  it("lista las ramas finales e importa la seleccionada", async () => {
    vi.mocked(api.listFinalBranches).mockResolvedValue({
      branches: ["agent/project-p1-final"],
    });
    vi.mocked(api.importProject).mockResolvedValue({
      id: "p1",
      name: "Calculadora",
    } as never);

    render(<ImportProjectDialog open onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("Carpeta del repositorio"), {
      target: { value: "/Users/victor/Developer/calculadora" },
    });

    await waitFor(() =>
      expect(api.listFinalBranches).toHaveBeenCalledWith(
        "/Users/victor/Developer/calculadora",
      ),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "agent/project-p1-final" }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Importar" }));

    await waitFor(() =>
      expect(api.importProject).toHaveBeenCalledWith({
        repoPath: "/Users/victor/Developer/calculadora",
        branch: "agent/project-p1-final",
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/projects/p1"));
  });

  it("valida que la carpeta no esté vacía", async () => {
    render(<ImportProjectDialog open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));

    await waitFor(() =>
      expect(
        screen.getByText("Indica la carpeta del proyecto."),
      ).toBeInTheDocument(),
    );
    expect(api.importProject).not.toHaveBeenCalled();
  });
});
