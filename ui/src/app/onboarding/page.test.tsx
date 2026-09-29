import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingPage from "./page";
import { ONBOARDING_DISMISSED_KEY } from "@/lib/onboarding";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    updateConfig: vi.fn(),
    completeOnboarding: vi.fn(),
    checkDeepSeekKey: vi.fn(),
    checkGitHubToken: vi.fn(),
  },
}));

const refresh = vi.fn().mockResolvedValue(undefined);
let info: unknown = null;

vi.mock("@/lib/hooks", () => ({
  useAppInfo: () => ({ info, error: null, refresh }),
}));

import { api } from "@/lib/api";

function makeInfo(connected: { codex?: boolean; claude?: boolean } = {}) {
  return {
    repoRoot: "/repo",
    baseRef: "main",
    mock: false,
    githubToken: false,
    onboarding: { completed: false },
    agents: [
      { provider: "codex", label: "Codex", connected: connected.codex ?? false },
      { provider: "claude", label: "Claude", connected: connected.claude ?? false },
      { provider: "deepseek", label: "DeepSeek", connected: false },
      { provider: "lmstudio", label: "LM Studio", connected: false },
    ],
    config: {
      concurrency: 3,
      maxConcurrency: 6,
      maxRetriesPerAgent: 1,
      maxReviewFixCycles: 2,
      plannerMaxAttempts: 2,
      checks: { commands: [] },
      defaultAllowedAgents: [],
    },
  };
}

describe("Asistente de configuración", () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
    window.sessionStorage.clear();
    vi.mocked(api.updateConfig).mockReset().mockResolvedValue({} as never);
    vi.mocked(api.completeOnboarding).mockReset().mockResolvedValue({ completed: true });
    vi.mocked(api.checkDeepSeekKey).mockReset();
  });

  it("no deja avanzar sin un agente conectado que escriba código", () => {
    info = makeInfo();
    render(<OnboardingPage />);

    fireEvent.click(screen.getByRole("button", { name: "Empezar" }));

    expect(screen.getByText("Conecta tus agentes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  });

  it("valida y guarda la clave de DeepSeek desde su tarjeta", async () => {
    info = makeInfo();
    vi.mocked(api.checkDeepSeekKey).mockResolvedValue({
      ok: true,
      applied: true,
      persisted: true,
    });
    render(<OnboardingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Empezar" }));

    fireEvent.change(screen.getByLabelText("Clave de DeepSeek"), {
      target: { value: "sk-test" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Validar y guardar" })[0]!);

    await waitFor(() => expect(api.checkDeepSeekKey).toHaveBeenCalledWith("sk-test"));
    expect(await screen.findByRole("status")).toHaveTextContent("Guardada en .env");
    expect(refresh).toHaveBeenCalled();
  });

  it("guarda los agentes por defecto conectados y termina el asistente", async () => {
    info = makeInfo({ claude: true });
    render(<OnboardingPage />);

    fireEvent.click(screen.getByRole("button", { name: "Empezar" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    const sonnet = screen.getByRole("checkbox", { name: /Claude Sonnet/ });
    expect(sonnet).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Codex/ })).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Guardar y seguir" }));
    await waitFor(() =>
      expect(api.updateConfig).toHaveBeenCalledWith({
        defaultAllowedAgents: [{ provider: "claude", model: "sonnet" }],
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Saltar" }));
    fireEvent.click(screen.getByRole("button", { name: "Ir a Mr. Robot" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(api.completeOnboarding).toHaveBeenCalled();
    expect(window.sessionStorage.getItem(ONBOARDING_DISMISSED_KEY)).toBe("1");
  });

  it("omitir por ahora vuelve al inicio sin completar", () => {
    info = makeInfo();
    render(<OnboardingPage />);

    fireEvent.click(screen.getByRole("button", { name: "Omitir por ahora" }));

    expect(push).toHaveBeenCalledWith("/");
    expect(api.completeOnboarding).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(ONBOARDING_DISMISSED_KEY)).toBe("1");
  });
});
