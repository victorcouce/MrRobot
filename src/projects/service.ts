import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pickAttachments } from "../agents/attachments.js";
import { AgentHealth } from "../agents/health.js";
import { assertFileWritingAgent } from "../agents/selector.js";
import type { AgentCandidate, AgentSpec, Attachment } from "../agents/types.js";
import {
  detectCheckScripts,
  runDevSmokeCheck,
  runInstallCheck,
  runProjectChecks,
} from "../checks/checks.js";
import type { CheckResult } from "../checks/types.js";
import { formatDuration } from "../../shared/log-format.js";
import { defaultConfig, type OrchestratorConfig } from "../config/index.js";
import { createAgentEventEmitter } from "../logging/agent-events.js";
import { planProject } from "../planner/planner.js";
import type { GeneratedPlan, PlanContext, RepoContext } from "../planner/types.js";
import { PREVIEW_SCRIPTS } from "../preview/preview.js";
import { reviewTask } from "../reviewer/reviewer.js";
import type { ReviewContext } from "../reviewer/reviewer.js";
import type { ReviewResult } from "../reviewer/types.js";
import { runPlan } from "../scheduler/scheduler.js";
import type { PlanStatus } from "../scheduler/types.js";
import { validatePlan } from "../scheduler/validation.js";
import { runTask, type AgentExecutor } from "../tasks/runner.js";
import type { Task } from "../tasks/types.js";
import type { ProjectEvent, Storage } from "../storage/types.js";
import { superviseProject } from "../supervisor/supervisor.js";
import { gitWorkspaceManager } from "../workspace/manager.js";
import type { IntegrationResult, WorkspaceManager } from "../workspace/types.js";
import type { Project, ProjectResult } from "./types.js";

export interface ProjectDeps {
  storage: Storage;
  workspace?: WorkspaceManager;
  config?: OrchestratorConfig;
  plannerExecute?: (prompt: string, agent: AgentCandidate) => Promise<string>;
  workerExecute?: AgentExecutor;
  reviewerExecute?: AgentExecutor;
  supervisorExecute?: (prompt: string, agent: AgentCandidate) => Promise<string>;
  /** Salida del agente en vivo, para mostrarla en la UI (no se persiste). */
  onAgentOutput?: (projectId: string, taskId: string, chunk: string) => void;
  /**
   * Memoria de agentes agotados por límite (rate limit/cuota). Si se comparte
   * entre rondas, el agente que falló no vuelve a ir primero hasta reponerse.
   * Ausente: se crea una por ronda.
   */
  agentHealth?: AgentHealth;
}

export interface CreateProjectInput {
  goal: string;
  name?: string;
  repoPath?: string;
  remoteUrl?: string;
  config?: OrchestratorConfig;
  defaultAllowedAgents?: AgentSpec[];
}

export interface ProjectRoundResult {
  project: Project;
  status: PlanStatus;
}

const MAX_SUPERVISOR_ROUNDS = 3;

async function emit(
  storage: Storage,
  projectId: string,
  type: string,
  taskId?: string,
  payload?: unknown,
): Promise<void> {
  const event: ProjectEvent = {
    id: randomUUID(),
    projectId,
    type,
    createdAt: new Date(),
  };

  if (taskId !== undefined) event.taskId = taskId;
  if (payload !== undefined) event.payload = payload;

  await storage.appendEvent(event);
}

export { emit as emitProjectEvent };

function deriveName(goal: string): string {
  const firstLine = goal.trim().split("\n")[0] ?? "proyecto";
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

function planToTasks(plan: GeneratedPlan): Task[] {
  return plan.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: "todo",
    type: task.type,
    complexity: task.complexity,
    dependsOn: task.dependsOn,
    acceptanceCriteria: task.acceptanceCriteria,
  }));
}

export function recoverInterrupted(project: Project): Project {
  const tasks = project.tasks.map((task) =>
    task.status === "running"
      ? { ...task, status: "interrupted" as const }
      : task,
  );

  return { ...project, tasks, updatedAt: new Date() };
}

/**
 * Reencola las tareas reintentables limpiando error, motivo de bloqueo e
 * intentos previos, para que un nuevo ciclo las vuelva a ejecutar:
 * - `failed` (el scheduler las preserva y sin esto no se reintentan);
 * - `blocked` con `integrationError` (conflicto de cherry-pick: al reintentar
 *   se vuelve a integrar; antes quedaban bloqueadas para siempre).
 * Las tareas bloqueadas por una fallida se desbloquean solas al recalcularse el
 * plan.
 */
export function requeueFailedTasks(project: Project): Project {
  const tasks = project.tasks.map((task) => {
    const retryable =
      task.status === "failed" ||
      (task.status === "blocked" && task.integrationError !== undefined);

    if (!retryable) return task;

    const {
      error: _error,
      blockedReason: _blockedReason,
      integrationError: _integrationError,
      startedAt: _startedAt,
      finishedAt: _finishedAt,
      resultCommit: _resultCommit,
      ...rest
    } = task;

    return { ...rest, status: "todo" as const };
  });

  return { ...project, tasks, updatedAt: new Date() };
}

export interface RecoveredProject {
  project: Project;
  previousStatus: "planning" | "running";
}

/**
 * Sanea los estados transitorios que quedaron colgados por un reinicio del
 * servidor. `planning` vuelve a `draft` (el plan no llegó a generarse) y
 * `running` pasa a `paused` con las tareas en curso marcadas como
 * `interrupted`, de forma que la UI ofrezca reanudar. Emite `project.recovered`
 * para que quede constancia en el event log.
 */
