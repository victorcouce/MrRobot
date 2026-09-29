import { Annotation } from "@langchain/langgraph";
import type { Project } from "../projects/types.js";
import type { SupervisorDecision } from "../supervisor/types.js";

export const GraphState = Annotation.Root({
  projectId: Annotation<string>,
  project: Annotation<Project | undefined>,
  lastCompletedTaskIds: Annotation<string[]>,
  lastFailedTaskIds: Annotation<string[]>,
  supervisorDecision: Annotation<SupervisorDecision | undefined>,
  rounds: Annotation<number>,
  error: Annotation<string | undefined>,
});

export type GraphStateType = typeof GraphState.State;
