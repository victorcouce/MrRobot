import type { AgentSpec as DomainAgentSpec } from "../agents/types.js";
import type {
  Chat as DomainChat,
  ChatMessage as DomainChatMessage,
} from "../chats/types.js";
import type { Project as DomainProject } from "../projects/types.js";
import type {
  ProjectEvent as DomainEvent,
  StoredReview as DomainReview,
  StoredSupervisorRun as DomainSupervisorRun,
} from "../storage/types.js";
import type { Task as DomainTask } from "../tasks/types.js";
import type {
  AgentUsage,
  ChatDetail,
  ChatMessage,
  ChatSummary,
  Project,
  ProjectEvent,
  ProjectResult,
  ProjectStats,
  ProjectSummary,
  StoredReview,
  SupervisorRun,
  Task,
} from "../../shared/types.js";

function iso(value: Date | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

export function describeAgent(agent: DomainAgentSpec): string {
  if (agent.provider === "codex") {
    return "Codex";
  }

  if (agent.provider === "claude") {
    return agent.model === "opus" ? "Claude Opus" : "Claude Sonnet";
  }

  return agent.model === "deepseek-v4-pro" ? "DeepSeek V4 Pro" : "DeepSeek Flash";
}

export function serializeAgent(agent: DomainAgentSpec) {
  if (agent.provider === "codex") {
    return { provider: "codex" as const };
  }
  if (agent.provider === "claude") {
    return agent.model
      ? { provider: "claude" as const, model: agent.model }
      : { provider: "claude" as const };
  }
  return agent.model
    ? { provider: "deepseek" as const, model: agent.model }
    : { provider: "deepseek" as const };
}

export function serializeTask(task: DomainTask): Task {
  const result: Task = {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    type: task.type,
    complexity: task.complexity,
  };

  if (task.dependsOn && task.dependsOn.length > 0) {
    result.dependsOn = task.dependsOn;
  }
  if (task.chatId) result.chatId = task.chatId;
  if (task.blockedReason) result.blockedReason = task.blockedReason;
  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    result.acceptanceCriteria = task.acceptanceCriteria;
  }
  if (task.attachmentIds && task.attachmentIds.length > 0) {
    result.attachmentIds = task.attachmentIds;
  }
  if (task.integrationError) result.integrationError = task.integrationError;
  if (task.agent) result.agent = serializeAgent(task.agent);
  if (task.executedBy) result.executedBy = serializeAgent(task.executedBy);
  if (task.attempts && task.attempts.length > 0) {
    result.attempts = task.attempts.map((attempt) => ({
      agent: serializeAgent(attempt.agent),
      attempt: attempt.attempt,
      startedAt: attempt.startedAt.toISOString(),
      finishedAt: attempt.finishedAt.toISOString(),
      status: attempt.status,
      ...(attempt.error ? { error: attempt.error } : {}),
      ...(attempt.workspacePath ? { workspacePath: attempt.workspacePath } : {}),
      ...(attempt.branchName ? { branchName: attempt.branchName } : {}),
      ...(attempt.baseRef ? { baseRef: attempt.baseRef } : {}),
      ...(attempt.commitSha ? { commitSha: attempt.commitSha } : {}),
    }));
  }
  if (task.resultCommit) result.resultCommit = task.resultCommit;
  if (task.output) result.output = task.output;
  if (task.error) result.error = task.error;
  const startedAt = iso(task.startedAt);
  const finishedAt = iso(task.finishedAt);
  if (startedAt) result.startedAt = startedAt;
  if (finishedAt) result.finishedAt = finishedAt;

  return result;
}

export function computeStats(tasks: DomainTask[]): ProjectStats {
  const stats: ProjectStats = {
    total: tasks.length,
    done: 0,
    running: 0,
    failed: 0,
    blocked: 0,
    ready: 0,
    todo: 0,
    progress: 0,
    activeAgents: 0,
  };

  for (const task of tasks) {
    switch (task.status) {
      case "done":
        stats.done += 1;
        break;
      case "running":
        stats.running += 1;
        break;
      case "failed":
        stats.failed += 1;
        break;
      case "blocked":
      case "interrupted":
        stats.blocked += 1;
        break;
      case "ready":
        stats.ready += 1;
        break;
      case "todo":
        stats.todo += 1;
        break;
    }
  }

  stats.progress =
    stats.total === 0
      ? 0
      : Math.round((stats.done / stats.total) * 100);

  stats.activeAgents = stats.running;

  return stats;
}

export function computeAgentsUsed(tasks: DomainTask[]): AgentUsage[] {
  const counts = new Map<string, AgentUsage>();

  for (const task of tasks) {
    const agent = task.executedBy;
    if (!agent) continue;

    const label = describeAgent(agent);
    const key = `${agent.provider}:${agent.provider === "codex" ? "" : agent.model ?? ""}`;

    const entry = counts.get(key);
    if (entry) {
      entry.tasks += 1;
    } else {
      const usage: AgentUsage = {
        provider: agent.provider,
        label,
        tasks: 1,
      };
      if (agent.provider !== "codex" && agent.model) {
        usage.model = agent.model;
      }
      counts.set(key, usage);
    }
  }

  return [...counts.values()].sort((a, b) => b.tasks - a.tasks);
}

