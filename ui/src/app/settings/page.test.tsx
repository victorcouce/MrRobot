import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./page";

vi.mock("@/lib/api", () => ({
  api: {
    updateConfig: vi.fn(),
    checkDeepSeekKey: vi.fn(),
  },
}));

const refresh = vi.fn();

let info: unknown = null;

vi.mock("@/lib/hooks", () => ({
  useAppInfo: () => ({ info, refresh }),
}));

import { api } from "@/lib/api";

function makeInfo(overrides: Record<string, unknown> = {}) {
  return {
    repoRoot: "/repo",
    baseRef: "base",
    mock: false,
    githubToken: false,
    agents: [
      { provider: "codex", label: "Codex", connected: true },
      { provider: "claude", label: "Claude", connected: true },
      {
        provider: "deepseek",
        label: "DeepSeek",
        connected: false,
        reason: "DEEPSEEK_API_KEY no está definida.",
      },
    ],
    config: {
      concurrency: 2,
      maxRetriesPerAgent: 1,
      maxReviewFixCycles: 2,
      plannerMaxAttempts: 2,
      checks: { commands: [] },
      defaultAllowedAgents: [{ provider: "codex" }],
      ...overrides,
    },
  };
}

describe("Ajustes", () => {
  beforeEach(() => {
    info = makeInfo();
    refresh.mockClear();
    vi.mocked(api.updateConfig).mockReset().mockResolvedValue({} as never);
    vi.mocked(api.checkDeepSeekKey).mockReset();
  });

  it("guarda los checks y los agentes marcados por defecto", async () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Agentes" }));

    // Codex, el primero de la lista, viene marcado desde la configuración y no
    // de un defaultChecked.
    const marks = screen.getAllByLabelText("Marcado por defecto");
    expect(marks[0]).toBeChecked();
    expect(marks[1]).not.toBeChecked();

    // Marcar claude/sonnet hace aparecer el guardado.
    fireEvent.click(marks[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalled();
    });

    const sent = vi.mocked(api.updateConfig).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(sent.checks).toEqual({ commands: [] });
    expect(sent.defaultAllowedAgents).toEqual([
      { provider: "codex" },
      { provider: "claude", model: "sonnet" },
    ]);
  });

  it("al desactivar la detección automática envía los comandos", async () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Checks" }));
    fireEvent.click(
      screen.getByRole("switch", { name: "Detectar scripts automáticamente" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalled();
    });

    const sent = vi.mocked(api.updateConfig).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(sent.checks).toEqual({
      commands: ["typecheck", "build", "test"],
    });
  });

  it("comprueba la clave de DeepSeek y avisa si no se pudo guardar en .env", async () => {
    vi.mocked(api.checkDeepSeekKey).mockResolvedValue({
      ok: true,
      applied: true,
      persisted: false,
    });

    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Agentes" }));

    fireEvent.change(screen.getByPlaceholderText("DEEPSEEK_API_KEY"), {
      target: { value: "sk-test" },
    });
    // DeepSeek es el primero de los dos «Comprobar y aplicar» (luego LM Studio).
    fireEvent.click(
      screen.getAllByRole("button", { name: /Comprobar y aplicar/ })[0]!,
    );

    await waitFor(() => {
      expect(api.checkDeepSeekKey).toHaveBeenCalledWith("sk-test");
    });

    expect(await screen.findByRole("status")).toHaveTextContent(/\.env/);
  });

  it("muestra el estado real de GITHUB_TOKEN", async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "GitHub" }));
    expect(screen.getByText("Sin definir")).toBeInTheDocument();
  });
});