export async function recoverInterruptedProjects(
  deps: ProjectDeps,
): Promise<RecoveredProject[]> {
  const storage = deps.storage;
  const projects = await storage.listProjects();
  const recovered: RecoveredProject[] = [];

  for (const project of projects) {
    if (project.status === "planning") {
      const next: Project = {
        ...project,
        status: "draft",
        updatedAt: new Date(),
      };

      await storage.saveProject(next);
      await emit(storage, project.id, "project.recovered", undefined, {
        previousStatus: "planning",
        message:
          "El servidor se reinició durante la planificación. Vuelve a planificar.",
      });
      recovered.push({ project: next, previousStatus: "planning" });
      continue;
    }

    if (project.status === "running") {
      const next: Project = {
        ...recoverInterrupted(project),
        status: "paused",
        updatedAt: new Date(),
      };

      await storage.saveProject(next);
      await emit(storage, project.id, "project.recovered", undefined, {
        previousStatus: "running",
        message:
          "El servidor se reinició durante la ejecución. Reanuda para continuar.",
      });
      recovered.push({ project: next, previousStatus: "running" });
    }
  }

  return recovered;
}

export async function createProject(
  input: CreateProjectInput,
  deps: ProjectDeps,
): Promise<Project> {
  assertFileWritingAgent(input.defaultAllowedAgents ?? []);

  const config = deps.config ?? defaultConfig;
  const workspace = deps.workspace ?? gitWorkspaceManager;

  const baseRef = await workspace.resolveBaseRef();
  const plan = await planProject(
    input.goal,
    {},
    {
      execute: deps.plannerExecute,
      ...(input.defaultAllowedAgents?.length
        ? { allowedAgents: input.defaultAllowedAgents }
        : {}),
      maxAttempts: config.plannerMaxAttempts,
      maxRetriesPerAgent: config.maxRetriesPerAgent,
      ...(config.limitRetry ? { limitRetry: config.limitRetry } : {}),
    },
  );

  const now = new Date();
  const project: Project = {
    id: randomUUID(),
    name: input.name ?? deriveName(input.goal),
    goal: input.goal,
    status: "ready",
    baseRef,
    tasks: planToTasks(plan),
    createdAt: now,
    updatedAt: now,
  };

  if (input.repoPath) project.repoPath = input.repoPath;
  if (input.remoteUrl) project.remoteUrl = input.remoteUrl;
  if (input.defaultAllowedAgents?.length) {
    project.defaultAllowedAgents = input.defaultAllowedAgents;
  }

  await deps.storage.saveProject(project);
  await emit(deps.storage, project.id, "project.created");
  await emit(deps.storage, project.id, "plan.generated", undefined, {
    summary: plan.summary,
  });

  return project;
}

export async function createProjectDraft(
  input: CreateProjectInput,
  deps: ProjectDeps,
): Promise<Project> {
  assertFileWritingAgent(input.defaultAllowedAgents ?? []);

  const workspace = deps.workspace ?? gitWorkspaceManager;
  const baseRef = await workspace.resolveBaseRef();

  const now = new Date();
  const project: Project = {
    id: randomUUID(),
    name: input.name ?? deriveName(input.goal),
    goal: input.goal,
    status: "draft",
    baseRef,
    tasks: [],
    createdAt: now,
    updatedAt: now,
  };

  if (input.config) {
    project.config = input.config;
  }

  if (input.repoPath) project.repoPath = input.repoPath;
  if (input.remoteUrl) project.remoteUrl = input.remoteUrl;
  if (input.defaultAllowedAgents?.length) {
    project.defaultAllowedAgents = input.defaultAllowedAgents;
  }

  await deps.storage.saveProject(project);
  await emit(deps.storage, project.id, "project.created");

  return project;
}

export async function generatePlan(
  projectId: string,
  deps: ProjectDeps,
  context: PlanContext = {},
): Promise<Project> {
  const storage = deps.storage;

  const project = await storage.getProject(projectId);

  if (!project) {
    throw new Error(`Proyecto ${projectId} no encontrado.`);
  }

  if (project.status === "running" || project.status === "completed") {
    throw new Error(
      `No se puede regenerar el plan: el proyecto está en estado ${project.status}.`,
    );
  }

  const config = project.config ?? deps.config ?? defaultConfig;

  const alreadyPlanning = project.status === "planning";

  if (!alreadyPlanning) {
    const planning: Project = {
      ...project,
      status: "planning",
      updatedAt: new Date(),
    };

    await storage.saveProject(planning);
    await emit(storage, projectId, "plan.started");
  }

  const onPlannerAgentEvent = createAgentEventEmitter(storage, projectId, "planner");
  const plan = await planProject(project.goal, context, {
    execute: deps.plannerExecute,
    ...(project.defaultAllowedAgents?.length
      ? { allowedAgents: project.defaultAllowedAgents }
      : {}),
    maxAttempts: config.plannerMaxAttempts,
    maxRetriesPerAgent: config.maxRetriesPerAgent,
    ...(config.limitRetry ? { limitRetry: config.limitRetry } : {}),
    onAgentEvent: (info) => onPlannerAgentEvent(undefined, info),
  });

  const ready: Project = {
    ...project,
    status: "ready",
    tasks: planToTasks(plan),
    updatedAt: new Date(),
  };

  await storage.saveProject(ready);
  await emit(storage, projectId, "plan.generated", undefined, {
    summary: plan.summary,
  });

  return ready;
}

function buildFixFeedback(review: ReviewResult, checks: CheckResult[]): string {
  const lines = ["La tarea no pasó la validación. Corrige estos problemas:"];

  for (const issue of review.issues) {
    lines.push(`- [${issue.severity}] ${issue.description}`);
  }

  if (review.suggestedFixes?.length) {
    lines.push("Sugerencias:");
    for (const fix of review.suggestedFixes) {
      lines.push(`- ${fix}`);
    }
  }

  for (const check of checks.filter((entry) => !entry.success)) {
    lines.push(`- El check "${check.command}" falló:`);
    const detail = [check.stderr, check.stdout].filter(Boolean).join("\n");
    if (detail) lines.push(clipTail(detail, FIX_FEEDBACK_CHECK_CHARS));
  }

  return lines.join("\n");
}

