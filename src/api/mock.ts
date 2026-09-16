import type { AgentCandidate } from "../agents/types.js";
import type { ProjectDeps } from "../projects/service.js";
import type { Storage } from "../storage/types.js";
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

      if (scenario === "replan" && workerCalls <= 3) {
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
