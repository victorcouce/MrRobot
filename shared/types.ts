// Tipos compartidos entre backend y frontend (wire types).
// Las fechas se serializan como string ISO. El backend es source of truth.

export type ProjectStatus =
  | "draft"
  | "planning"
  | "ready"
  | "running"
  | "paused"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskStatus =
  | "todo"
  | "blocked"
  | "ready"
  | "running"
  | "interrupted"
  | "done"
  | "failed";

export type TaskType =
  | "planning"
  | "architecture"
  | "coding"
  | "review"
  | "testing"
  | "research";

export type TaskComplexity = "low" | "medium" | "high" | "critical";

export type AgentProvider = "codex" | "claude" | "deepseek" | "lmstudio";

export type AgentSpec =
  | { provider: "codex" }
  | { provider: "claude"; model?: "sonnet" | "opus" | "haiku" }
  | { provider: "deepseek"; model?: "deepseek-flash" | "deepseek-v4-pro" }
  /** `model` es el identificador del modelo cargado en LM Studio (dinámico, sin enum fijo). */
  | { provider: "lmstudio"; model?: string };

export interface TaskAttempt {
  agent: AgentSpec;
  attempt: number;
  startedAt: string;
  finishedAt: string;
  status: "success" | "failed";
  error?: string;
  workspacePath?: string;
  branchName?: string;
  baseRef?: string;
  commitSha?: string;
}