// Con el error del check en el feedback, el worker no gasta iteraciones en
// volver a ejecutarlo solo para descubrir qué falló.
const FIX_FEEDBACK_CHECK_CHARS = 1_500;

function clipTail(value: string, max: number): string {
  return value.length > max ? `…${value.slice(-max)}` : value;
}

const SKIPPED_REVIEW: ReviewResult = {
  approved: true,
  summary: "checks locales OK (tarea low sin criterios: sin review LLM)",
  issues: [],
};

/**
 * Un check fallido rechaza la tarea pase lo que pase: el review LLM no cambiaría
 * la decisión y el feedback ya lleva el error del check.
 */
const FAILED_CHECKS_REVIEW: ReviewResult = {
  approved: false,
  summary: "checks locales fallidos (sin review LLM)",
  issues: [],
};

function reviewWithoutLlm(
  task: Task,
  checks: CheckResult[],
): ReviewResult | undefined {
  if (checks.some((check) => !check.success)) return FAILED_CHECKS_REVIEW;
  if (shouldSkipReview(task, checks)) return SKIPPED_REVIEW;
  return undefined;
}

/**
 * Evita el review LLM en el caso más seguro: tarea `low`, sin criterios de
 * aceptación explícitos y con checks locales que existen y pasan. Si no hay
 * checks, el review sigue siendo la única validación.
 */
export function shouldSkipReview(task: Task, checks: CheckResult[]): boolean {
  return (
    (task.acceptanceCriteria?.length ?? 0) === 0 &&
    task.complexity === "low" &&
    checks.length > 0 &&
    checks.every((check) => check.success)
  );
}

/**
 * Agrupa la salida del agente y la emite como mucho cada `intervalMs`, para no
 * saturar el event bus/SSE con un mensaje por chunk. `flush` fuerza el envío.
 */
function createOutputBuffer(
  emit: (chunk: string) => void,
  intervalMs = 400,
): { push: (chunk: string) => void; flush: () => void } {
  let buffer = "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }

    if (buffer.length === 0) return;

    const chunk = buffer;
    buffer = "";
    emit(chunk);
  };

  return {
    push: (chunk: string) => {
      buffer += chunk;
      if (!timer) timer = setTimeout(flush, intervalMs);
    },
    flush,
  };
}

/** Señales de que la tarea depende de que la app arranque con `npm run dev`. */
const DEV_SMOKE_HINTS: RegExp[] = [
  /npm run dev/i,
  /servidor de desarrollo/i,
  /\barranc/i,
  /localhost/i,
  /en local\b/i,
  /consola/i,
];

/**
 * Arrancar el servidor de desarrollo cuesta hasta el timeout del smoke test, así
 * que solo se hace cuando la tarea lo pide explícitamente. El `build` ya cubre
 * que el código compila.
 */
export function wantsDevSmoke(task: Task): boolean {
  const text = [task.description, ...(task.acceptanceCriteria ?? [])].join("\n");
  return DEV_SMOKE_HINTS.some((pattern) => pattern.test(text));
}

/**
 * Corre los checks sobre un directorio ya preparado (el worktree del agente, que
 * puede traer `node_modules` de su propia instalación). Nunca lanza: los fallos
 * de preparación se registran y los checks se ejecutan igualmente.
 */
async function runChecksInDir(
  dir: string,
  config: OrchestratorConfig,
  task: Task,
): Promise<CheckResult[]> {
  const configured =
    config.checks.commands.length > 0
      ? config.checks.commands
      : await detectCheckScripts(dir);

  // Los scripts de arranque no terminan solos: los cubre el smoke test de
  // desarrollo, no `runProjectChecks` (que esperaría a que el proceso salga).
  const scripts = configured.filter(
    (script) => !PREVIEW_SCRIPTS.includes(script),
  );

  const results: CheckResult[] = [];

  // La instalación se verifica siempre, aunque ya exista node_modules: es un
  // criterio de aceptación habitual y antes se silenciaba su fallo.
  const install = await runInstallCheck(dir);
  if (install) results.push(install);

  if (scripts.length > 0) {
    results.push(...(await runProjectChecks(dir, scripts)));
  }

  // Solo se intenta arrancar el servidor si las dependencias están resueltas y
  // la tarea realmente lo pide.
  if ((!install || install.success) && wantsDevSmoke(task)) {
    const dev = await runDevSmokeCheck(dir);
    if (dev) results.push(dev);
  }

  return results;
}

/** `npm install ✓ 3.2s · npm run test ✗ 1.1s`, para el log de fases. */
function summarizeChecks(checks: CheckResult[]): string {
  if (checks.length === 0) return "sin checks";

  return checks
    .map((check) => {
      const time =
        check.durationMs !== undefined ? ` ${formatDuration(check.durationMs)}` : "";
      return `${check.command} ${check.success ? "✓" : "✗"}${time}`;
    })
    .join(" · ");
}

/**
 * Reencola una tarea a partir de su nueva definición del planner, conservando
 * los datos de ejecución que no vienen en el plan (chat, agente y adjuntos) y
 * descartando intentos, resultado y errores previos.
 */
function requeueFromGenerated(existing: Task, generated: Task): Task {
  const next: Task = {
    id: generated.id,
    title: generated.title,
    description: generated.description,
    status: "todo",
    type: generated.type,
    complexity: generated.complexity,
  };

  if (generated.dependsOn !== undefined) next.dependsOn = generated.dependsOn;
  if (generated.acceptanceCriteria !== undefined) {
    next.acceptanceCriteria = generated.acceptanceCriteria;
  }
  if (existing.chatId !== undefined) next.chatId = existing.chatId;
  if (existing.agent !== undefined) next.agent = existing.agent;
  if (existing.attachmentIds !== undefined) {
    next.attachmentIds = existing.attachmentIds;
  }

  return next;
}

