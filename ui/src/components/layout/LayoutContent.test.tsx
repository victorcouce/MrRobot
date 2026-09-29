import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutContent } from "./LayoutContent";
import { ONBOARDING_DISMISSED_KEY } from "../../lib/onboarding";

const replace = vi.fn();
let pathname = "/";
let info: unknown = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../../lib/hooks", () => ({
  useAppInfo: () => ({ info, error: null, refresh: vi.fn() }),
}));

// La barra lateral y la paleta no importan aquí.
vi.mock("./AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ),
}));
vi.mock("../CommandPalette", () => ({ CommandPalette: () => null }));

function makeInfo(overrides: Record<string, unknown> = {}) {
  return {
    mock: false,
    onboarding: { completed: true },
    agents: [{ provider: "claude", label: "Claude", connected: true }],
    ...overrides,
  };
}

describe("LayoutContent: asistente de configuración", () => {
  beforeEach(() => {
    replace.mockClear();
    pathname = "/";
    window.sessionStorage.clear();
  });

  it("redirige al asistente si nunca se completó", async () => {
    info = makeInfo({ onboarding: { completed: false } });
    render(<LayoutContent>hola</LayoutContent>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
  });

  it("redirige si no queda ningún agente conectado que escriba código", async () => {
    info = makeInfo({
      agents: [{ provider: "claude", label: "Claude", connected: false }],
    });
    render(<LayoutContent>hola</LayoutContent>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
  });

  it("no redirige con todo listo, en modo mock o tras omitirlo en la pestaña", () => {
    info = makeInfo();
    const { unmount } = render(<LayoutContent>hola</LayoutContent>);
    unmount();

    info = makeInfo({ mock: true, onboarding: { completed: false } });
    render(<LayoutContent>hola</LayoutContent>).unmount();

    window.sessionStorage.setItem(ONBOARDING_DISMISSED_KEY, "1");
    info = makeInfo({ onboarding: { completed: false } });
    render(<LayoutContent>hola</LayoutContent>);

    expect(replace).not.toHaveBeenCalled();
  });

  it("muestra el asistente a pantalla completa, sin la barra lateral", () => {
    pathname = "/onboarding";
    info = makeInfo({ onboarding: { completed: false } });
    render(<LayoutContent>asistente</LayoutContent>);

    expect(screen.getByText("asistente")).toBeInTheDocument();
    expect(screen.queryByTestId("shell")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