function serializeResult(
  project: DomainProject,
  startedAt: string | undefined,
  finishedAt: string | undefined,
): ProjectResult | undefined {
  if (
    project.status !== "completed" ||
    !project.resultBranch ||
    !project.resultCommit ||
    !startedAt ||
    !finishedAt
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
    startedAt,
    finishedAt,
  };
}

export function serializeProject(project: DomainProject): Project {
  const startedAt = iso(project.startedAt);
  const finishedAt = iso(project.finishedAt);

  const serialized: Project = {
    id: project.id,
    name: project.name,
    goal: project.goal,
    status: project.status,
    baseRef: project.baseRef,
    tasks: project.tasks.map(serializeTask),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    stats: computeStats(project.tasks),
    agentsUsed: computeAgentsUsed(project.tasks),
  };

  if (startedAt) serialized.startedAt = startedAt;
  if (finishedAt) serialized.finishedAt = finishedAt;
  if (project.repoPath) serialized.repoPath = project.repoPath;
  if (project.remoteUrl) serialized.remoteUrl = project.remoteUrl;
  if (project.defaultAllowedAgents?.length) {
    serialized.defaultAllowedAgents =
      project.defaultAllowedAgents.map(serializeAgent);
  }
  if (project.resultBranch) serialized.resultBranch = project.resultBranch;
  if (project.resultCommit) serialized.resultCommit = project.resultCommit;

  if (project.config) {
    serialized.config = {
      concurrency: project.config.concurrency,
      maxRetriesPerAgent: project.config.maxRetriesPerAgent,
      maxReviewFixCycles: project.config.maxReviewFixCycles,
      plannerMaxAttempts: project.config.plannerMaxAttempts,
      plannerAgent: serializeAgent(project.config.plannerAgent),
      reviewerAgent: serializeAgent(project.config.reviewerAgent),
      supervisorAgent: serializeAgent(project.config.supervisorAgent),
      checks: { commands: [...project.config.checks.commands] },
      defaultAllowedAgents: (project.config.defaultAllowedAgents ?? []).map(
        serializeAgent,
      ),
    };
  }

  const result = serializeResult(project, startedAt, finishedAt);
  if (result) serialized.result = result;

  return serialized;
}

export function serializeSummary(project: DomainProject): ProjectSummary {
  const summary: ProjectSummary = {
    id: project.id,
    name: project.name,
    goal: project.goal,
    status: project.status,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    stats: computeStats(project.tasks),
  };

  const startedAt = iso(project.startedAt);
  const finishedAt = iso(project.finishedAt);
  if (startedAt) summary.startedAt = startedAt;
  if (finishedAt) summary.finishedAt = finishedAt;
  if (project.repoPath) summary.repoPath = project.repoPath;
  if (project.resultBranch) summary.resultBranch = project.resultBranch;
  if (project.resultCommit) summary.resultCommit = project.resultCommit;

  return summary;
}

export function serializeEvent(event: DomainEvent): ProjectEvent {
  const result: ProjectEvent = {
    id: event.id,
    projectId: event.projectId,
    type: event.type,
    createdAt: event.createdAt.toISOString(),
  };
  if (event.taskId) result.taskId = event.taskId;
  if (event.payload !== undefined) result.payload = event.payload;
  return result;
}

export function serializeReview(review: DomainReview): StoredReview {
  return {
    id: review.id,
    projectId: review.projectId,
    taskId: review.taskId,
    attempt: review.attempt,
    approved: review.approved,
    summary: review.summary,
    issues: (review.issues as StoredReview["issues"]) ?? [],
    createdAt: review.createdAt.toISOString(),
  };
}

export function serializeSupervisorRun(run: DomainSupervisorRun): SupervisorRun {
  const result: SupervisorRun = {
    id: run.id,
    projectId: run.projectId,
    action: run.action,
    reason: run.reason,
    createdAt: run.createdAt.toISOString(),
  };
  if (run.instructions) result.instructions = run.instructions;
  return result;
}

export function serializeChatMessage(message: DomainChatMessage): ChatMessage {
  const result: ChatMessage = {
    id: message.id,
    chatId: message.chatId,
    projectId: message.projectId,
    role: message.role,
    content: message.content,
    taskIds: message.taskIds,
    createdAt: message.createdAt.toISOString(),
  };
  if (message.attachments?.length) {
    result.attachments = message.attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      mimeType: attachment.mimeType,
      size: attachment.size,
      ...(attachment.data ? { data: attachment.data } : {}),
      createdAt: attachment.createdAt.toISOString(),
    }));
  }
  if (message.agent) result.agent = serializeAgent(message.agent);
  if (message.error) result.error = message.error;
  return result;
}

export function serializeChatSummary(
  chat: DomainChat,
  messageCount: number,
  taskIds: string[],
): ChatSummary {
  const summary: ChatSummary = {
    id: chat.id,
    projectId: chat.projectId,
    title: chat.title,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
    messageCount,
    taskIds,
  };

  if (chat.allowedAgents?.length) {
    summary.allowedAgents = chat.allowedAgents.map(serializeAgent);
  }

  return summary;
}

export function serializeChatDetail(
  chat: DomainChat,
  messages: DomainChatMessage[],
  taskIds: string[],
): ChatDetail {
  return {
    ...serializeChatSummary(chat, messages.length, taskIds),
    messages: messages.map(serializeChatMessage),
  };
}