/**
 * Normaliza un título para comparar tareas por alcance: minúsculas, sin
 * acentos ni puntuación. No es semántico, pero caza duplicados literales.
 */
function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const REPO_IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".worktrees",
  "dist",
  "build",
  "coverage",
  ".next",
]);

/**
 * Lista ficheros y directorios del repo (profundidad 2) para que el planner
 * conozca la estructura real. Acotado para no volcar árboles enormes.
 */
async function listRepoFiles(
  root: string,
  maxEntries = 80,
): Promise<string[]> {
  const out: string[] = [];

  const walk = async (dir: string, prefix: string, depth: number): Promise<void> => {
    if (out.length >= maxEntries || depth > 2) return;

    let entries;
    try {
      entries = await readdir(join(root, dir), { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= maxEntries) break;
      if (entry.name.startsWith(".") || REPO_IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        out.push(`${rel}/`);
        await walk(join(dir, entry.name), rel, depth + 1);
      } else {
        out.push(rel);
      }
    }
  };

  await walk(".", "", 1);
  return out;
}

/** Reúne scripts de npm y estructura del repo para el contexto del planner. */
export async function gatherRepoContext(root: string): Promise<RepoContext> {
  const scripts = await detectCheckScripts(root);
  const files = await listRepoFiles(root);
  const context: RepoContext = {};

  if (scripts.length > 0) context.scripts = scripts;
  if (files.length > 0) context.files = files;

  return context;
}

/**
 * Convierte las tareas actuales al formato de plan para dárselas al planner
 * como `previousPlan`. Sin esto, al replanificar el planner parte de cero e
 * inventa IDs nuevos (`TASK-001A`) para el mismo alcance, y el merge acaba con
 * tareas duplicadas que chocan al integrar.
 */
export function tasksToPlan(tasks: Task[]): GeneratedPlan {
  return {
    summary: "plan actual",
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      type: task.type,
      complexity: task.complexity,
      dependsOn: task.dependsOn ?? [],
      acceptanceCriteria: task.acceptanceCriteria ?? [],
      attachments: [],
    })),
  };
}

/**
 * Combina el plan regenerado con el estado actual. Las tareas `done` nunca se
 * reescriben: el trabajo ya está hecho. Para el resto:
 * - si el planner vuelve a definir una tarea (mismo id), se usa su versión
 *   nueva y se reencola, aunque estuviera `blocked` o `ready`;
 * - si no la menciona, se conserva tal cual y se reencola.
 * Las tareas nuevas del planner se añaden.
 */
export function mergeReplan(existing: Task[], plan: GeneratedPlan): Task[] {
  const done = existing.filter((task) => task.status === "done");
  const doneIds = new Set(done.map((task) => task.id));
  const generatedTasks = planToTasks(plan);
  const generatedById = new Map(generatedTasks.map((task) => [task.id, task]));

  const kept = existing
    .filter((task) => task.status !== "done")
    .map((task) => {
      const generated = generatedById.get(task.id);
      return generated
        ? requeueFromGenerated(task, generated)
        : { ...task, status: "todo" as const };
    });
  const keptIds = new Set(kept.map((task) => task.id));

  // Cinturón de seguridad: aunque el planner no reutilice el ID, no se añade
  // una tarea cuyo título coincide con una existente (evita duplicados como
  // TASK-001/TASK-001A que luego chocan al integrar).
  const existingTitles = new Set(existing.map((task) => normalizeTitle(task.title)));
  const added = generatedTasks.filter(
    (task) =>
      !doneIds.has(task.id) &&
      !keptIds.has(task.id) &&
      !existingTitles.has(normalizeTitle(task.title)),
  );
  const merged = [...done, ...kept, ...added];

  validatePlan(merged);
  return merged;
}

interface ChatContext {
  /** Agentes permitidos del chat que generó la tarea. Vacío = sin restricción. */
  allowedAgentsFor: (task: Task) => AgentSpec[];
  /** Adjuntos que la tarea referencia, resueltos a partir de sus ids. */
  attachmentsFor: (task: Task) => Attachment[];
}

async function loadChatContext(
  projectId: string,
  storage: Storage,
  defaultAllowedAgents: AgentSpec[] = [],
): Promise<ChatContext> {
  const chats = await storage.listChats(projectId);
  const agentsByChat = new Map<string, AgentSpec[]>();
  const attachments: Attachment[] = [];

  for (const chat of chats) {
    if (chat.allowedAgents?.length) {
      agentsByChat.set(chat.id, chat.allowedAgents);
    }

    for (const message of await storage.listChatMessages(chat.id)) {
      attachments.push(...(message.attachments ?? []));
    }
  }

  return {
    // Las tareas del plan (sin chat) respetan los agentes marcados al crear el
    // proyecto; las de un chat usan la restricción de ese chat.
    allowedAgentsFor: (task) =>
      task.chatId ? (agentsByChat.get(task.chatId) ?? []) : defaultAllowedAgents,
    attachmentsFor: (task) => pickAttachments(task.attachmentIds, attachments),
  };
}

/**
 * Commits de todas las dependencias transitivas de `task`, en orden
 * topológico (las dependencias de una dependencia van antes que ella). El
 * commit de una tarea solo contiene su propio diff, así que integrar solo las
 * dependencias directas deja fuera a sus ancestros y el cherry-pick choca con
 * los archivos que esos ancestros crearon.
 *
 * Si la tarea no declara dependencias (p. ej. una tarea de diagnóstico añadida
 * en un replan), se parte del trabajo ya completado del proyecto en vez de un
 * worktree vacío.
 */
