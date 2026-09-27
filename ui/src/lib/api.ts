import { notifyProjectsChanged } from "./project-store";
import type {
  AgentMatrixRow,
  AgentSpec,
  AppInfo,
  ChatDetail,
  ChatSummary,
  ConfigInfo,
  FolderCheck,
  GrillMessage,
  GrillResponse,
  MetricsSummary,
  Project,
  ProjectBrief,
  ProjectEvent,
  ProjectPreview,
  ProjectSummary,
  RemoteCheck,
  SearchResults,
  Space,
  StoredReview,
  SupervisorRun,
  Task,
  TaskComplexity,
  TaskInstructionOutcome,
  TaskType,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";

export interface OutgoingAttachment {
  name: string;
  type: "image" | "markdown";
  mimeType: string;
  size: number;
  data: string;
}

export interface ChatPatch {
  title?: string;
  pinned?: boolean;
  archived?: boolean;
  /** `null` saca el chat de su proyecto. */
  projectId?: string | null;
}

export interface ProjectPatch {
  /** `null` vuelve a mostrar el objetivo como nombre. */
  title?: string | null;
  pinned?: boolean;
  archived?: boolean;
}

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

  listSpaces: () => request<Space[]>("/api/spaces"),

  createSpace: async (input: { name: string; icon: string; path: string }) => {
    const space = await request<Space>("/api/spaces", {
      method: "POST",
      body: JSON.stringify(input),
    });
    notifyProjectsChanged();
    return space;
  },

  createProject: (input: {
    goal: string;
    name?: string;
    icon?: string;
    repoPath?: string;
    remoteUrl?: string;
    config?: Record<string, unknown>;
    defaultAllowedAgents?: AgentSpec[];
    attachments?: Array<{
      name: string;
      type: "image" | "markdown";
      mimeType: string;
      size: number;
      data: string;
    }>;
  }) =>
    request<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  pickFolder: () =>
    request<{ path: string | null }>("/api/fs/pick-folder", { method: "POST" }),

  checkFolder: (path: string) =>
    request<FolderCheck>("/api/fs/check-folder", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),

  checkDeepSeekKey: (apiKey: string) =>
    request<{
      ok: boolean;
      applied: boolean;
      persisted: false;
      error?: string;
    }>("/api/agents/deepseek-key", {
      method: "POST",
      body: JSON.stringify({ apiKey }),
    }),

  checkRemote: (url: string) =>
    request<RemoteCheck>("/api/fs/check-remote", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

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

  generatePlan: (id: string, instructions?: string, brief?: ProjectBrief) =>
    request<Project>(`/api/projects/${id}/plan`, {
      method: "POST",
      body: JSON.stringify({
        ...(instructions ? { instructions } : {}),
        ...(brief ? { brief } : {}),
      }),
    }),

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

  sendTaskInstructions: (id: string, taskId: string, instructions: string) =>
    request<TaskInstructionOutcome>(
      `/api/projects/${id}/tasks/${taskId}/instructions`,
      {
        method: "POST",
        body: JSON.stringify({ instructions }),
      },
    ),

  listChats: (id: string) =>
    request<ChatSummary[]>(`/api/projects/${id}/chats`),

  listAllChats: () => request<ChatSummary[]>("/api/chats"),

  createChat: async (
    id: string,
    input: {
      title?: string;
      message?: string;
      attachments?: Array<{
        name: string;
        type: "image" | "markdown";
        mimeType: string;
        size: number;
        data: string;
      }>;
    },
  ) => {
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

  sendChatMessage: async (
    id: string,
    chatId: string,
    content: string,
    attachments?: Array<{
      name: string;
      type: "image" | "markdown";
      mimeType: string;
      size: number;
      data: string;
    }>,
  ) => {
    const chat = await request<ChatDetail>(
      `/api/projects/${id}/chats/${chatId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ content, attachments }),
      },
    );
    notifyProjectsChanged();
    return chat;
  },

  updateChatAllowedAgents: async (
    id: string,
    chatId: string,
    allowedAgents: AgentSpec[],
  ) => {
    const result = await request<{ id: string; allowedAgents?: AgentSpec[] }>(
      `/api/projects/${id}/chats/${chatId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ allowedAgents }),
      },
    );
    notifyProjectsChanged();
    return result;
  },

  // Chats por id: sirven igual para los de proyecto y para los sueltos.
  createStandaloneChat: async (input: {
    message?: string;
    attachments?: OutgoingAttachment[];
    allowedAgents?: AgentSpec[];
  }) => {
    const chat = await request<ChatDetail>("/api/chats", {
      method: "POST",
      body: JSON.stringify(input),
    });
    notifyProjectsChanged();
    return chat;
  },

  getChatById: (chatId: string) => request<ChatDetail>(`/api/chats/${chatId}`),

  sendMessageToChat: async (
    chatId: string,
    content: string,
    attachments?: OutgoingAttachment[],
  ) => {
    const chat = await request<ChatDetail>(`/api/chats/${chatId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, attachments }),
    });
    notifyProjectsChanged();
    return chat;
  },

  updateChat: async (chatId: string, patch: ChatPatch) => {
    const chat = await request<ChatDetail>(`/api/chats/${chatId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    notifyProjectsChanged();
    return chat;
  },

  deleteChatById: async (chatId: string) => {
    const result = await request<{ id: string; deleted: boolean }>(
      `/api/chats/${chatId}`,
      { method: "DELETE" },
    );
    notifyProjectsChanged();
    return result;
  },

  updateProject: async (id: string, patch: ProjectPatch) => {
    const project = await request<ProjectSummary>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    notifyProjectsChanged();
    return project;
  },

  activity: (limit = 100) =>
    request<ProjectEvent[]>(`/api/activity?limit=${limit}`),

  metrics: () => request<MetricsSummary>("/api/metrics"),

  agentMatrix: () => request<AgentMatrixRow[]>("/api/agents/matrix"),

  fallbackChain: (input: {
    type: TaskType;
    complexity: TaskComplexity;
    agent?: AgentSpec;
    allowedAgents?: AgentSpec[];
  }) =>
    request<AgentSpec[]>("/api/agents/fallback-chain", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  search: (q: string) =>
    request<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`),

  grill: (input: {
    goal: string;
    messages: GrillMessage[];
    repoPath?: string;
    allowedAgents?: AgentSpec[];
    projectId?: string;
  }) =>
    request<GrillResponse>("/api/grill", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};

export function streamUrl(projectId: string): string {
  return `${API_BASE}/api/projects/${projectId}/stream`;
}

export function agentLabel(agent: AgentSpec | undefined): string {
  if (!agent) return "Auto";
  if (agent.provider === "codex") return "Codex";
  if (agent.provider === "claude") {
    if (agent.model === "opus") return "Claude Opus";
    if (agent.model === "haiku") return "Claude Haiku";
    return "Claude Sonnet";
  }
  return agent.model === "deepseek-v4-pro" ? "DeepSeek V4 Pro" : "DeepSeek Flash";
}
