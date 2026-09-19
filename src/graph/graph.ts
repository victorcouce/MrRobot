import { randomUUID } from "node:crypto";
import {
  END,
  MemorySaver,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { errorMessage } from "../agents/fallback.js";
import { defaultConfig } from "../config/index.js";
import { planProject } from "../planner/planner.js";
import type { PlanContext } from "../planner/types.js";
import {
  finalizeProjectRun,
  mergeReplan,
  runProjectRound,
  type ProjectDeps,
} from "../projects/service.js";
import { superviseProject } from "../supervisor/supervisor.js";
import { GraphState, type GraphStateType } from "./state.js";

const MAX_GRAPH_ROUNDS = 6;

type Route = "plan" | "run" | "finalize" | typeof END;

function routeAfterSupervise(state: GraphStateType): Route {
  if ((state.rounds ?? 0) >= MAX_GRAPH_ROUNDS) {
    return END;
  }

  const project = state.project;

  if (project && project.tasks.every((task) => task.status === "done")) {
    return "finalize";
  }

  const decision = state.supervisorDecision;

  if (!decision) {
    return END;
  }

  switch (decision.action) {
    case "replan":
      return "plan";
    case "continue":
      return "run";
    case "pause":
    case "fail":
      return END;
  }
}

export function buildProjectGraph(deps: ProjectDeps) {
  const plan = async (state: GraphStateType) => {
    const project = await deps.storage.getProject(state.projectId);

    if (!project) {
      return { error: `Proyecto ${state.projectId} no encontrado.` };
    }

    const decision = state.supervisorDecision;

    if (!decision || decision.action !== "replan") {
      return { project };
    }

    const config = deps.config ?? defaultConfig;
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
        ...(project.defaultAllowedAgents?.length
          ? { allowedAgents: project.defaultAllowedAgents }
          : {}),
        maxAttempts: config.plannerMaxAttempts,
        maxRetriesPerAgent: config.maxRetriesPerAgent,
        ...(config.limitRetry ? { limitRetry: config.limitRetry } : {}),
      });

      const merged = mergeReplan(project.tasks, newPlan);
      const updated = { ...project, tasks: merged, updatedAt: new Date() };
      await deps.storage.saveProject(updated);
      return { project: updated };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  };

  const run = async (state: GraphStateType) => {
    try {
      const { project } = await runProjectRound(state.projectId, deps);

      return {
        project,
        lastCompletedTaskIds: project.tasks
          .filter((task) => task.status === "done")
          .map((task) => task.id),
        lastFailedTaskIds: project.tasks
          .filter((task) => task.status === "failed")
          .map((task) => task.id),
        rounds: (state.rounds ?? 0) + 1,
      };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  };

  const supervise = async (state: GraphStateType) => {
    const project = await deps.storage.getProject(state.projectId);

    if (!project) {
      return { error: `Proyecto ${state.projectId} no encontrado.` };
    }

    if (project.tasks.every((task) => task.status === "done")) {
      return {
        project,
        supervisorDecision: {
          action: "continue" as const,
          reason: "todas las tareas completadas",
        },
      };
    }

    const config = deps.config ?? defaultConfig;
    const decision = await superviseProject(
      project,
      {
        trigger: "langgraph",
        failureCount: project.tasks.filter((task) => task.status === "failed")
          .length,
        hasIntegrationConflict: project.tasks.some(
          (task) => task.integrationError,
        ),
      },
      {
        execute: deps.supervisorExecute,
        ...(project.defaultAllowedAgents?.length
          ? { allowedAgents: project.defaultAllowedAgents }
          : {}),
        maxRetriesPerAgent: config.maxRetriesPerAgent,
        ...(config.limitRetry ? { limitRetry: config.limitRetry } : {}),
      },
    );

    const supervisorRun = {
      id: randomUUID(),
      projectId: state.projectId,
      action: decision.action,
      reason: decision.reason,
      createdAt: new Date(),
    };

    if (decision.action === "replan" && decision.instructions !== undefined) {
      await deps.storage.saveSupervisorRun({
        ...supervisorRun,
        instructions: decision.instructions,
      });
    } else {
      await deps.storage.saveSupervisorRun(supervisorRun);
    }

    return { project, supervisorDecision: decision };
  };

  const finalize = async (state: GraphStateType) => {
    const project = await finalizeProjectRun(state.projectId, deps);
    return { project };
  };

  return new StateGraph(GraphState)
    .addNode("plan", plan)
    .addNode("run", run)
    .addNode("supervise", supervise)
    .addNode("finalize", finalize)
    .addEdge(START, "plan")
    .addEdge("plan", "run")
    .addEdge("run", "supervise")
    .addConditionalEdges("supervise", routeAfterSupervise)
    .addEdge("finalize", END)
    .compile({ checkpointer: new MemorySaver() });
}
