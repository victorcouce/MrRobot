import { randomUUID } from "node:crypto";
import type { AgentCandidate } from "../agents/types.js";
import { detectCheckScripts, runProjectChecks } from "../checks/checks.js";
import type { CheckResult } from "../checks/types.js";
import { defaultConfig, type OrchestratorConfig } from "../config/index.js";
import { planProject } from "../planner/planner.js";
import type { GeneratedPlan, PlanContext } from "../planner/types.js";
import { reviewTask } from "../reviewer/reviewer.js";
import type { ReviewResult } from "../reviewer/types.js";
import { runPlan } from "../scheduler/scheduler.js";
import type { PlanStatus } from "../scheduler/types.js";
import { validatePlan } from "../scheduler/validation.js";
import { runTask, type AgentExecutor } from "../tasks/runner.js";
import type { Task } from "../tasks/types.js";
import type { ProjectEvent, Storage } from "../storage/types.js";
import { superviseProject } from "../supervisor/supervisor.js";
import { gitWorkspaceManager } from "../workspace/manager.js";
import type { WorkspaceManager } from "../workspace/types.js";
import type { Project, ProjectResult } from "./types.js";

export interface ProjectDeps {
  storage: Storage;
  workspace?: WorkspaceManager;
  config?: OrchestratorConfig;
  plannerExecute?: (prompt: string, agent: AgentCandidate) => Promise<string>;
  workerExecute?: AgentExecutor;
  reviewerExecute?: (prompt: string, agent: AgentCandidate) => Promise<string>;
  supervisorExecute?: (prompt: string, agent: AgentCandidate) => Promise<string>;
}

export interface CreateProjectInput {
  goal: string;
  name?: string;
  config?: OrchestratorConfig;
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

export async function createProject(
  input: CreateProjectInput,
  deps: ProjectDeps,
): Promise<Project> {
  const config = deps.config ?? defaultConfig;
  const workspace = deps.workspace ?? gitWorkspaceManager;

  const baseRef = await workspace.resolveBaseRef();
  const plan = await planProject(
    input.goal,
    {},
    {
      execute: deps.plannerExecute,
      agent: config.plannerAgent,
      maxAttempts: config.plannerMaxAttempts,
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

  await deps.storage.saveProject(project);
  await emit(deps.storage, project.id, "project.created");

  return project;
}

export async function generatePlan(
  projectId: string,
  deps: ProjectDeps,
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

  const plan = await planProject(project.goal, {}, {
    execute: deps.plannerExecute,
    agent: config.plannerAgent,
    maxAttempts: config.plannerMaxAttempts,
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
  const lines = ["El reviewer rechazó la tarea. Corrige estos problemas:"];

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
    lines.push(`- El check "${check.command}" falló.`);
  }

  return lines.join("\n");
}

async function runChecksForTask(
  workspace: WorkspaceManager,
  config: OrchestratorConfig,
  task: Task,
): Promise<CheckResult[]> {
  if (!task.resultCommit) {
    return [];
  }

  const checkWorkspace = await workspace.create(
    `${task.id}-checks`,
    1,
    task.resultCommit,
  );

  try {
    const scripts =
      config.checks.commands.length > 0
        ? config.checks.commands
        : await detectCheckScripts(checkWorkspace.path);

    if (scripts.length === 0) {
      return [];
    }

    return await runProjectChecks(checkWorkspace.path, scripts);
  } finally {
    await workspace.remove(checkWorkspace, { deleteBranch: true });
  }
}

export function mergeReplan(existing: Task[], plan: GeneratedPlan): Task[] {
  const done = existing.filter((task) => task.status === "done");
  const doneIds = new Set(done.map((task) => task.id));
  const reset = existing
    .filter((task) => task.status !== "done")
    .map((task) => ({ ...task, status: "todo" as const }));
  const resetIds = new Set(reset.map((task) => task.id));
  const generated = planToTasks(plan).filter(
    (task) => !doneIds.has(task.id) && !resetIds.has(task.id),
  );
  const merged = [...done, ...reset, ...generated];

  validatePlan(merged);
  return merged;
}

function makeTaskExecutor(
  pid: string,
  projectBaseRef: string,
  deps: ProjectDeps,
  config: OrchestratorConfig,
  workspace: WorkspaceManager,
  storage: Storage,
  taskState: Map<string, Task>,
  signal?: AbortSignal,
): (task: Task) => Promise<Task> {
  return async (task: Task): Promise<Task> => {
    const dependencyCommits = (task.dependsOn ?? [])
      .map((id) => taskState.get(id))
      .filter((dependency): dependency is Task =>
        Boolean(dependency?.resultCommit),
      )
      .map((dependency) => ({
        taskId: dependency.id,
        commit: dependency.resultCommit as string,
      }));

    const integration = await workspace.integrateDependencies(
      task.id,
      dependencyCommits,
      projectBaseRef,
    );

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

      const result = await runTask(task, {
        baseRef: integration.ref,
        extraPrompt: feedback,
        workspace,
        execute: deps.workerExecute,
        maxRetriesPerAgent: config.maxRetriesPerAgent,
        ...(signal ? { signal } : {}),
      });

      if (result.status !== "done") {
        taskState.set(result.id, result);
        await emit(storage, pid, "task.failed", result.id, {
          error: result.error,
        });
        return result;
      }

      const checks = await runChecksForTask(workspace, config, result);
      const diff = result.resultCommit
        ? await workspace.diff(result.resultCommit)
        : undefined;

      const reviewContext: {
        checks: CheckResult[];
        output?: string;
        diff?: string;
      } = { checks };

      if (result.output) reviewContext.output = result.output;
      if (diff) reviewContext.diff = diff;

      const review = await reviewTask(result, reviewContext, {
        execute: deps.reviewerExecute,
        agent: config.reviewerAgent,
      });

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

      const checksPass = checks.every((check) => check.success);

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

  const executeTask = makeTaskExecutor(
    project.id,
    project.baseRef,
    deps,
    config,
    workspace,
    storage,
    taskState,
    options.signal,
  );

  const planResult = await runPlan([...taskState.values()], {
    executeTask,
    concurrency: config.concurrency,
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

    const decision = await superviseProject(
      project,
      {
        trigger: "ronda de plan finalizada",
        failureCount,
        hasIntegrationConflict,
      },
      { execute: deps.supervisorExecute, agent: config.supervisorAgent },
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

      try {
        const newPlan = await planProject(project.goal, context, {
          execute: deps.plannerExecute,
          agent: config.plannerAgent,
          maxAttempts: config.plannerMaxAttempts,
        });

        const merged = mergeReplan(project.tasks, newPlan);

        project = { ...project, tasks: merged, updatedAt: new Date() };
        await storage.saveProject(project);
        await emit(storage, pid, "supervisor.replan", undefined, {
          reason: decision.reason,
        });
        continue;
      } catch {
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

export async function resumeProject(
  projectId: string,
  deps: ProjectDeps,
  options: RunProjectOptions = {},
): Promise<Project> {
  const project = await deps.storage.getProject(projectId);

  if (!project) {
    throw new Error(`Proyecto ${projectId} no encontrado.`);
  }

  const resumed = recoverInterrupted({
    ...project,
    status: "running",
    updatedAt: new Date(),
  });

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