function collectDependencyCommits(
  task: Task,
  taskState: Map<string, Task>,
): Array<{ taskId: string; commit: string }> {
  const visited = new Set<string>();
  const ordered: Array<{ taskId: string; commit: string }> = [];

  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);

    const dependency = taskState.get(id);
    if (!dependency) return;

    for (const parent of dependency.dependsOn ?? []) {
      visit(parent);
    }

    if (dependency.resultCommit) {
      ordered.push({ taskId: dependency.id, commit: dependency.resultCommit });
    }
  };

  const declared = task.dependsOn ?? [];
  const roots =
    declared.length > 0
      ? declared
      : [...taskState.values()]
          .filter((candidate) => candidate.status === "done")
          .map((candidate) => candidate.id);

  for (const id of roots) {
    visit(id);
  }

  return ordered;
}

function doneCommits(
  project: Project,
): Array<{ taskId: string; commit: string }> {
  return project.tasks
    .filter((task) => task.status === "done" && task.resultCommit)
    .map((task) => ({
      taskId: task.id,
      commit: task.resultCommit as string,
    }));
}

/**
 * Vuelca `ref` en el directorio del proyecto y lo anota como evento. El
 * resultado de las tareas vive en ramas `agent/*`; sin este paso el directorio
 * que abre el usuario se queda vacío (solo `.git` y `.worktrees`) y el planner
 * y el supervisor, que inspeccionan ese mismo directorio, deciden sobre un
 * repositorio fantasma.
 */
async function syncWorkingTree(
  project: Project,
  workspace: WorkspaceManager,
  storage: Storage,
  ref: string,
): Promise<void> {
  if (!workspace.syncWorkingTree) {
    return;
  }

  const sync = await workspace.syncWorkingTree(
    ref,
    `mrrobot: resultado de ${project.name}`,
  );

  if (sync.status === "failed" || sync.status === "skipped") {
    await emit(storage, project.id, "worktree.sync_failed", undefined, {
      status: sync.status,
      message: sync.message,
    });
    return;
  }

  await emit(storage, project.id, "worktree.synced", undefined, {
    status: sync.status,
    ...(sync.ref ? { commit: sync.ref } : {}),
    ...(sync.branch ? { branch: sync.branch } : {}),
  });
}

/**
 * Deja en el directorio del proyecto el trabajo completado hasta ahora, aunque
 * el plan no haya terminado. Así el usuario ve los archivos de las tareas que
 * sí salieron y la siguiente ronda (supervisor y replanificación) razona sobre
 * el estado real del repositorio.
 */
async function syncProgress(
  project: Project,
  workspace: WorkspaceManager,
  storage: Storage,
): Promise<void> {
  if (!workspace.syncWorkingTree || !workspace.integrateProgress) {
    return;
  }

  const commits = doneCommits(project);

  if (commits.length === 0) {
    return;
  }

  const integration = await workspace.integrateProgress(
    project.id,
    commits,
    project.baseRef,
  );

  if (!integration.ok) {
    await emit(storage, project.id, "worktree.sync_failed", undefined, {
      status: "failed",
      message: integration.error.message,
    });
    return;
  }

  await syncWorkingTree(project, workspace, storage, integration.ref);
}

/**
 * Integrar dependencias cuesta un worktree nuevo más un cherry-pick por commit.
 * En un plan con abanico (varias tareas colgando de la misma), todas piden
 * exactamente la misma integración, así que se reutiliza: la clave es la base
 * más la lista de commits, que es justo lo que determina el resultado. El
 * commit resultante sobrevive porque la rama `integration/*` no se borra.
 */
function integrationCacheKey(
  baseRef: string,
  commits: Array<{ taskId: string; commit: string }>,
): string {
  return `${baseRef}|${commits.map((entry) => entry.commit).join(",")}`;
}

