import type { Task, TaskComplexity, TaskType } from "../tasks/types.js";
import type { AgentProvider, AgentSpec } from "./types.js";

export type AgentSelection = AgentSpec;

const DEFAULT_MODEL: Record<AgentProvider, string | undefined> = {
  codex: undefined,
  claude: "sonnet",
  deepseek: "deepseek-flash",
};

/**
 * Identidad comparable de un agente: `codex` no tiene modelo y el resto caen a
 * su modelo por defecto, de modo que `{provider:"claude"}` y
 * `{provider:"claude",model:"sonnet"}` son el mismo agente.
 */
export function agentKey(agent: AgentSpec): string {
  const model =
    (agent.provider === "codex" ? undefined : agent.model) ??
    DEFAULT_MODEL[agent.provider];

  return `${agent.provider}:${model ?? ""}`;
}

export function isAgentAllowed(
  agent: AgentSpec,
  allowed: AgentSpec[],
): boolean {
  if (allowed.length === 0) {
    return true;
  }

  const key = agentKey(agent);
  return allowed.some((candidate) => agentKey(candidate) === key);
}

/**
 * Codex y Claude escriben en el worktree con sus CLIs. DeepSeek escribe con el
 * harness agéntico in-process (bucle de herramientas), que las tareas de código
 * activan con `mode: "agentic"`. Los tres completan tareas de código.
 */
const FILE_WRITING_PROVIDERS: ReadonlySet<AgentProvider> = new Set([
  "codex",
  "claude",
  "deepseek",
]);

export function canWriteFiles(agent: AgentSpec): boolean {
  return FILE_WRITING_PROVIDERS.has(agent.provider);
}

export function hasFileWritingAgent(agents: AgentSpec[]): boolean {
  return agents.some(canWriteFiles);
}

export const MISSING_FILE_WRITING_AGENT =
  "La selección de agentes debe ser válida: incluye al menos uno que escriba " +
  "archivos (Codex, Claude o DeepSeek).";

export function assertFileWritingAgent(agents: AgentSpec[]): void {
  if (agents.length > 0 && !hasFileWritingAgent(agents)) {
    throw new Error(MISSING_FILE_WRITING_AGENT);
  }
}

export const DEEPSEEK_FLASH: AgentSelection = {
  provider: "deepseek",
  model: "deepseek-flash",
};
export const CLAUDE_SONNET: AgentSelection = {
  provider: "claude",
  model: "sonnet",
};
export const CLAUDE_OPUS: AgentSelection = { provider: "claude", model: "opus" };
export const CLAUDE_HAIKU: AgentSelection = {
  provider: "claude",
  model: "haiku",
};
export const CODEX: AgentSelection = { provider: "codex" };

function isHigh(complexity: TaskComplexity): boolean {
  return complexity === "high" || complexity === "critical";
}

function selectResearch(complexity: TaskComplexity): AgentSelection {
  switch (complexity) {
    case "low":
      return DEEPSEEK_FLASH;
    case "medium":
      return CLAUDE_SONNET;
    case "high":
    case "critical":
      return CLAUDE_OPUS;
  }
}

function autoSelect(task: Task): AgentSelection {
  switch (task.type) {
    // Planificar y diseñar exige el modelo más capaz; el trabajo de desarrollo
    // ya planificado lo asume Haiku, rápido y económico.
    case "architecture":
    case "planning":
      return CLAUDE_OPUS;
    case "coding":
    case "testing":
      return CLAUDE_HAIKU;
    case "review":
      return isHigh(task.complexity) ? CLAUDE_OPUS : CLAUDE_SONNET;
    case "research":
      return selectResearch(task.complexity);
  }
}

/**
 * `allowed` son los agentes permitidos del chat. Si el agente que tocaría por
 * tipo y complejidad no está en la lista, se usa el primero permitido.
 */
export function selectAgent(
  task: Task,
  allowed: AgentSpec[] = [],
): AgentSelection {
  const auto = autoSelect(task);

  if (isAgentAllowed(auto, allowed)) {
    return auto;
  }

  return allowed[0] ?? auto;
}

export function resolveAgent(
  task: Task,
  allowed: AgentSpec[] = [],
): AgentSelection {
  if (task.agent && isAgentAllowed(task.agent, allowed)) {
    return task.agent;
  }

  return selectAgent(task, allowed);
}

export const TASK_TYPES: TaskType[] = [
  "architecture",
  "planning",
  "coding",
  "review",
  "testing",
  "research",
];

export const TASK_COMPLEXITIES: TaskComplexity[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export interface AgentMatrixRow {
  type: TaskType;
  agents: Record<TaskComplexity, AgentSelection>;
}

/**
 * Recorre los `TaskType` por las `TaskComplexity` llamando a `autoSelect`, la
 * misma función que usa `selectAgent`. Es la fuente real de la tabla
 * "Asignación: Tipo × Complejidad" de la página de Agentes: si el motor
 * cambia, la matriz cambia con él en vez de desincronizarse en silencio.
 */
export function buildAgentMatrix(): AgentMatrixRow[] {
  return TASK_TYPES.map((type) => {
    const agents = {} as Record<TaskComplexity, AgentSelection>;

    for (const complexity of TASK_COMPLEXITIES) {
      agents[complexity] = autoSelect({ type, complexity } as Task);
    }

    return { type, agents };
  });
}

export function describeAgent(agent: AgentSelection): string {
  if (agent.provider === "codex") {
    return agent.provider;
  }

  return agent.model ? `${agent.provider} / ${agent.model}` : agent.provider;
}

const COMPLEXITY_ORDER: Record<TaskComplexity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Complejidad más alta del conjunto de tareas. Los roles de orquestación la usan
 * para elegir el tramo de la matriz cuando no tienen una tarea concreta.
 */
export function maxComplexity(
  tasks: Array<{ complexity?: TaskComplexity }>,
): TaskComplexity | undefined {
  let max: TaskComplexity | undefined;

  for (const task of tasks) {
    if (!task.complexity) continue;

    if (!max || COMPLEXITY_ORDER[task.complexity] > COMPLEXITY_ORDER[max]) {
      max = task.complexity;
    }
  }

  return max;
}