export interface IntegrationError {
  type: "git_conflict";
  dependencyTaskIds: string[];
  files?: string[];
  message: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  type: TaskType;
  complexity: TaskComplexity;
  chatId?: string;
  dependsOn?: string[];
  blockedReason?: string;
  acceptanceCriteria?: string[];
  attachmentIds?: string[];
  integrationError?: IntegrationError;
  agent?: AgentSpec;
  executedBy?: AgentSpec;
  attempts?: TaskAttempt[];
  resultCommit?: string;
  output?: string;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface ProjectStats {
  total: number;
  done: number;
  running: number;
  failed: number;
  blocked: number;
  ready: number;
  todo: number;
  progress: number;
  activeAgents: number;
}

export interface AgentUsage {
  provider: AgentProvider;
  model?: string;
  label: string;
  tasks: number;
}

export interface ProjectResult {
  projectId: string;
  status: "completed";
  branchName: string;
  commitSha: string;
  completedTasks: number;
  failedTasks: number;
  startedAt: string;
  finishedAt: string;
}

export interface ProjectBriefRound {
  message: string;
  answer: string;
}

/** Entrevista de afinado que precedió al plan inicial. */
export interface ProjectBrief {
  rounds: ProjectBriefRound[];
  summary: string;
}

export interface Project {
  id: string;
  name: string;
  goal: string;
  title?: string;
  pinned?: boolean;
  archivedAt?: string;
  status: ProjectStatus;
  baseRef: string;
  repoPath?: string;
  remoteUrl?: string;
  icon?: string;
  tasks: Task[];
  config?: ConfigInfo;
  defaultAllowedAgents?: AgentSpec[];
  brief?: ProjectBrief;
  /** Adjuntos del objetivo; sin `data` (el contenido no se reenvía en cada lectura). */
  attachments?: Attachment[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  resultBranch?: string;
  resultCommit?: string;
  stats: ProjectStats;
  agentsUsed: AgentUsage[];
  result?: ProjectResult;
}

export type ChatMessageRole = "user" | "assistant";

export type AttachmentType = "image" | "markdown";

export interface Attachment {
  id: string;
  name: string;
  type: AttachmentType;
  mimeType: string;
  size: number;
  data?: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  projectId?: string;
  role: ChatMessageRole;
  content: string;
  taskIds: string[];
  attachments?: Attachment[];
  agent?: AgentSpec;
  error?: string;
  createdAt: string;
}

export interface ChatSummary {
  id: string;
  /** Sin proyecto es un chat suelto. */
  projectId?: string;
  title: string;
  pinned?: boolean;
  archivedAt?: string;
  allowedAgents?: AgentSpec[];
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  taskIds: string[];
}

/** Proyecto del usuario: nombre, icono y carpeta donde se trabaja. */
export interface Space {
  id: string;
  name: string;
  icon: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatDetail extends ChatSummary {
  messages: ChatMessage[];
}

export type PreviewStatus =
  | "starting"
  | "installing"
  | "running"
  | "stopped"
  | "failed";

export interface ProjectPreview {
  projectId: string;
  status: PreviewStatus;
  url?: string;
  port?: number;
  command?: string;
  log?: string;
  error?: string;
  startedAt?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  goal: string;
  title?: string;
  pinned?: boolean;
  archivedAt?: string;
  status: ProjectStatus;
  repoPath?: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  resultBranch?: string;
  resultCommit?: string;
  stats: ProjectStats;
}

export interface ProjectEvent {
  id: string;
  projectId: string;
  type: string;
  taskId?: string;
  payload?: unknown;
  createdAt: string;
}

/** Métricas agregadas de los intentos de agente (para el panel de actividad). */
export interface AgentMetric {
  scope: string;
  agent: string;
  attempts: number;
  ok: number;
  failed: number;
  totalMs: number;
  /** Tokens de entrada (incluida la parte cacheada) y de salida. */
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface FailureMetric {
  reason: string;
  count: number;
}

export interface MetricsSummary {
  projects: number;
  agentRuns: AgentMetric[];
  tasks: { attempts: number; completed: number; failed: number };
  replans: number;
  topFailures: FailureMetric[];
}

export type ReviewSeverity = "low" | "medium" | "high" | "critical";

export interface ReviewIssue {
  severity: ReviewSeverity;
  description: string;
}

export interface StoredReview {
  id: string;
  projectId: string;
  taskId: string;
  attempt: number;
  approved: boolean;
  summary: string;
  issues: ReviewIssue[];
  createdAt: string;
}

export interface SupervisorRun {
  id: string;
  projectId: string;
  action: string;
  reason: string;
  instructions?: string;
  createdAt: string;
}

export type AgentChoice =
  | "auto"
  | "codex"
  | "claude-sonnet"
  | "claude-opus"
  | "claude-haiku"
  | "deepseek"
  | "deepseek-v4-pro"
  | "lmstudio";

export interface AgentAvailability {
  provider: AgentProvider;
  label: string;
  connected: boolean;
  reason?: string;
}

export interface ConfigInfo {
  concurrency: number;
  maxConcurrency: number;
  maxRetriesPerAgent: number;
  maxReviewFixCycles: number;
  plannerMaxAttempts: number;
  /** Vacío = se detectan los scripts del package.json. */
  checks: { commands: string[] };
  /** Agentes marcados por defecto al crear un proyecto. */
  defaultAllowedAgents: AgentSpec[];
  /** Modo rápido: sin tareas de tests, checks ni reviewer. */
  fastMode?: boolean;
  /** Ejecuta el plan inicial en cuanto se genera, sin pedir confirmación. */
  autoRun?: boolean;
  /** Loop de tool-calling de los proveedores locales. */
  harness?: {
    enabled?: boolean;
    bounds?: { maxIterations?: number; maxToolCalls?: number; timeoutMs?: number };
  };
}

export interface FolderCheck {
  path: string;
  exists: boolean;
  creatable: boolean;
  isRepo: boolean;
  root?: string;
  branch?: string;
  dirty?: boolean;
  error?: string;
}

export interface RemoteCheck {
  url: string;
  checked: boolean;
  ok: boolean;
  needsToken: boolean;
  error?: string;
}

export interface AppInfo {
  repoRoot: string;
  baseRef: string;
  mock: boolean;
  agents: AgentAvailability[];
  config: ConfigInfo;
  /** Si GITHUB_TOKEN está definido en el proceso del backend. */
  githubToken: boolean;
  /** Si el usuario ya pasó por el asistente de configuración inicial. */
  onboarding: { completed: boolean };
}

export interface GitHubTokenCheck {
  ok: boolean;
  /** El token quedó guardado en .env y sobrevive a un reinicio. */
  persisted: boolean;
  /** Usuario de GitHub al que pertenece el token. */
  login?: string;
  error?: string;
}

/** Fila de la matriz tipo × complejidad, derivada de `selectAgent`. */
export interface AgentMatrixRow {
  type: TaskType;
  agents: Record<TaskComplexity, AgentSpec>;
}

export interface SearchResultItem {
  id: string;
  /** Vacío en los chats sueltos. */
  projectId?: string;
  projectName?: string;
  title: string;
  /** Fragmento del mensaje que coincide, cuando no coincide el título. */
  snippet?: string;
  updatedAt?: string;
}

export interface SearchResults {
  chats: SearchResultItem[];
  tasks: SearchResultItem[];
}

export interface GrillQuestion {
  id: string;
  title: string;
  body: string;
  /** Alternativas discretas que el usuario puede elegir con un clic. */
  options?: string[] | undefined;
  recommendation: string;
}

export interface GrillMessage {
  role: "user" | "assistant";
  content: string;
}

export type GrillResponse =
  | { status: "questions"; questions: GrillQuestion[]; message: string }
  | { status: "done"; summary: string };

export interface TaskInstructionOutcome {
  action: "proceed" | "ask";
  reply: string;
  questions?: string[];
}
