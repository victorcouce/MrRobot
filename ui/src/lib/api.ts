import { notifyProjectsChanged } from "./project-store";
import type {
  AgentSpec,
  AppInfo,
  ChatDetail,
  ChatSummary,
  ConfigInfo,
  Project,
  ProjectEvent,
  ProjectPreview,
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
    repoPath?: string;
    remoteUrl?: string;
    config?: Record<string, unknown>;
  }) =>
    request<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  pickFolder: () =>
    request<{ path: string | null }>("/api/fs/pick-folder", { method: "POST" }),

  importProject: (input: {
    repoPath: string;
    branch?: string;
    name?: string;
    goal?: string;
  }) =>
    request<Project>("/api/projects/import", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  listFinalBranches: (repoPath: string) =>
    request<{ branches: string[] }>(
      `/api/projects/import/branches?repoPath=${encodeURIComponent(repoPath)}`,
    ),

  getProject: (id: string) => request<Project>(`/api/projects/${id}`),

  deleteProject: async (id: string) => {
    const result = await request<{ id: string; deleted: boolean }>(
      `/api/projects/${id}`,
      { method: "DELETE" },
    );
    notifyProjectsChanged();
    return result;
  },

  updateProjectConfig: (id: string, config: Record<string, unknown>) =>
    request<Project>(`/api/projects/${id}/config`, {
      method: "PATCH",
      body: JSON.stringify(config),
    }),

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

  startPreview: (id: string) =>
    request<ProjectPreview>(`/api/projects/${id}/preview`, { method: "POST" }),

  getPreview: (id: string) =>
    request<ProjectPreview>(`/api/projects/${id}/preview`),

  stopPreview: (id: string) =>
    request<ProjectPreview>(`/api/projects/${id}/preview`, {
      method: "DELETE",
    }),

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

  listChats: (id: string) =>
    request<ChatSummary[]>(`/api/projects/${id}/chats`),

  listAllChats: () => request<ChatSummary[]>("/api/chats"),

  createChat: async (id: string, input: { title?: string; message?: string }) => {
    const chat = await request<ChatDetail>(`/api/projects/${id}/chats`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    notifyProjectsChanged();
    return chat;
  },

  getChat: (id: string, chatId: string) =>
    request<ChatDetail>(`/api/projects/${id}/chats/${chatId}`),

  deleteChat: async (id: string, chatId: string) => {
    const result = await request<{ id: string; deleted: boolean }>(
      `/api/projects/${id}/chats/${chatId}`,
      { method: "DELETE" },
    );
    notifyProjectsChanged();
    return result;
  },

  sendChatMessage: async (id: string, chatId: string, content: string) => {
    const chat = await request<ChatDetail>(
      `/api/projects/${id}/chats/${chatId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
      },
    );
    notifyProjectsChanged();
    return chat;
  },

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
  return agent.model === "deepseek-v4-pro" ? "DeepSeek V4 Pro" : "DeepSeek Flash";
}
