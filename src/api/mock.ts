import type { AgentCandidate } from "../agents/types.js";
import type { GrillMessage, GrillOutcome } from "../grill/types.js";
import type { ProjectDeps } from "../projects/service.js";
import type { Storage } from "../storage/types.js";
import type { TaskInstructionMessage } from "../tasks/instructions.js";
import type { WorkspaceManager } from "../workspace/types.js";

export type MockScenario = "success" | "replan" | "fail";

const BASE_PLAN = {
  summary: "Librería TypeScript con función sum, tests y README.",
  tasks: [
    {
      id: "TASK-001",
      title: "Scaffold del proyecto",
      description: "Inicializar package.json, tsconfig y estructura de carpetas.",
      type: "coding",
      complexity: "low",
      dependsOn: [],
      acceptanceCriteria: ["package.json existe", "tsconfig.json existe"],
    },
    {
      id: "TASK-002",
      title: "Implementar sum(a, b)",
      description: "Crear src/index.ts con una función sum exportada.",
      type: "coding",
      complexity: "low",
      dependsOn: ["TASK-001"],
      acceptanceCriteria: ["sum(2, 3) === 5"],
    },
    {
      id: "TASK-003",
      title: "Añadir tests",
      description: "Escribir tests unitarios para sum.",
      type: "testing",
      complexity: "low",
      dependsOn: ["TASK-002"],
      acceptanceCriteria: ["los tests pasan"],
    },
    {
      id: "TASK-004",
      title: "Escribir README",
      description: "Documentar instalación y uso de la librería.",
      type: "research",
      complexity: "low",
      dependsOn: ["TASK-002"],
      acceptanceCriteria: ["README documenta la API"],
    },
  ],
};

const REPLAN_EXTRA = {
  summary: "Plan ampliado con una tarea extra.",
  tasks: [
    ...BASE_PLAN.tasks,
    {
      id: "TASK-005",
      title: "Añadir CI básico",
      description: "Configurar un pipeline mínimo de CI.",
      type: "coding",
      complexity: "low",
      dependsOn: ["TASK-003"],
      acceptanceCriteria: ["el pipeline ejecuta los tests"],
    },
  ],
};

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/**
 * Entrevista simulada para el modo mock: una ronda de preguntas y luego el
 * cierre, de modo que el flujo del grill se puede probar sin agentes reales.
 */
export function mockGrill(messages: GrillMessage[]): GrillOutcome {
  const answeredRounds = messages.filter((m) => m.role === "user").length;

  if (answeredRounds === 0) {
    return {
      status: "questions",
      questions: [
        {
          id: "Q1",
          title: "Stack",
          body: "¿Qué stack prefieres para la interfaz?",
          options: [
            "React + Vite + TypeScript",
            "Next.js + TypeScript",
            "HTML + CSS + JavaScript",
          ],
          recommendation: "React + Vite + TypeScript",
        },
        {
          id: "Q2",
          title: "Persistencia",
          body: "¿Dónde se guardan los datos?",
          options: ["localStorage", "IndexedDB", "Backend con API"],
          recommendation: "localStorage",
        },
      ],
      message: [
        "Ronda 1",
        "",
        "Q1 — Stack: ¿Qué stack prefieres para la interfaz?",
        "   - React + Vite + TypeScript",
        "   - Next.js + TypeScript",
        "   - HTML + CSS + JavaScript",
        "➡️ Recomendado: React + Vite + TypeScript",
        "",
        "Q2 — Persistencia: ¿Dónde se guardan los datos?",
        "   - localStorage",
        "   - IndexedDB",
        "   - Backend con API",
        "➡️ Recomendado: localStorage",
      ].join("\n"),
    };
  }

  return {
    status: "done",
    summary: "App web con React + Vite + TypeScript, datos en localStorage y tests.",
  };
}

/**
 * Respuesta simulada del protocolo de instrucciones: la primera instrucción del
 * usuario se acepta (`proceed`); si vuelve a preguntar, el agente pide una
 * aclaración para cerrar el bucle sin agentes reales.
 */
export function mockTaskInstruction(
  messages: TaskInstructionMessage[],
): { action: "proceed" | "ask"; reply: string; questions?: string[] } {
  const userTurns = messages.filter((message) => message.role === "user").length;

  if (userTurns <= 1) {
    return {
      action: "proceed",
      reply: "Entendido. Cambiaré la aproximación y reintentaré la tarea.",
    };
  }

  return {
    action: "ask",
    reply: "Para cambiar la aproximación necesito una aclaración.",
    questions: ["¿Qué enfoque prefieres: más simple o más completo?"],
  };
}

/** Respuesta simulada de un chat suelto: eco del último mensaje. */
export function mockConversation(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  const last = messages.filter((message) => message.role === "user").at(-1);
  return `(simulado) Recibido: ${last?.content ?? ""}`;
}

export function createMockWorkspace(): WorkspaceManager {
  let commits = 0;
  let workspaces = 0;

  return {
    getRepoRoot: async () => "/mock/repo",
    resolveBaseRef: async () => "mock-base-ref",
    isDirty: async () => false,
    create: async (taskId, attempt, baseRef) => {
      workspaces += 1;
      return {
        taskId,
        branchName: `agent/${taskId}-attempt-${attempt}`,
        path: `/mock/repo/.worktrees/${taskId}-${workspaces}`,
        baseRef,
      };
    },
    commit: async () => {
      commits += 1;
      return `mock-commit-${commits}`;
    },
    squash: async () => {
      commits += 1;
      return `mock-commit-${commits}`;
    },
    remove: async () => {},
    diff: async () => "",
    integrateDependencies: async (_taskId, dependencyCommits, baseRef) => ({
      ok: true as const,
      ref: baseRef,
      branchName: "integration/mock",
    }),
    finalizeProject: async (projectId) => ({
      ok: true as const,
      ref: "mock-final-commit",
      branchName: `agent/project-${projectId}-final`,
    }),
  };
}

export function createMockDeps(
  storage: Storage,
  scenario: MockScenario = "success",
  mockDelayMs = 0,
): ProjectDeps {
  let plannerCalls = 0;
  let supervisorCalls = 0;
  let workerCalls = 0;

  return {
    storage,
    workspace: createMockWorkspace(),
    plannerExecute: async () => {
      plannerCalls += 1;
      await delay(mockDelayMs);
      if (scenario === "replan" && plannerCalls > 1) {
        return JSON.stringify(REPLAN_EXTRA);
      }
      return JSON.stringify(BASE_PLAN);
    },
    workerExecute: async (_prompt, _agent: AgentCandidate) => {
      workerCalls += 1;
      await delay(mockDelayMs);

      if (scenario === "fail") {
        throw new Error("mock: el agente falló (escenario fail)");
      }

      if (scenario === "replan" && workerCalls <= 4) {
        throw new Error("mock: fallo inicial para forzar replan");
      }

      return "mock output: implementación completada.";
    },
    reviewerExecute: async () =>
      JSON.stringify({ approved: true, summary: "ok", issues: [] }),
    supervisorExecute: async () => {
      supervisorCalls += 1;
      await delay(mockDelayMs);
      if (scenario === "replan" && supervisorCalls === 1) {
        return JSON.stringify({
          action: "replan",
          reason: "falta la tarea de CI",
          instructions: "añade TASK-005",
        });
      }
      if (scenario === "fail") {
        return JSON.stringify({
          action: "fail",
          reason: "el objetivo es inalcanzable",
        });
      }
      return JSON.stringify({ action: "continue", reason: "ok" });
    },
  };
}
