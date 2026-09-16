import type {
  AgentSpec,
  AppInfo,
  ConfigInfo,
  Project,
  ProjectEvent,
  ProjectSummary,
  StoredReview,
  SupervisorRun,
  Task,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Error ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

export const api = {
  info: () => request<AppInfo>("/api/info"),

  updateConfig: (config: Record<string, unknown>) =>
    request<ConfigInfo>("/api/config", {
      method: "PUT",
      body: JSON.stringify(config),
    }),

  listProjects: () => request<ProjectSummary[]>("/api/projects"),

  createProject: (input: {
    goal: string;
    name?: string;
    config?: Record<string, unknown>;
  }) =>
    request<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  getProject: (id: string) => request<Project>(`/api/projects/${id}`),

  generatePlan: (id: string) =>
    request<Project>(`/api/projects/${id}/plan`, { method: "POST" }),

  run: (id: string) =>
    request<Project>(`/api/projects/${id}/run`, { method: "POST" }),

  pause: (id: string) =>
    request<Project>(`/api/projects/${id}/pause`, { method: "POST" }),

  resume: (id: string) =>
    request<Project>(`/api/projects/${id}/resume`, { method: "POST" }),

  cancel: (id: string) =>
    request<Project>(`/api/projects/${id}/cancel`, { method: "POST" }),

  getTasks: (id: string) =>
    request<Task[]>(`/api/projects/${id}/tasks`),

  getEvents: (id: string) =>
    request<ProjectEvent[]>(`/api/projects/${id}/events`),

  getReviews: (id: string) =>
    request<StoredReview[]>(`/api/projects/${id}/reviews`),

  getSupervisorRuns: (id: string) =>
    request<SupervisorRun[]>(`/api/projects/${id}/supervisor`),

  addTask: (id: string, task: Record<string, unknown>) =>
    request<Project>(`/api/projects/${id}/tasks`, {
      method: "POST",
      body: JSON.stringify(task),
    }),

  updateTask: (id: string, taskId: string, patch: Record<string, unknown>) =>
    request<Project>(`/api/projects/${id}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  removeTask: (id: string, taskId: string) =>
    request<Project>(`/api/projects/${id}/tasks/${taskId}`, {
      method: "DELETE",
    }),

  activity: (limit = 100) =>
    request<ProjectEvent[]>(`/api/activity?limit=${limit}`),
};

export function streamUrl(projectId: string): string {
  return `${API_BASE}/api/projects/${projectId}/stream`;
}

export function agentLabel(agent: AgentSpec | undefined): string {
  if (!agent) return "Auto";
  if (agent.provider === "codex") return "Codex";
  if (agent.provider === "claude") {
    return agent.model === "opus" ? "Claude Opus" : "Claude Sonnet";
  }
  return "DeepSeek";
}
