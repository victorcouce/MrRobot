import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdir } from "node:fs/promises";
import {
  createChat as createChatInService,
  deleteChat as deleteChatInService,
  getChatDetail,
  listAllChats as listAllChatsInService,
  listChats as listChatsInService,
  sendChatMessage as sendChatMessageInService,
  updateChatAllowedAgents as updateChatAllowedAgentsInService,
  type CreateChatInput,
} from "../chats/service.js";
import {
  assertFileWritingAgent,
  buildAgentMatrix,
  TASK_COMPLEXITIES,
} from "../agents/selector.js";
import { getFallbackChain } from "../agents/fallback.js";
import { AgentHealth } from "../agents/health.js";
import { computeMetrics, type MetricsSummary } from "./metrics.js";
import { runAgent } from "../agents/router.js";
import type { AgentCandidate } from "../agents/types.js";
import type { OrchestratorConfig } from "../config/index.js";
import { runGrill } from "../grill/grill.js";
import type { GrillMessage, GrillOutcome } from "../grill/types.js";
import { loadConfig, mergeConfig } from "../config/index.js";
import type { Project } from "../projects/types.js";
import {
  cancelProject,
  createProjectDraft,
  deleteProject as deleteProjectInService,
  emitProjectEvent,
  generatePlan,
  pauseProject,
  recoverInterruptedProjects as recoverInterruptedProjectsInService,
  resumeProject,
  runProject,
  type CreateProjectInput,
  type ProjectDeps,
} from "../projects/service.js";
import {
  addTaskToPlan,
  removeTaskFromPlan,
  updateTaskInPlan,
  type NewTaskInput,
  type TaskPatch,
} from "../projects/plan-editor.js";
import { updateProjectConfig as updateProjectConfigInService } from "../projects/config-editor.js";
import {
  importCompletedProject,
  listFinalBranches,
  type ImportProjectInput,
} from "../projects/import.js";
import { createAgentEventEmitter } from "../logging/agent-events.js";
import { appendProjectLog } from "../logging/file-logger.js";
import { PreviewManager } from "../preview/preview.js";
import type { RunOptions } from "../providers/types.js";
import { InMemoryStorage } from "../storage/memory.js";
import { createPgliteStorage } from "../storage/pglite.js";
import type {
  ProjectEvent,
  Storage,
} from "../storage/types.js";
import { createGitWorkspaceManager, prepareProjectRepo } from "../workspace/manager.js";
import type { WorkspaceManager } from "../workspace/types.js";
import type {
  AgentMatrixRow,
  AgentSpec,
  AppInfo,
  ConfigInfo,
  ProjectEvent as WireEvent,
  ProjectPreview,
  ProjectSummary,
  SearchResults,
  Space,
} from "../../shared/types.js";
import type { NewSpaceInput } from "../spaces/types.js";
import type { Task } from "../tasks/types.js";
import { askTaskAgent, type TaskInstructionMessage, type TaskInstructionOutcome } from "../tasks/instructions.js";
import { checkAgentAvailability } from "./availability.js";
import {
  createMockDeps,
  createMockWorkspace,
  mockGrill,
  mockTaskInstruction,
  type MockScenario,
} from "./mock.js";
import type { FallbackChainInput } from "./parse.js";
import {
  computeStats,
  serializeAgent,
  serializeChatDetail,
  serializeChatSummary,
  serializeEvent,
  serializeProject,
  serializeReview,
  serializeSpace,
  serializeSummary,
  serializeSupervisorRun,
} from "./serialize.js";

export interface RuntimeOptions {
  dataDir?: string;
  mock?: boolean;
  scenario?: MockScenario;
  mockDelayMs?: number;
  repoCwd?: string;
}

export class ProjectNotFoundError extends Error {}

/**
 * Ejecutor de un rol de orquestación (planner/reviewer/supervisor/grill). Fija
 * el `cwd` al repo del proyecto para que el CLI inspeccione el repositorio
 * correcto en vez del directorio del servidor, y en modo solo lectura: estos
 * roles no deben modificar el repo (el worker escribe en su worktree).
 */