function makeTaskExecutor(
  pid: string,
  projectBaseRef: string,
  deps: ProjectDeps,
  config: OrchestratorConfig,
  workspace: WorkspaceManager,
  storage: Storage,
  taskState: Map<string, Task>,
  chatContext: ChatContext,
  signal?: AbortSignal,
): (task: Task) => Promise<Task> {
  // La raíz se memoriza en el manager; se resuelve una vez por tarea y se usa
  // para reanclar los criterios con rutas absolutas dentro del repo.
  const repoRootPromise = workspace.getRepoRoot().catch(() => undefined);

  // Memoria compartida por todas las tareas y reviews de la ronda: el agente
  // que cae por límite se relega para no volver a empezar por él.
  const agentHealth = deps.agentHealth ?? new AgentHealth();

  // Monitorización: un intento de agente por tarea (worker) y por reviewer,
  // cada uno con su duración (fichero .log + SSE → consola del navegador).
  const onWorkerAgentEvent = createAgentEventEmitter(storage, pid, "worker");
  const onReviewerAgentEvent = createAgentEventEmitter(storage, pid, "reviewer");

  /**
   * Corre el reviewer sobre el resultado real de la tarea. `cwd` es el worktree
   * del intento (vivo durante `onWorkspaceSuccess`), de modo que el agente
   * revisor inspecciona los archivos que escribió el worker y no la copia
   * principal, que por diseño no contiene los cambios.
   */
  const runReview = async (
    target: Task,
    cwd: string | undefined,
    info: { commit?: string; output: string } | undefined,
    checks: CheckResult[],
  ): Promise<ReviewResult> => {
    const diff = info?.commit ? await workspace.diff(info.commit) : undefined;
    const context: ReviewContext = { checks };
    const repoRoot = await repoRootPromise;
    const allowedAgents = chatContext.allowedAgentsFor(target);

    if (repoRoot) context.repoRoot = repoRoot;
    if (info?.output) context.output = info.output;
    if (diff) context.diff = diff;

    return reviewTask(target, context, {
      execute: deps.reviewerExecute,
      ...(cwd ? { cwd } : {}),
      ...(allowedAgents.length ? { allowedAgents } : {}),
      agentHealth,
      maxRetriesPerAgent: config.maxRetriesPerAgent,
      ...(config.limitRetry ? { limitRetry: config.limitRetry } : {}),
      onAgentEvent: (info) => onReviewerAgentEvent(target.id, info),
    });
  };

  const integrationCache = new Map<string, Promise<IntegrationResult>>();

  return async (task: Task): Promise<Task> => {
    const dependencyCommits = collectDependencyCommits(task, taskState);
    const cacheKey = integrationCacheKey(projectBaseRef, dependencyCommits);

    let pendingIntegration = integrationCache.get(cacheKey);

    if (!pendingIntegration) {
      pendingIntegration = workspace.integrateDependencies(
        task.id,
        dependencyCommits,
        projectBaseRef,
      );
      integrationCache.set(cacheKey, pendingIntegration);
    }

    let integration: IntegrationResult;

    try {
      integration = await pendingIntegration;
    } catch (error) {
      integrationCache.delete(cacheKey);
      throw error;
    }

    if (!integration.ok) {
      await emit(storage, pid, "git.conflict", task.id, integration.error);

      const blocked: Task = {
        ...task,
        status: "blocked",
        integrationError: integration.error,
        blockedReason: integration.error.message,
        finishedAt: new Date(),
      };

      taskState.set(task.id, blocked);
      return blocked;
    }

    let feedback: string | undefined;
    let lastResult: Task = task;

    for (let cycle = 0; cycle <= config.maxReviewFixCycles; cycle++) {
      await emit(storage, pid, "task.started", task.id, { cycle });

      let checks: CheckResult[] = [];
      let review: ReviewResult | undefined;
      const outputBuffer = deps.onAgentOutput
        ? createOutputBuffer((chunk) => deps.onAgentOutput?.(pid, task.id, chunk))
        : undefined;

      const result = await runTask(task, {
        baseRef: integration.ref,
        // En ciclos de fix, el agente continúa desde el resultado anterior en
        // vez de rehacer la tarea desde cero.
        ...(cycle > 0 && lastResult.resultCommit
          ? { startRef: lastResult.resultCommit }
          : {}),
        extraPrompt: feedback,
        workspace,
        execute: deps.workerExecute,
        maxRetriesPerAgent: config.maxRetriesPerAgent,
        ...(config.limitRetry ? { limitRetry: config.limitRetry } : {}),
        allowedAgents: chatContext.allowedAgentsFor(task),
        agentHealth,
        attachments: chatContext.attachmentsFor(task),
        ...(task.type === "coding" ? { mode: "agentic" } : {}),
        ...(config.harness ? { harness: config.harness } : {}),
        // Los checks y el reviewer corren en el worktree del agente antes de
        // borrarlo: así se reutiliza su `node_modules` y el reviewer inspecciona
        // los archivos reales en vez del checkout principal (que no los tiene).
        // Si el intento no escribió nada (p. ej. tareas de texto), no hay nada
        // que verificar.
        onWorkspaceSuccess: async (ws, changed, info) => {
          if (!changed) {
            checks = [];
            return;
          }

          const checksStartedAt = Date.now();
          checks = await runChecksInDir(ws.path, config, task);
          await emit(storage, pid, "checks.completed", task.id, {
            durationMs: Date.now() - checksStartedAt,
            summary: summarizeChecks(checks),
          });
          review =
            reviewWithoutLlm(task, checks) ??
            (await runReview(task, ws.path, info, checks));
        },
        ...(outputBuffer
          ? { onOutput: (chunk: string) => outputBuffer.push(chunk) }
          : {}),
        ...(signal ? { signal } : {}),
        onAgentEvent: (info) => onWorkerAgentEvent(task.id, info),
      });
      outputBuffer?.flush();

      if (result.status !== "done") {
        taskState.set(result.id, result);
        await emit(storage, pid, "task.failed", result.id, {
          error: result.error,
        });
        return result;
      }

      const checksPass = checks.every((check) => check.success);

      // En el caso normal el reviewer ya corrió en `onWorkspaceSuccess` (con el
      // worktree vivo). Solo falta cuando no hubo cambios: no hay worktree que
      // inspeccionar y se revisa el texto del agente.
      if (!review) {
        review =
          reviewWithoutLlm(result, checks) ??
          (await runReview(result, undefined, undefined, checks));
      }

      await storage.saveReview({
        id: randomUUID(),
        projectId: pid,
        taskId: result.id,
        attempt: cycle + 1,
        approved: review.approved,
        summary: review.summary,
        issues: review.issues,
        createdAt: new Date(),
      });

      if (review.approved && checksPass) {
        taskState.set(result.id, result);
        await emit(storage, pid, "task.review_passed", result.id, {
          summary: review.summary,
        });
        await emit(storage, pid, "task.completed", result.id, {
          commit: result.resultCommit,
        });
        return result;
      }

      await emit(storage, pid, "task.review_failed", result.id, {
        summary: review.summary,
        issues: review.issues,
      });

      // Sin un review válido, rehacer la tarea no arregla nada: el worker
      // repetiría todo su trabajo para toparse con el mismo reviewer caído.
      if (review.unavailable) {
        const failed: Task = {
          ...result,
          status: "failed",
          error: review.summary,
          finishedAt: new Date(),
        };

        taskState.set(failed.id, failed);
        await emit(storage, pid, "task.failed", failed.id, {
          error: failed.error,
        });
        return failed;
      }

      lastResult = result;
      feedback = buildFixFeedback(review, checks);
    }

    const failed: Task = {
      ...lastResult,
      status: "failed",
      error: `review no aprobado tras ${config.maxReviewFixCycles + 1} ciclos`,
      finishedAt: new Date(),
    };

    taskState.set(failed.id, failed);
    await emit(storage, pid, "task.failed", failed.id, { error: failed.error });
    return failed;
  };
}

export interface RunProjectOptions {
  shouldPause?: () => boolean | Promise<boolean>;
  signal?: AbortSignal;
}

