import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage, Project, Task } from "../../lib/types";
import { ChatThread } from "./ChatThread";

const tasks: Task[] = [
  {
    id: "C1-TASK-001",
    title: "Scaffold Vite",
    description: "",
    status: "done",
    type: "coding",
    complexity: "low",
    dependsOn: [],
  },
  {
    id: "C1-TASK-002",
    title: "Motor de cálculo",
    description: "",
    status: "ready",
    type: "coding",
    complexity: "high",
    dependsOn: ["C1-TASK-001"],
  },
];

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "calc-web",
    goal: "una calculadora",
    status: "ready",
    baseRef: "abc",
    tasks,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    stats: {
      total: 2,
      done: 1,
      running: 0,
      failed: 0,
      blocked: 0,
      ready: 1,
      todo: 0,
      progress: 0.5,
      activeAgents: 0,
    },
    agentsUsed: [],
    ...overrides,
  };
}

const messages: ChatMessage[] = [
  {
    id: "m1",
    chatId: "c1",
    projectId: "p1",
    role: "user",
    content: "Quiero una calculadora con historial",
    taskIds: [],
    createdAt: "2026-01-01T10:00:00.000Z",
  },
  {
    id: "m2",
    chatId: "c1",
    projectId: "p1",
    role: "assistant",
    content: "He preparado un plan de 2 tareas",
    taskIds: ["C1-TASK-001", "C1-TASK-002"],
    agent: { provider: "claude", model: "opus" },
    createdAt: "2026-01-01T10:00:20.000Z",
  },
];

function renderThread(props: Partial<Parameters<typeof ChatThread>[0]> = {}) {
  const defaults = {
    project: makeProject(),
    messages,
    events: [],
    supervisorRuns: [],
    reviews: [],
    viewMode: "list" as const,
    onViewModeChange: () => {},
    onSelectTask: () => {},
    isEditable: true,
  };

  return render(<ChatThread {...defaults} {...props} />);
}

describe("ChatThread", () => {
  it("muestra la conversación y el plan en el mismo hilo", () => {
    renderThread();

    expect(
      screen.getByText("Quiero una calculadora con historial"),
    ).toBeInTheDocument();
    expect(screen.getByText("He preparado un plan de 2 tareas")).toBeInTheDocument();
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Motor de cálculo")).toBeInTheDocument();
  });

  it("ordena los mensajes del más antiguo al más nuevo y deja el plan antes de la nueva petición", () => {
    const later: ChatMessage = {
      id: "m3",
      chatId: "c1",
      projectId: "p1",
      role: "user",
      content: "Ahora añade exportar a CSV",
      taskIds: [],
      createdAt: "2026-01-01T10:05:00.000Z",
    };
    const laterReply: ChatMessage = {
      id: "m4",
      chatId: "c1",
      projectId: "p1",
      role: "assistant",
      content: "Añado 1 tarea más",
      taskIds: ["C1-TASK-003"],
      createdAt: "2026-01-01T10:05:20.000Z",
    };

    renderThread({ messages: [laterReply, later, messages[1]!, messages[0]!] });

    const first = screen.getByText("Quiero una calculadora con historial");
    const second = screen.getByText("He preparado un plan de 2 tareas");
    const plan = screen.getByText("Plan");
    const lastUser = screen.getByText("Ahora añade exportar a CSV");
    const lastReply = screen.getByText("Añado 1 tarea más");

    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      plan.compareDocumentPosition(lastUser) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      plan.compareDocumentPosition(lastReply) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("intercala la replanificación del supervisor en orden cronológico", () => {
    renderThread({
      project: makeProject({ status: "running" }),
      events: [
        {
          id: "e1",
          projectId: "p1",
          type: "task.started",
          taskId: "C1-TASK-001",
          createdAt: "2026-01-01T10:10:00.000Z",
        },
        {
          id: "e2",
          projectId: "p1",
          type: "project.resumed",
          createdAt: "2026-01-01T10:20:00.000Z",
        },
      ],
      supervisorRuns: [
        {
          id: "s1",
          projectId: "p1",
          action: "replan",
          reason: "TASK-001 ha fallado y bloquea la cadena.",
          createdAt: "2026-01-01T10:15:00.000Z",
        },
      ],
    });

    const started = screen.getByText("C1-TASK-001 en curso");
    const replan = screen.getByText("El supervisor replanificó");
    const resumed = screen.getByText("Ejecución reanudada");

    expect(
      started.compareDocumentPosition(replan) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      replan.compareDocumentPosition(resumed) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("permite pedir replan desde un conflicto cuando el proyecto está bloqueado", () => {
    const onResume = vi.fn();
    const conflicted: Task = {
      ...(tasks[0] as Task),
      status: "blocked",
      integrationError: {
        type: "git_conflict",
        dependencyTaskIds: ["C1-TASK-001"],
        message: "Conflicto al integrar",
        files: ["README.md"],
      },
    };

    renderThread({
      project: makeProject({ status: "blocked", tasks: [conflicted] }),
      onResume,
    });

    screen.getByRole("button", { name: "Pedir replan" }).click();
    expect(onResume).toHaveBeenCalled();
  });

  it("mantiene los mensajes visibles con el proyecto terminado", () => {
    renderThread({
      project: makeProject({
        status: "completed",
        resultBranch: "agent/project-p1-final",
        resultCommit: "abc1234",
      }),
    });

    expect(
      screen.getByText("Quiero una calculadora con historial"),
    ).toBeInTheDocument();
    // El resultado ofrece el merge, que MrRobot nunca hace por su cuenta.
    expect(
      screen.getByText("git merge agent/project-p1-final"),
    ).toBeInTheDocument();
  });

  it("muestra el error del planner con Reintentar", () => {
    const onRetryPlan = vi.fn();

    renderThread({
      messages: [
        messages[0] as ChatMessage,
        {
          ...(messages[1] as ChatMessage),
          content: "No pude generar el plan: timeout",
          taskIds: [],
          error: "timeout llamando al proveedor",
        },
      ],
      onRetryPlan,
    });

    expect(screen.getByText("No pude generar el plan")).toBeInTheDocument();
    screen.getByRole("button", { name: "Reintentar" }).click();
    expect(onRetryPlan).toHaveBeenCalled();
  });

  it("sin mensajes ni tareas invita a empezar", () => {
    renderThread({ project: makeProject({ tasks: [] }), messages: [] });

    expect(
      screen.getByText("Cuéntame qué quieres construir y genero el plan."),
    ).toBeInTheDocument();
  });

  it("con la entrevista de afinado no muestra el estado vacío", () => {
    renderThread({
      project: makeProject({ status: "draft", tasks: [] }),
      messages: [],
      grillPanel: <div>ENTREVISTA</div>,
    });

    expect(screen.getByText("ENTREVISTA")).toBeInTheDocument();
    expect(
      screen.queryByText("Cuéntame qué quieres construir y genero el plan."),
    ).toBeNull();
  });

  it("coloca el plan después de la entrevista para respetar el orden", () => {
    renderThread({
      project: makeProject({ status: "planning", tasks }),
      messages: [],
      grillPanel: <div>ENTREVISTA</div>,
    });

    const grill = screen.getByText("ENTREVISTA");
    const plan = screen.getByText("Plan");
    expect(
      grill.compareDocumentPosition(plan) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
