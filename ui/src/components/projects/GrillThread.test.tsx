import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../lib/types";
import { GrillThread } from "./GrillThread";

vi.mock("../../lib/api", () => ({
  api: {
    grill: vi.fn(),
  },
}));

import { api } from "../../lib/api";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "calc-web",
    goal: "una calculadora",
    status: "draft",
    baseRef: "abc",
    tasks: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    stats: {
      total: 0,
      done: 0,
      running: 0,
      failed: 0,
      blocked: 0,
      ready: 0,
      todo: 0,
      progress: 0,
      activeAgents: 0,
    },
    agentsUsed: [],
    ...overrides,
  };
}

function renderGrill(props: Partial<Parameters<typeof GrillThread>[0]> = {}) {
  const onGeneratePlan = props.onGeneratePlan ?? vi.fn().mockResolvedValue(undefined);
  render(
    <GrillThread project={makeProject()} onGeneratePlan={onGeneratePlan} {...props} />,
  );
  return { onGeneratePlan };
}

describe("GrillThread", () => {
  beforeEach(() => {
    vi.mocked(api.grill).mockReset();
  });

  it("pregunta en rondas hasta llegar al entendimiento compartido", async () => {
    vi.mocked(api.grill)
      .mockResolvedValueOnce({
        status: "questions",
        message: "Ronda 1\n\nQ1 — Stack: ¿stack?\n➡️ Recomendado: React",
        questions: [
          {
            id: "Q1",
            title: "Stack",
            body: "¿Qué stack prefieres?",
            recommendation: "React",
          },
        ],
      })
      .mockResolvedValueOnce({
        status: "done",
        summary: "App web con React y tests.",
      });

    renderGrill();

    await screen.findByText(/Ronda 1/);
    expect(screen.getByText("Q1 — Stack")).toBeInTheDocument();

    const answer = screen.getByDisplayValue("React");
    fireEvent.change(answer, { target: { value: "React + Vite" } });
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));

    await screen.findByText("Entendimiento compartido");
    expect(screen.getByText("App web con React y tests.")).toBeInTheDocument();

    expect(api.grill).toHaveBeenCalledTimes(2);
    const secondCall = vi.mocked(api.grill).mock.calls[1]?.[0];
    expect(secondCall?.messages).toEqual([
      {
        role: "assistant",
        content: "Ronda 1\n\nQ1 — Stack: ¿stack?\n➡️ Recomendado: React",
      },
      { role: "user", content: "Q1: React + Vite" },
    ]);
  });

  it("genera el plan con el objetivo clarificado", async () => {
    vi.mocked(api.grill).mockResolvedValue({
      status: "done",
      summary: "App web con React y tests.",
    });
    const onGeneratePlan = vi.fn().mockResolvedValue(undefined);

    renderGrill({ onGeneratePlan });

    await screen.findByText("Entendimiento compartido");
    fireEvent.click(screen.getByRole("button", { name: /Generar el plan/ }));

    await waitFor(() => {
      expect(onGeneratePlan).toHaveBeenCalled();
    });

    const instructions = onGeneratePlan.mock.calls[0]?.[0] as string;
    expect(instructions).toContain("App web con React y tests.");
  });

  it("reintenta la carga inicial sin enviar mensajes vacíos", async () => {
    vi.mocked(api.grill)
      .mockRejectedValueOnce(new Error("Ruta no encontrada."))
      .mockResolvedValueOnce({
        status: "done",
        summary: "App web con React y tests.",
      });

    renderGrill();

    await screen.findByText("Ruta no encontrada.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await screen.findByText("Entendimiento compartido");
    expect(api.grill).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.grill).mock.calls[1]?.[0].messages).toEqual([]);
  });

  it("reintenta generar el plan cuando falla", async () => {
    vi.mocked(api.grill).mockResolvedValue({
      status: "done",
      summary: "App web con React y tests.",
    });
    const onGeneratePlan = vi
      .fn()
      .mockRejectedValueOnce(new Error("Ruta no encontrada."))
      .mockResolvedValueOnce(undefined);

    renderGrill({ onGeneratePlan });

    await screen.findByText("Entendimiento compartido");
    fireEvent.click(screen.getByRole("button", { name: /Generar el plan/ }));

    await screen.findByText("Ruta no encontrada.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() => {
      expect(onGeneratePlan).toHaveBeenCalledTimes(2);
    });
  });

  it("muestra todas las preguntas a la vez y permite elegir con un clic", async () => {
    vi.mocked(api.grill)
      .mockResolvedValueOnce({
        status: "questions",
        message: "Ronda 1",
        questions: [
          {
            id: "Q1",
            title: "Stack",
            body: "¿Qué stack prefieres?",
            options: ["React", "Vue"],
            recommendation: "React",
          },
          {
            id: "Q2",
            title: "Persistencia",
            body: "¿Dónde guardas los datos?",
            options: ["localStorage", "IndexedDB"],
            recommendation: "localStorage",
          },
        ],
      })
      .mockResolvedValueOnce({
        status: "done",
        summary: "App web con React y localStorage.",
      });

    renderGrill();

    await screen.findByText("Q1 — Stack");
    expect(screen.getByText(/2 preguntas/)).toBeInTheDocument();
    expect(screen.getByText("Q2 — Persistencia")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Vue" }));
    expect(screen.getByRole("radio", { name: "Vue" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByText("Entendimiento compartido");

    const secondCall = vi.mocked(api.grill).mock.calls[1]?.[0];
    expect(secondCall?.messages.at(-1)?.content).toContain("Q1: Vue");
    expect(secondCall?.messages.at(-1)?.content).toContain("Q2: localStorage");
  });

  it("marca la recomendación como primera opción con la etiqueta (recomendada)", async () => {
    vi.mocked(api.grill)
      .mockResolvedValueOnce({
        status: "questions",
        message: "Ronda 1",
        questions: [
          {
            id: "Q1",
            title: "Stack",
            body: "¿Qué stack prefieres?",
            options: ["Vue", "React", "Svelte"],
            recommendation: "React",
          },
        ],
      })
      .mockResolvedValueOnce({
        status: "done",
        summary: "App web con React.",
      });

    renderGrill();

    await screen.findByText("Q1 — Stack");

    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toHaveTextContent("React");
    expect(radios[0]).toHaveTextContent("(recomendada)");
    expect(radios[0]).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByText("Entendimiento compartido");

    const secondCall = vi.mocked(api.grill).mock.calls[1]?.[0];
    expect(secondCall?.messages.at(-1)?.content).toContain("Q1: React");
  });

  it("permite escribir una respuesta propia como última opción", async () => {
    vi.mocked(api.grill)
      .mockResolvedValueOnce({
        status: "questions",
        message: "Ronda 1",
        questions: [
          {
            id: "Q1",
            title: "Stack",
            body: "¿Qué stack prefieres?",
            options: ["React", "Vue"],
            recommendation: "React",
          },
        ],
      })
      .mockResolvedValueOnce({
        status: "done",
        summary: "App web a medida.",
      });

    renderGrill();

    await screen.findByText("Q1 — Stack");
    expect(screen.queryByPlaceholderText("Escribe tu respuesta")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Otra respuesta" }));

    const custom = screen.getByPlaceholderText("Escribe tu respuesta");
    fireEvent.change(custom, { target: { value: "Svelte" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await screen.findByText("Entendimiento compartido");
    const secondCall = vi.mocked(api.grill).mock.calls[1]?.[0];
    expect(secondCall?.messages.at(-1)?.content).toContain("Q1: Svelte");
  });

  it("muestra la planificación en curso dentro del hilo y esconde el botón", async () => {
    vi.mocked(api.grill).mockResolvedValue({
      status: "done",
      summary: "App web con React.",
    });

    renderGrill({ project: makeProject({ status: "planning" }) });

    await screen.findByText("Entendimiento compartido");
    expect(screen.getByText("Generando el plan nuevo")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Generar el plan/ }),
    ).toBeNull();
  });

  it("cuando el plan ya existe deja de ofrecer generarlo", async () => {
    vi.mocked(api.grill).mockResolvedValue({
      status: "done",
      summary: "App web con React.",
    });

    renderGrill({
      project: makeProject({
        status: "ready",
        tasks: [
          {
            id: "C1-TASK-001",
            title: "Scaffold",
            description: "",
            status: "todo",
            type: "coding",
            complexity: "low",
            dependsOn: [],
          },
        ],
      }),
    });

    await screen.findByText("Entendimiento compartido");
    expect(screen.getByText("Plan generado")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Generar el plan/ }),
    ).toBeNull();
  });

  it("vuelve a las preguntas desde el entendimiento compartido sin duplicar el historial", async () => {
    vi.mocked(api.grill)
      .mockResolvedValueOnce({
        status: "questions",
        message: "Ronda 1",
        questions: [
          {
            id: "Q1",
            title: "Stack",
            body: "¿Qué stack prefieres?",
            recommendation: "React",
          },
        ],
      })
      .mockResolvedValueOnce({
        status: "done",
        summary: "App web con React.",
      })
      .mockResolvedValueOnce({
        status: "done",
        summary: "App web revisada.",
      });

    renderGrill();

    await screen.findByText("Q1 — Stack");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByText("Entendimiento compartido");

    fireEvent.click(
      screen.getByRole("button", { name: /Volver a las preguntas/ }),
    );
    expect(await screen.findByText("Q1 — Stack")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByText("App web revisada.");

    const thirdCall = vi.mocked(api.grill).mock.calls[2]?.[0];
    expect(thirdCall?.messages).toEqual([
      { role: "assistant", content: "Ronda 1" },
      { role: "user", content: "Q1: React" },
    ]);
  });
});