export async function runProjectRound(
  projectId: string,
  deps: ProjectDeps,
  options: RunProjectOptions = {},
): Promise<ProjectRoundResult> {
  const workspace = deps.workspace ?? gitWorkspaceManager;
  const storage = deps.storage;

  const project = await storage.getProject(projectId);

  if (!project) {
    throw new Error(`Proyecto ${projectId} no encontrado.`);
  }

  const config = project.config ?? deps.config ?? defaultConfig;

  const taskState = new Map<string, Task>(
    project.tasks.map((task) => [task.id, task]),
  );

  const chatContext = await loadChatContext(
    projectId,
    storage,
    project.defaultAllowedAgents ?? [],
  );

  const executeTask = makeTaskExecutor(
    project.id,
    project.baseRef,
    deps,
    config,
    workspace,
    storage,
    taskState,
    chatContext,
    options.signal,
  );

  const persistProgress = async (tasks: Task[]): Promise<void> => {
    await storage.saveProject({ ...project, tasks, updatedAt: new Date() });
  };

  const planResult = await runPlan([...taskState.values()], {
    executeTask,
    concurrency: config.concurrency,
    ...(config.maxConcurrency !== undefined
      ? { maxConcurrency: config.maxConcurrency }
      : {}),
    onUpdate: persistProgress,
    allowedAgentsFor: chatContext.allowedAgentsFor,
    ...(options.shouldPause ? { shouldPause: options.shouldPause } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  for (const task of planResult.tasks) {
    taskState.set(task.id, task);
  }

  const updated: Project = {
    ...project,
    tasks: planResult.tasks,
    updatedAt: new Date(),
  };

  await storage.saveProject(updated);

  return { project: updated, status: planResult.status };
}

export async function runProject(
  projectId: string,
  deps: ProjectDeps,
  options: RunProjectOptions = {},
): Promise<Project> {
  const workspace = deps.workspace ?? gitWorkspaceManager;
  const storage = deps.storage;

  const loaded = await storage.getProject(projectId);

  if (!loaded) {
    throw new Error(`Proyecto ${projectId} no encontrado.`);
  }

  const config = loaded.config ?? deps.config ?? defaultConfig;

  let project = recoverInterrupted(loaded);
  project = {
    ...project,
    status: "running",
    startedAt: project.startedAt ?? new Date(),
    updatedAt: new Date(),
  };

  await storage.saveProject(project);
  await emit(storage, project.id, "project.started");

  const pid = project.id;

  for (let round = 0; round < MAX_SUPERVISOR_ROUNDS; round++) {
    const roundResult = await runProjectRound(projectId, deps, options);
    project = roundResult.project;

    if (roundResult.status === "completed") {
      break;
    }

    // El supervisor y el planner inspeccionan el directorio del proyecto: si
    // no se vuelca lo ya hecho, lo ven vacío y replanifican como si ninguna
    // tarea hubiera producido nada.
    await syncProgress(project, workspace, storage);

    if (roundResult.status === "paused") {
      project = { ...project, status: "paused", updatedAt: new Date() };
      await storage.saveProject(project);
      await emit(storage, pid, "project.paused");
      return project;
    }

    if (roundResult.status === "cancelled") {
      project = {
        ...project,
        status: "cancelled",
        finishedAt: new Date(),
        updatedAt: new Date(),
      };
      await storage.saveProject(project);
      await emit(storage, pid, "project.cancelled");
      return project;
    }

    const failureCount = project.tasks.filter(
      (task) => task.status === "failed",
    ).length;
    const hasIntegrationConflict = project.tasks.some(
      (task) => task.integrationError,
    );

    const onSupervisorAgentEvent = createAgentEventEmitter(storage, pid, "supervisor");
    const decision = await superviseProject(
      project,
      {
        trigger: "ronda de plan finalizada",
        failureCount,
        hasIntegrationConflict,
      },
      {
        execute: deps.supervisorExecute,
        ...(project.defaultAllowedAgents?.length
          ? { allowedAgents: project.defaultAllowedAgents }
          : {}),
        maxRetriesPerAgent: config.maxRetriesPerAgent,
        ...(config.limitRetry ? { limitRetry: config.limitRetry } : {}),
        onAgentEvent: (info) => onSupervisorAgentEvent(undefined, info),
      },
    );

    const supervisorRun = {
      id: randomUUID(),
      projectId: pid,
      action: decision.action,
      reason: decision.reason,
      createdAt: new Date(),
    };

    if (decision.action === "replan" && decision.instructions !== undefined) {
      await storage.saveSupervisorRun({
        ...supervisorRun,
        instructions: decision.instructions,
      });
    } else {
      await storage.saveSupervisorRun(supervisorRun);
    }

    if (decision.action === "replan") {
      const context: PlanContext = {
        previousPlan: tasksToPlan(project.tasks),
        completedTaskIds: project.tasks
          .filter((task) => task.status === "done")
          .map((task) => task.id),
        failedTaskIds: project.tasks
          .filter((task) => task.status === "failed")
          .map((task) => task.id),
        supervisorReason: decision.reason,
      };

      if (decision.instructions !== undefined) {
        context.instructions = decision.instructions;
      }

      const repoRoot = await workspace.getRepoRoot().catch(() => undefined);
      if (repoRoot) {
        context.repo = await gatherRepoContext(repoRoot);
      }

      try {
        const onReplanAgentEvent = createAgentEventEmitter(storage, pid, "planner");
        const newPlan = await planProject(project.goal, context, {
          execute: deps.plannerExecute,
          ...(project.defaultAllowedAgents?.length
            ? { allowedAgents: project.defaultAllowedAgents }
            : {}),
          maxAttempts: config.plannerMaxAttempts,
          maxRetriesPerAgent: config.maxRetriesPerAgent,
          ...(config.limitRetry ? { limitRetry: config.limitRetry } : {}),
          onAgentEvent: (info) => onReplanAgentEvent(undefined, info),
        });

        const merged = mergeReplan(project.tasks, newPlan);

        project = { ...project, tasks: merged, updatedAt: new Date() };
        await storage.saveProject(project);
        await emit(storage, pid, "supervisor.replan", undefined, {
          reason: decision.reason,
        });
        continue;
      } catch (error) {
        // Un replan que no se puede aplicar (plan inválido, merge con
        // dependencias rotas…) no debe perderse en silencio: se deja
        // constancia y se corta la ejecución en lugar de reencolar lo mismo.
        await emit(storage, pid, "supervisor.replan_failed", undefined, {
          reason: decision.reason,
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }

    if (decision.action === "pause") {
      project = { ...project, status: "paused", updatedAt: new Date() };
      await storage.saveProject(project);
      await emit(storage, pid, "project.paused");
      return project;
    }

    if (decision.action === "fail") {
      project = {
        ...project,
        status: "failed",
        finishedAt: new Date(),
        updatedAt: new Date(),
      };
      await storage.saveProject(project);
      return project;
    }

    if (roundResult.status === "blocked") {
      break;
    }
  }

  return finalizeProjectRun(projectId, deps);
}

export async function finalizeProjectRun(
  projectId: string,
  deps: ProjectDeps,
): Promise<Project> {
  const workspace = deps.workspace ?? gitWorkspaceManager;
  const storage = deps.storage;

  let project = await storage.getProject(projectId);

  if (!project) {
    throw new Error(`Proyecto ${projectId} no encontrado.`);
  }

  const tasks = project.tasks;
  const allDone = tasks.every((task) => task.status === "done");

  if (allDone) {
    const commits = tasks
      .filter((task) => task.resultCommit)
      .map((task) => ({
        taskId: task.id,
        commit: task.resultCommit as string,
      }));

    const integration = await workspace.finalizeProject(
      projectId,
      commits,
      project.baseRef,
    );

    if (integration.ok) {
      project = {
        ...project,
        tasks,
        status: "completed",
        resultBranch: integration.branchName,
        resultCommit: integration.ref,
        finishedAt: new Date(),
        updatedAt: new Date(),
      };
      await emit(storage, projectId, "project.completed", undefined, {
        branch: integration.branchName,
        commit: integration.ref,
      });

      await syncWorkingTree(project, workspace, storage, integration.ref);

      if (project.remoteUrl && workspace.push) {
        try {
          await workspace.push(integration.branchName);
          await emit(storage, projectId, "project.pushed", undefined, {
            branch: integration.branchName,
            remote: project.remoteUrl,
          });
        } catch (error) {
          await emit(storage, projectId, "project.push_failed", undefined, {
            branch: integration.branchName,
            remote: project.remoteUrl,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else {
      project = { ...project, tasks, status: "failed", updatedAt: new Date() };
      await emit(
        storage,
        projectId,
        "git.conflict",
        undefined,
        integration.error,
      );
    }
  } else {
    const hasFailed = tasks.some((task) => task.status === "failed");
    project = {
      ...project,
      tasks,
      status: hasFailed ? "failed" : "blocked",
      finishedAt: new Date(),
      updatedAt: new Date(),
    };

    // Aunque el plan no haya terminado, lo que sí se completó se deja en el
    // directorio del proyecto en vez de quedarse solo dentro de git.
    await syncProgress(project, workspace, storage);
  }

  await storage.saveProject(project);
  return project;
}

export async function pauseProject(
  projectId: string,
  deps: ProjectDeps,
): Promise<Project> {
  const project = await deps.storage.getProject(projectId);

  if (!project) {
    throw new Error(`Proyecto ${projectId} no encontrado.`);
  }

  const paused: Project = {
    ...project,
    status: "paused",
    updatedAt: new Date(),
  };

  await deps.storage.saveProject(paused);
  await emit(deps.storage, projectId, "project.paused");
  return paused;
}

export async function cancelProject(
  projectId: string,
  deps: ProjectDeps,
): Promise<Project> {
  const project = await deps.storage.getProject(projectId);

  if (!project) {
    throw new Error(`Proyecto ${projectId} no encontrado.`);
  }

  const cancelled: Project = {
    ...project,
    status: "cancelled",
    finishedAt: new Date(),
    updatedAt: new Date(),
  };

  await deps.storage.saveProject(cancelled);
  await emit(deps.storage, projectId, "project.cancelled");
  return cancelled;
}

export async function deleteProject(
  projectId: string,
  deps: ProjectDeps,
): Promise<Project> {
  const project = await deps.storage.getProject(projectId);

  if (!project) {
    throw new Error(`Proyecto ${projectId} no encontrado.`);
  }

  await deps.storage.deleteProject(projectId);
  return project;
}

export async function resumeProject(
  projectId: string,
  deps: ProjectDeps,
  options: RunProjectOptions = {},
): Promise<Project> {
  const project = await deps.storage.getProject(projectId);

  if (!project) {
    throw new Error(`Proyecto ${projectId} no encontrado.`);
  }

  const resumed = requeueFailedTasks(
    recoverInterrupted({
      ...project,
      status: "running",
      updatedAt: new Date(),
    }),
  );

  await deps.storage.saveProject(resumed);
  await emit(deps.storage, projectId, "project.resumed");
  return runProject(projectId, deps, options);
}

export function buildProjectResult(
  project: Project,
): ProjectResult | undefined {
  if (
    project.status !== "completed" ||
    !project.resultBranch ||
    !project.resultCommit ||
    !project.startedAt
  ) {
    return undefined;
  }

  return {
    projectId: project.id,
    status: "completed",
    branchName: project.resultBranch,
    commitSha: project.resultCommit,
    completedTasks: project.tasks.filter((task) => task.status === "done")
      .length,
    failedTasks: project.tasks.filter((task) => task.status === "failed")
      .length,
    startedAt: project.startedAt,
    finishedAt: project.finishedAt ?? new Date(),
  };
}