export function roleExecutor(
  cwd: string | undefined,
  execute: (
    prompt: string,
    agent: AgentCandidate,
    options?: RunOptions,
  ) => Promise<string> = runAgent,
): (
  prompt: string,
  agent: AgentCandidate,
  options?: RunOptions,
) => Promise<string> {
  return (prompt, agent, options) =>
    execute(prompt, agent, {
      ...(cwd ? { cwd } : {}),
      sandbox: "read-only",
      ...options,
    });
}

function broadcastStorage(
  storage: Storage,
  onEvent: (event: ProjectEvent) => void,
): Storage {
  return new Proxy(storage, {
    get(target, prop, receiver) {
      if (prop === "appendEvent") {
        return async (event: ProjectEvent): Promise<void> => {
          await target.appendEvent(event);
          onEvent(event);
        };
      }

      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export class Runtime {
  private readonly storage: Storage;
  private readonly workspace: WorkspaceManager;
  private config: OrchestratorConfig;
  private readonly bus = new EventEmitter();
  private readonly previews = new PreviewManager();
  private readonly activeRuns = new Set<string>();
  private readonly pauseFlags = new Map<string, boolean>();
  private readonly cancelControllers = new Map<string, AbortController>();
  /**
   * Memoria de agentes agotados por límite, viva mientras dure el servidor: el
   * proveedor que cae por rate limit/cuota no vuelve a ir primero hasta que se
   * reponga, ni siquiera en otra ronda o en otro proyecto.
   */
  private readonly agentHealth = new AgentHealth();
  private readonly mock: boolean;
  private readonly scenario: MockScenario;
  private readonly mockDelayMs: number;
  private readonly repoCwd: string | undefined;
  private readonly mockDeps: ProjectDeps | undefined;
  private closed = false;

  private constructor(
    storage: Storage,
    workspace: WorkspaceManager,
    options: RuntimeOptions,
  ) {
    this.mock = options.mock ?? false;
    this.scenario = options.scenario ?? "success";
    this.mockDelayMs = options.mockDelayMs ?? 0;
    this.repoCwd = options.repoCwd;

    this.storage = broadcastStorage(storage, (event) => {
      this.bus.emit("event", event);
    });
    // Registro temporal por proyecto (fichero .log): mismo bus que alimenta el
    // SSE, para que la consola del navegador y el fichero vean exactamente los
    // mismos eventos con la misma duración.
    this.bus.on("event", (event: ProjectEvent) => {
      void appendProjectLog(event);
    });
    this.workspace = workspace;
    this.config = loadConfig();
    this.mockDeps = this.mock
      ? createMockDeps(this.storage, this.scenario, this.mockDelayMs)
      : undefined;
  }

  static async create(options: RuntimeOptions = {}): Promise<Runtime> {
    const mock = options.mock ?? false;

    if (mock) {
      const storage = new InMemoryStorage();
      await storage.init();
      return new Runtime(storage, createMockWorkspace(), options);
    }

    if (options.dataDir) {
      await mkdir(options.dataDir, { recursive: true });
    }

    const { storage, close } = await createPgliteStorage(options.dataDir);
    const runtime = new Runtime(
      storage,
      createGitWorkspaceManager(options.repoCwd),
      options,
    );
    runtime.close = close;
    return runtime;
  }

  close?: () => Promise<void>;

  private runInBackground(projectId: string, fn: () => Promise<void>): void {
    void fn()
      .catch(async (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        await emitProjectEvent(this.storage, projectId, "project.error", undefined, {
          message,
        });
      });
  }

  private baseDeps(): ProjectDeps {
    if (this.mockDeps) {
      return this.mockDeps;
    }
    return {
      storage: this.storage,
      workspace: this.workspace,
      agentHealth: this.agentHealth,
      // Evento efímero: solo va al bus/SSE, no se persiste en el event log.
      onAgentOutput: (projectId, taskId, chunk) => {
        const event: ProjectEvent = {
          id: randomUUID(),
          projectId,
          taskId,
          type: "task.output",
          payload: { chunk },
          createdAt: new Date(),
        };
        this.bus.emit("event", event);
      },
    };
  }

  private async depsFor(projectId: string): Promise<ProjectDeps> {
    const base = this.baseDeps();

    if (this.mockDeps) {
      return { ...base, config: this.config };
    }

    const project = await this.storage.getProject(projectId);
    const repoPath = project?.repoPath ?? this.repoCwd;
    const execute = roleExecutor(repoPath);

    return {
      ...base,
      ...(project?.repoPath
        ? { workspace: createGitWorkspaceManager(project.repoPath) }
        : {}),
      plannerExecute: execute,
      reviewerExecute: execute,
      supervisorExecute: execute,
      config: this.config,
    };
  }

  private mustGetProject(projectId: string): Promise<Project> {
    return this.storage.getProject(projectId).then((project) => {
      if (!project) {
        throw new ProjectNotFoundError(`Proyecto ${projectId} no encontrado.`);
      }
      return project;
    });
  }

  async info(): Promise<AppInfo> {
    let repoRoot = "";
    let baseRef = "";

    try {
      repoRoot = await this.workspace.getRepoRoot();
      baseRef = await this.workspace.resolveBaseRef();
    } catch {
      // No repo accesible: el backend lo reportará vacío.
    }

    return {
      repoRoot,
      baseRef,
      mock: this.mock,
      agents: await checkAgentAvailability(),
      config: this.configInfo(),
      githubToken: Boolean(process.env.GITHUB_TOKEN),
    };
  }

  configInfo(): ConfigInfo {
    const c = this.config;
    return {
      concurrency: c.concurrency,
      maxConcurrency: c.maxConcurrency ?? c.concurrency,
      maxRetriesPerAgent: c.maxRetriesPerAgent,
      maxReviewFixCycles: c.maxReviewFixCycles,
      plannerMaxAttempts: c.plannerMaxAttempts,
      checks: { commands: [...c.checks.commands] },
      defaultAllowedAgents: (c.defaultAllowedAgents ?? []).map(serializeAgent),
    };
  }

  updateConfig(overrides: Partial<OrchestratorConfig>): ConfigInfo {
    if (overrides.defaultAllowedAgents) {
      assertFileWritingAgent(overrides.defaultAllowedAgents);
    }

    this.config = mergeConfig(this.config, overrides);
    return this.configInfo();
  }

  /** Fuente real de la tabla "Asignación: Tipo × Complejidad" de Agentes. */
  agentMatrix(): AgentMatrixRow[] {
    return buildAgentMatrix().map((row) => ({
      type: row.type,
      agents: Object.fromEntries(
        TASK_COMPLEXITIES.map((complexity) => [
          complexity,
          serializeAgent(row.agents[complexity]),
        ]),
      ) as AgentMatrixRow["agents"],
    }));
  }

  /**
   * Cadena de fallback para un tipo/complejidad dados, calculada por el mismo
   * motor que usa la ejecución (`getFallbackChain`). No requiere que la tarea
   * exista: el editor la pide en vivo mientras se elige tipo/complejidad.
   */
  fallbackChain(input: FallbackChainInput): AgentSpec[] {
    const task = {
      id: "",
      title: "",
      description: "",
      status: "todo",
      type: input.type,
      complexity: input.complexity,
      ...(input.agent ? { agent: input.agent } : {}),
    } as Task;

    return getFallbackChain(task, input.allowedAgents ?? []).map(serializeAgent);
  }

  async grill(
    goal: string,
    messages: GrillMessage[],
    repoPath?: string,
    allowedAgents?: AgentCandidate[],
  ): Promise<GrillOutcome> {
    if (this.mock) {
      return mockGrill(messages);
    }

    return runGrill(
      goal,
      messages,
      {
        execute: roleExecutor(repoPath ?? this.repoCwd),
        maxRetriesPerAgent: this.config.maxRetriesPerAgent,
        ...(this.config.limitRetry ? { limitRetry: this.config.limitRetry } : {}),
        ...(allowedAgents && allowedAgents.length > 0 ? { allowedAgents } : {}),
      },
      repoPath,
    );
  }

  async search(rawQuery: string): Promise<SearchResults> {
    const query = rawQuery.trim().toLowerCase();

    if (!query) {
      return { chats: [], tasks: [] };
    }

    const projects = await this.storage.listProjects();
    const projectNames = new Map(projects.map((p) => [p.id, p.name]));

    const chats = await this.storage.listAllChats();
    const matchedChats = chats
      .filter((chat) => chat.title.toLowerCase().includes(query))
      .slice(0, 20)
      .map((chat) => ({
        id: chat.id,
        projectId: chat.projectId,
        projectName: projectNames.get(chat.projectId) ?? "",
        title: chat.title,
      }));

    const matchedTasks = projects
      .flatMap((project) =>
        project.tasks
          .filter(
            (task) =>
              task.title.toLowerCase().includes(query) ||
              task.id.toLowerCase().includes(query),
          )
          .map((task) => ({
            id: task.id,
            projectId: project.id,
            projectName: project.name,
            title: task.title,
          })),
      )
      .slice(0, 20);

    return { chats: matchedChats, tasks: matchedTasks };
  }

  async listSpaces(): Promise<Space[]> {
    const spaces = await this.storage.listSpaces();
    return spaces.map(serializeSpace);
  }

  async createSpace(input: NewSpaceInput): Promise<Space> {
    const now = new Date();
    const space = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
    await this.storage.saveSpace(space);
    return serializeSpace(space);
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const projects = await this.storage.listProjects();
    return projects
      .sort(
        (a, b) =>
          b.updatedAt.getTime() - a.updatedAt.getTime(),
      )
      .map(serializeSummary);
  }

  /**
   * Recupera los proyectos que quedaron en un estado transitorio
   * (`planning`/`running`) tras un reinicio del servidor. Se llama al arrancar,
   * antes de aceptar peticiones.
   */
  async recoverInterruptedProjects(
    options: { autoResume?: boolean } = {},
  ): Promise<ProjectSummary[]> {
    const recovered = await recoverInterruptedProjectsInService(this.baseDeps());

    // Un reinicio no debe dejar el proyecto parado esperando un clic: los que
    // estaban `running` se reanudan solos.
    if (options.autoResume) {
      for (const entry of recovered) {
        if (entry.previousStatus !== "running") continue;
        try {
          await this.resume(entry.project.id);
        } catch {
          // Si no se puede reanudar, queda en pausa para hacerlo a mano.
        }
      }
    }

    return recovered.map((entry) => serializeSummary(entry.project));
  }

  async getProject(projectId: string) {
    const project = await this.mustGetProject(projectId);
    return serializeProject(project);
  }

  async updateProjectConfig(
    projectId: string,
    overrides: Partial<OrchestratorConfig>,
  ) {
    const project = await updateProjectConfigInService(
      projectId,
      overrides,
      await this.depsFor(projectId),
    );
    return serializeProject(project);
  }

  async createProject(
    input: CreateProjectInput,
    configOverrides?: Partial<OrchestratorConfig>,
  ) {
    if (configOverrides?.defaultAllowedAgents) {
      assertFileWritingAgent(configOverrides.defaultAllowedAgents);
    }

    const config =
      configOverrides && Object.keys(configOverrides).length > 0
        ? mergeConfig(this.config, configOverrides)
        : undefined;

    let effective = input;
    let deps: ProjectDeps;

    if (this.mockDeps) {
      deps = { ...this.mockDeps, config: this.config };
    } else {
      let workspace = this.workspace;
      let repoPath = this.repoCwd;

      if (input.repoPath) {
        const prepared = await prepareProjectRepo(
          input.repoPath,
          input.remoteUrl,
        );
        effective = { ...input, repoPath: prepared.root };
        workspace = createGitWorkspaceManager(prepared.root);
        repoPath = prepared.root;
      }

      const execute = roleExecutor(repoPath);
      deps = {
        storage: this.storage,
        workspace,
        plannerExecute: execute,
        reviewerExecute: execute,
        supervisorExecute: execute,
        config: this.config,
      };
    }

    const project = await createProjectDraft(
      config ? { ...effective, config } : effective,
      deps,
    );

    return serializeProject(project);
  }

  async importProject(input: ImportProjectInput) {
    const project = await importCompletedProject(input, {
      storage: this.storage,
    });
    return serializeProject(project);
  }

  listFinalBranches(repoPath: string): Promise<string[]> {
    return listFinalBranches(repoPath);
  }

  async generatePlan(projectId: string, instructions?: string) {
    const project = await this.mustGetProject(projectId);

    if (project.status === "running" || project.status === "completed") {
      throw new Error(
        `No se puede generar el plan en estado ${project.status}.`,
      );
    }

    if (project.status !== "planning") {
      const planning: Project = {
        ...project,
        status: "planning",
        updatedAt: new Date(),
      };
      await this.storage.saveProject(planning);
      await emitProjectEvent(this.storage, projectId, "plan.started");
    }

    const context = instructions?.trim()
      ? { instructions: instructions.trim() }
      : {};

    this.runInBackground(projectId, async () => {
      await generatePlan(projectId, await this.depsFor(projectId), context);
    });

    return this.getProject(projectId);
  }

  async run(projectId: string) {
    const project = await this.mustGetProject(projectId);

    if (project.status !== "ready") {
      throw new Error(
        `No se puede ejecutar en estado ${project.status}. Genera y revisa el plan primero.`,
      );
    }

    if (this.activeRuns.has(projectId)) {
      throw new Error("El proyecto ya se está ejecutando.");
    }

    this.activeRuns.add(projectId);
    this.pauseFlags.set(projectId, false);
    const controller = new AbortController();
    this.cancelControllers.set(projectId, controller);

    this.runInBackground(projectId, async () => {
      try {
        await runProject(projectId, await this.depsFor(projectId), {
          shouldPause: () => this.pauseFlags.get(projectId) === true,
          signal: controller.signal,
        });
      } finally {
        this.activeRuns.delete(projectId);
        this.pauseFlags.delete(projectId);
        this.cancelControllers.delete(projectId);
      }
    });

    return this.getProject(projectId);
  }

  async pause(projectId: string) {
    const project = await this.mustGetProject(projectId);

    if (this.activeRuns.has(projectId)) {
      this.pauseFlags.set(projectId, true);
    } else if (project.status === "running") {
      await pauseProject(projectId, this.baseDeps());
    } else if (project.status !== "paused") {
      throw new Error(
        `No se puede pausar un proyecto en estado ${project.status}.`,
      );
    }

    return this.getProject(projectId);
  }

  async resume(projectId: string) {
    const project = await this.mustGetProject(projectId);

    if (
      project.status !== "paused" &&
      project.status !== "blocked" &&
      project.status !== "failed"
    ) {
      throw new Error(
        `Solo se puede reanudar un proyecto pausado, bloqueado o fallido (estado actual: ${project.status}).`,
      );
    }

    if (this.activeRuns.has(projectId)) {
      throw new Error("El proyecto ya se está ejecutando.");
    }

    this.activeRuns.add(projectId);
    this.pauseFlags.set(projectId, false);
    const controller = new AbortController();
    this.cancelControllers.set(projectId, controller);

    this.runInBackground(projectId, async () => {
      try {
        await resumeProject(projectId, await this.depsFor(projectId), {
          shouldPause: () => this.pauseFlags.get(projectId) === true,
          signal: controller.signal,
        });
      } finally {
        this.activeRuns.delete(projectId);
        this.pauseFlags.delete(projectId);
        this.cancelControllers.delete(projectId);
      }
    });

    return this.getProject(projectId);
  }

  async cancel(projectId: string) {
    const project = await this.mustGetProject(projectId);

    if (this.activeRuns.has(projectId)) {
      this.cancelControllers.get(projectId)?.abort();
    } else if (project.status === "running") {
      await cancelProject(projectId, this.baseDeps());
    } else if (
      project.status !== "cancelled" &&
      project.status !== "completed" &&
      project.status !== "failed"
    ) {
      throw new Error(
        `No se puede cancelar un proyecto en estado ${project.status}.`,
      );
    }

    return this.getProject(projectId);
  }

  async deleteProject(projectId: string) {
    const project = await this.mustGetProject(projectId);

    if (this.activeRuns.has(projectId)) {
      throw new Error(
        "No se puede borrar un proyecto en ejecución. Cancélalo primero.",
      );
    }

    await this.previews.stop(projectId);
    await emitProjectEvent(this.storage, projectId, "project.deleted");

    await deleteProjectInService(projectId, this.baseDeps());
    return { id: project.id, deleted: true };
  }

  async startPreview(projectId: string): Promise<ProjectPreview> {
    const project = await this.mustGetProject(projectId);
    const deps = await this.depsFor(projectId);
    const workspace = deps.workspace ?? this.workspace;

    return this.previews.start(project, workspace);
  }

  async getPreview(projectId: string): Promise<ProjectPreview> {
    await this.mustGetProject(projectId);

    return (
      this.previews.get(projectId) ?? {
        projectId,
        status: "stopped",
      }
    );
  }

  async stopPreview(projectId: string): Promise<ProjectPreview> {
    await this.mustGetProject(projectId);

    return (
      (await this.previews.stop(projectId)) ?? {
        projectId,
        status: "stopped",
      }
    );
  }

  async listEvents(projectId: string): Promise<WireEvent[]> {    await this.mustGetProject(projectId);
    const events = await this.storage.listEvents(projectId);
    return events
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(serializeEvent);
  }

  async listReviews(projectId: string) {
    await this.mustGetProject(projectId);
    const reviews = await this.storage.listReviews(projectId);
    return reviews.map(serializeReview);
  }

  async listSupervisorRuns(projectId: string) {
    await this.mustGetProject(projectId);
    const runs = await this.storage.listSupervisorRuns(projectId);
    return runs.map(serializeSupervisorRun);
  }

  async addTask(projectId: string, input: NewTaskInput) {
    const project = await addTaskToPlan(projectId, input, this.baseDeps());
    return serializeProject(project);
  }

  async updateTask(projectId: string, taskId: string, patch: TaskPatch) {
    const project = await updateTaskInPlan(
      projectId,
      taskId,
      patch,
      this.baseDeps(),
    );
    return serializeProject(project);
  }

  async removeTask(projectId: string, taskId: string) {
    const project = await removeTaskFromPlan(projectId, taskId, this.baseDeps());
    return serializeProject(project);
  }

  async sendTaskInstructions(
    projectId: string,
    taskId: string,
    instructions: string,
  ): Promise<TaskInstructionOutcome> {
    const project = await this.mustGetProject(projectId);
    const task = project.tasks.find((entry) => entry.id === taskId);

    if (!task) {
      throw new Error(`La tarea ${taskId} no existe en el proyecto.`);
    }

    if (task.status !== "failed" && task.status !== "blocked") {
      throw new Error(
        `Solo se pueden enviar instrucciones a tareas fallidas o bloqueadas (estado actual: ${task.status}).`,
      );
    }

    const events = await this.storage.listEvents(projectId);
    const history: TaskInstructionMessage[] = events
      .filter((event) => event.taskId === taskId)
      .filter(
        (event) =>
          event.type === "task.instruction" ||
          event.type === "task.instruction_reply",
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((event) => {
        const payload = event.payload as
          | { instructions?: string; reply?: string }
          | undefined;

        if (event.type === "task.instruction") {
          return { role: "user" as const, content: payload?.instructions ?? "" };
        }

        return { role: "assistant" as const, content: payload?.reply ?? "" };
      })
      .filter((message) => message.content.length > 0);

    await emitProjectEvent(this.storage, projectId, "task.instruction", taskId, {
      instructions,
    });

    let allowedAgents: AgentCandidate[] = project.defaultAllowedAgents ?? [];

    if (task.chatId) {
      const chat = await this.storage.getChat(task.chatId);
      if (chat?.allowedAgents?.length) {
        allowedAgents = chat.allowedAgents;
      }
    }

    const onInstructionAgentEvent = createAgentEventEmitter(
      this.storage,
      projectId,
      "instructions",
    );

    const outcome = this.mock
      ? mockTaskInstruction([
          ...history,
          { role: "user", content: instructions },
        ])
      : await askTaskAgent(task, history, instructions, {
          execute: roleExecutor(project.repoPath ?? this.repoCwd),
          maxRetriesPerAgent: this.config.maxRetriesPerAgent,
          ...(this.config.limitRetry ? { limitRetry: this.config.limitRetry } : {}),
          ...(allowedAgents.length ? { allowedAgents } : {}),
          onAgentEvent: (info) => onInstructionAgentEvent(taskId, info),
        });

    await emitProjectEvent(
      this.storage,
      projectId,
      "task.instruction_reply",
      taskId,
      {
        reply: outcome.reply,
        ...(outcome.questions ? { questions: outcome.questions } : {}),
      },
    );

    return outcome;
  }

  async listChats(projectId: string) {
    await this.mustGetProject(projectId);
    const results = await listChatsInService(projectId, await this.depsFor(projectId));
    return results.map((result) =>
      serializeChatSummary(result.chat, result.messageCount, result.taskIds),
    );
  }

  async listAllChats() {
    const results = await listAllChatsInService(this.baseDeps());
    return results
      .map((result) =>
        serializeChatSummary(result.chat, result.messageCount, result.taskIds),
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }

  async createChat(projectId: string, input: CreateChatInput) {
    await this.mustGetProject(projectId);
    const deps = await this.depsFor(projectId);
    const chat = await createChatInService(projectId, input, deps);

    if (input.message?.trim()) {
      await sendChatMessageInService(
        projectId,
        chat.id,
        input.message,
        input.attachments,
        deps,
      );
    }

    return this.getChat(projectId, chat.id);
  }

  async getChat(projectId: string, chatId: string) {
    await this.mustGetProject(projectId);
    const detail = await getChatDetail(projectId, chatId, await this.depsFor(projectId));
    return serializeChatDetail(detail.chat, detail.messages, detail.taskIds);
  }

  async deleteChat(projectId: string, chatId: string) {
    await this.mustGetProject(projectId);
    await deleteChatInService(projectId, chatId, await this.depsFor(projectId));
    return { id: chatId, deleted: true };
  }

  async sendChatMessage(
    projectId: string,
    chatId: string,
    content: string,
    attachments?: Array<{
      name: string;
      type: "image" | "markdown";
      mimeType: string;
      size: number;
      data: string;
    }>,
  ) {
    await this.mustGetProject(projectId);
    await sendChatMessageInService(
      projectId,
      chatId,
      content,
      attachments,
      await this.depsFor(projectId),
    );
    return this.getChat(projectId, chatId);
  }

  async updateChatAllowedAgents(
    projectId: string,
    chatId: string,
    agents: AgentSpec[],
  ) {
    await this.mustGetProject(projectId);
    return updateChatAllowedAgentsInService(
      projectId,
      chatId,
      agents,
      await this.depsFor(projectId),
    );
  }

  async activity(limit = 100): Promise<WireEvent[]> {
    const projects = await this.storage.listProjects();
    const events = await Promise.all(
      projects.map((project) => this.storage.listEvents(project.id)),
    );

    return events
      .flat()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map(serializeEvent);
  }

  async metrics(): Promise<MetricsSummary> {
    const projects = await this.storage.listProjects();
    const eventsByProject = await Promise.all(
      projects.map((project) => this.storage.listEvents(project.id)),
    );

    return computeMetrics(eventsByProject);
  }

  subscribe(listener: (event: ProjectEvent) => void): () => void {
    this.bus.on("event", listener);
    return () => this.bus.off("event", listener);
  }

  isMock(): boolean {
    return this.mock;
  }

  statsFor(tasks: Project["tasks"]) {
    return computeStats(tasks);
  }

  async shutdown(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.previews.stopAll();
    await this.close?.();
  }
}
