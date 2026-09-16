import { randomUUID } from "node:crypto";
import type { AgentSpec } from "../agents/types.js";
import type { Chat, ChatMessage } from "../chats/types.js";
import type { Project } from "../projects/types.js";
import type { Task, TaskAttempt, TaskStatus } from "../tasks/types.js";
import type { IntegrationError } from "../workspace/types.js";
import type {
  ProjectEvent,
  Storage,
  StoredAgentRun,
  StoredReview,
  StoredSupervisorRun,
} from "./types.js";

export interface SqlExecutor {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  exec(sql: string): Promise<void>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL,
  base_ref TEXT NOT NULL,
  repo_path TEXT,
  remote_url TEXT,
  result_branch TEXT,
  result_commit TEXT,
  config JSONB,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  type TEXT NOT NULL,
  complexity TEXT NOT NULL,
  chat_id TEXT,
  blocked_reason TEXT,
  agent JSONB,
  executed_by JSONB,
  acceptance_criteria JSONB NOT NULL DEFAULT '[]',
  integration_error JSONB,
  output TEXT,
  error TEXT,
  result_commit TEXT,
  started_at TEXT,
  finished_at TEXT,
  PRIMARY KEY (project_id, id)
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  depends_on TEXT NOT NULL,
  PRIMARY KEY (project_id, task_id, depends_on)
);

CREATE TABLE IF NOT EXISTS task_attempts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL,
  error TEXT,
  workspace_path TEXT,
  branch_name TEXT,
  base_ref TEXT,
  commit_sha TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT,
  role TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  approved BOOLEAN NOT NULL,
  summary TEXT NOT NULL,
  issues JSONB NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS supervisor_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  instructions TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,
  task_id TEXT,
  payload JSONB,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  seq INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  task_ids JSONB NOT NULL DEFAULT '[]',
  agent JSONB,
  error TEXT,
  created_at TEXT NOT NULL
);
`;

function toJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function fromJson<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }

  return value as T;
}

function iso(value: Date | undefined): string | null {
  return value ? value.toISOString() : null;
}

function date(value: unknown): Date | undefined {
  return typeof value === "string" ? new Date(value) : undefined;
}

interface ProjectRow {
  id: string;
  name: string;
  goal: string;
  status: Project["status"];
  base_ref: string;
  repo_path: string | null;
  remote_url: string | null;
  result_branch: string | null;
  result_commit: string | null;
  config: unknown;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  type: Task["type"];
  complexity: Task["complexity"];
  chat_id: string | null;
  blocked_reason: string | null;
  agent: unknown;
  executed_by: unknown;
  acceptance_criteria: unknown;
  integration_error: unknown;
  output: string | null;
  error: string | null;
  result_commit: string | null;
  started_at: string | null;
  finished_at: string | null;
}

interface AttemptRow {
  task_id: string;
  attempt: number;
  provider: string;
  model: string | null;
  status: TaskAttempt["status"];
  error: string | null;
  workspace_path: string | null;
  branch_name: string | null;
  base_ref: string | null;
  commit_sha: string | null;
  started_at: string;
  finished_at: string;
}

export class SqlStorage implements Storage {
  constructor(private readonly db: SqlExecutor) {}

  async init(): Promise<void> {
    await this.db.exec(SCHEMA);
    await this.db.exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS config JSONB");
    await this.db.exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_path TEXT");
    await this.db.exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS remote_url TEXT");
    await this.db.exec("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS chat_id TEXT");
  }

  async close(): Promise<void> {}

  async saveProject(project: Project): Promise<void> {
    await this.db.query(
      `INSERT INTO projects
        (id, name, goal, status, base_ref, repo_path, remote_url, result_branch, result_commit,
         config, created_at, updated_at, started_at, finished_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         goal = EXCLUDED.goal,
         status = EXCLUDED.status,
         base_ref = EXCLUDED.base_ref,
         repo_path = EXCLUDED.repo_path,
         remote_url = EXCLUDED.remote_url,
         result_branch = EXCLUDED.result_branch,
         result_commit = EXCLUDED.result_commit,
         config = EXCLUDED.config,
         updated_at = EXCLUDED.updated_at,
         started_at = EXCLUDED.started_at,
         finished_at = EXCLUDED.finished_at`,
      [
        project.id,
        project.name,
        project.goal,
        project.status,
        project.baseRef,
        project.repoPath ?? null,
        project.remoteUrl ?? null,
        project.resultBranch ?? null,
        project.resultCommit ?? null,
        toJson(project.config),
        project.createdAt.toISOString(),
        project.updatedAt.toISOString(),
        iso(project.startedAt),
        iso(project.finishedAt),
      ],
    );

    await this.db.query(`DELETE FROM task_attempts WHERE project_id = $1`, [
      project.id,
    ]);
    await this.db.query(`DELETE FROM task_dependencies WHERE project_id = $1`, [
      project.id,
    ]);
    await this.db.query(`DELETE FROM tasks WHERE project_id = $1`, [project.id]);

    for (const task of project.tasks) {
      await this.insertTask(project.id, task);
    }
  }

  private async insertTask(projectId: string, task: Task): Promise<void> {
    await this.db.query(
      `INSERT INTO tasks
        (project_id, id, title, description, status, type, complexity,
         chat_id, blocked_reason, agent, executed_by, acceptance_criteria,
         integration_error, output, error, result_commit, started_at, finished_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,
               $13::jsonb,$14,$15,$16,$17,$18)`,
      [
        projectId,
        task.id,
        task.title,
        task.description,
        task.status,
        task.type,
        task.complexity,
        task.chatId ?? null,
        task.blockedReason ?? null,
        toJson(task.agent),
        toJson(task.executedBy),
        toJson(task.acceptanceCriteria ?? []),
        toJson(task.integrationError),
        task.output ?? null,
        task.error ?? null,
        task.resultCommit ?? null,
        iso(task.startedAt),
        iso(task.finishedAt),
      ],
    );

    for (const dependency of task.dependsOn ?? []) {
      await this.db.query(
        `INSERT INTO task_dependencies (project_id, task_id, depends_on)
         VALUES ($1,$2,$3)`,
        [projectId, task.id, dependency],
      );
    }

    for (const attempt of task.attempts ?? []) {
      await this.db.query(
        `INSERT INTO task_attempts
          (id, project_id, task_id, attempt, provider, model, status, error,
           workspace_path, branch_name, base_ref, commit_sha, started_at, finished_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          randomUUID(),
          projectId,
          task.id,
          attempt.attempt,
          attempt.agent.provider,
          attempt.agent.provider === "codex" ? null : (attempt.agent.model ?? null),
          attempt.status,
          attempt.error ?? null,
          attempt.workspacePath ?? null,
          attempt.branchName ?? null,
          attempt.baseRef ?? null,
          attempt.commitSha ?? null,
          attempt.startedAt.toISOString(),
          attempt.finishedAt.toISOString(),
        ],
      );
    }
  }

  async getProject(id: string): Promise<Project | undefined> {
    const rows = await this.db.query<ProjectRow>(
      `SELECT * FROM projects WHERE id = $1`,
      [id],
    );
    const row = rows[0];

    if (!row) {
      return undefined;
    }

    const taskRows = await this.db.query<TaskRow>(
      `SELECT * FROM tasks WHERE project_id = $1`,
      [id],
    );
    const dependencyRows = await this.db.query<{
      task_id: string;
      depends_on: string;
    }>(`SELECT task_id, depends_on FROM task_dependencies WHERE project_id = $1`, [
      id,
    ]);
    const attemptRows = await this.db.query<AttemptRow>(
      `SELECT * FROM task_attempts WHERE project_id = $1`,
      [id],
    );

    const dependenciesByTask = new Map<string, string[]>();

    for (const dependency of dependencyRows) {
      const list = dependenciesByTask.get(dependency.task_id) ?? [];
      list.push(dependency.depends_on);
      dependenciesByTask.set(dependency.task_id, list);
    }

    const attemptsByTask = new Map<string, TaskAttempt[]>();

    for (const attempt of attemptRows) {
      const list = attemptsByTask.get(attempt.task_id) ?? [];
      list.push(this.rowToAttempt(attempt));
      attemptsByTask.set(attempt.task_id, list);
    }

    const tasks = taskRows.map((taskRow) =>
      this.rowToTask(
        taskRow,
        dependenciesByTask.get(taskRow.id) ?? [],
        attemptsByTask.get(taskRow.id) ?? [],
      ),
    );

    const project: Project = {
      id: row.id,
      name: row.name,
      goal: row.goal,
      status: row.status,
      baseRef: row.base_ref,
      tasks,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };

    if (row.repo_path) project.repoPath = row.repo_path;
    if (row.remote_url) project.remoteUrl = row.remote_url;
    if (row.result_branch) project.resultBranch = row.result_branch;
    if (row.result_commit) project.resultCommit = row.result_commit;
    const config = fromJson<Project["config"]>(row.config);
    if (config) project.config = config;
    const startedAt = date(row.started_at);
    const finishedAt = date(row.finished_at);
    if (startedAt) project.startedAt = startedAt;
    if (finishedAt) project.finishedAt = finishedAt;

    return project;
  }

  async listProjects(): Promise<Project[]> {
    const rows = await this.db.query<{ id: string }>(
      `SELECT id FROM projects ORDER BY created_at`,
    );
    const projects: Project[] = [];

    for (const row of rows) {
      const project = await this.getProject(row.id);
      if (project) {
        projects.push(project);
      }
    }

    return projects;
  }

  async deleteProject(id: string): Promise<void> {
    await this.db.query(`DELETE FROM task_attempts WHERE project_id = $1`, [id]);
    await this.db.query(`DELETE FROM task_dependencies WHERE project_id = $1`, [
      id,
    ]);
    await this.db.query(`DELETE FROM tasks WHERE project_id = $1`, [id]);
    await this.db.query(`DELETE FROM agent_runs WHERE project_id = $1`, [id]);
    await this.db.query(`DELETE FROM reviews WHERE project_id = $1`, [id]);
    await this.db.query(`DELETE FROM supervisor_runs WHERE project_id = $1`, [
      id,
    ]);
    await this.db.query(`DELETE FROM events WHERE project_id = $1`, [id]);
    await this.db.query(`DELETE FROM chat_messages WHERE project_id = $1`, [id]);
    await this.db.query(`DELETE FROM chats WHERE project_id = $1`, [id]);
    await this.db.query(`DELETE FROM projects WHERE id = $1`, [id]);
  }

  private rowToTask(
    row: TaskRow,
    dependencies: string[],
    attempts: TaskAttempt[],
  ): Task {
    const task: Task = {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      type: row.type,
      complexity: row.complexity,
    };

    if (row.chat_id) task.chatId = row.chat_id;
    if (row.blocked_reason) task.blockedReason = row.blocked_reason;
    const agent = fromJson<AgentSpec>(row.agent);
    if (agent) task.agent = agent;
    const executedBy = fromJson<AgentSpec>(row.executed_by);
    if (executedBy) task.executedBy = executedBy;
    const criteria = fromJson<string[]>(row.acceptance_criteria);
    if (criteria && criteria.length > 0) task.acceptanceCriteria = criteria;
    const integrationError = fromJson<IntegrationError>(row.integration_error);
    if (integrationError) task.integrationError = integrationError;
    if (row.output) task.output = row.output;
    if (row.error) task.error = row.error;
    if (row.result_commit) task.resultCommit = row.result_commit;
    const startedAt = date(row.started_at);
    const finishedAt = date(row.finished_at);
    if (startedAt) task.startedAt = startedAt;
    if (finishedAt) task.finishedAt = finishedAt;
    if (dependencies.length > 0) task.dependsOn = dependencies;
    if (attempts.length > 0) task.attempts = attempts;

    return task;
  }

  private rowToAttempt(row: AttemptRow): TaskAttempt {
    const agent: AgentSpec =
      row.provider === "codex"
        ? { provider: "codex" }
        : row.provider === "claude"
          ? { provider: "claude", model: (row.model as "sonnet" | "opus") ?? "sonnet" }
          : { provider: "deepseek", model: (row.model as "deepseek-flash" | "deepseek-v4-pro") ?? "deepseek-flash" };

    const attempt: TaskAttempt = {
      agent,
      attempt: row.attempt,
      startedAt: new Date(row.started_at),
      finishedAt: new Date(row.finished_at),
      status: row.status,
    };

    if (row.error) attempt.error = row.error;
    if (row.workspace_path) attempt.workspacePath = row.workspace_path;
    if (row.branch_name) attempt.branchName = row.branch_name;
    if (row.base_ref) attempt.baseRef = row.base_ref;
    if (row.commit_sha) attempt.commitSha = row.commit_sha;

    return attempt;
  }

  async appendEvent(event: ProjectEvent): Promise<void> {
    await this.db.query(
      `INSERT INTO events (id, project_id, type, task_id, payload, created_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
      [
        event.id,
        event.projectId,
        event.type,
        event.taskId ?? null,
        toJson(event.payload),
        event.createdAt.toISOString(),
      ],
    );
  }

  async listEvents(projectId: string): Promise<ProjectEvent[]> {
    const rows = await this.db.query<{
      id: string;
      project_id: string;
      type: string;
      task_id: string | null;
      payload: unknown;
      created_at: string;
    }>(
      `SELECT * FROM events WHERE project_id = $1 ORDER BY created_at`,
      [projectId],
    );

    return rows.map((row) => {
      const event: ProjectEvent = {
        id: row.id,
        projectId: row.project_id,
        type: row.type,
        createdAt: new Date(row.created_at),
      };
      if (row.task_id) event.taskId = row.task_id;
      const payload = fromJson<unknown>(row.payload);
      if (payload !== undefined) event.payload = payload;
      return event;
    });
  }

  async saveReview(review: StoredReview): Promise<void> {
    await this.db.query(
      `INSERT INTO reviews
        (id, project_id, task_id, attempt, approved, summary, issues, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [
        review.id,
        review.projectId,
        review.taskId,
        review.attempt,
        review.approved,
        review.summary,
        toJson(review.issues),
        review.createdAt.toISOString(),
      ],
    );
  }

  async saveSupervisorRun(run: StoredSupervisorRun): Promise<void> {
    await this.db.query(
      `INSERT INTO supervisor_runs
        (id, project_id, action, reason, instructions, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        run.id,
        run.projectId,
        run.action,
        run.reason,
        run.instructions ?? null,
        run.createdAt.toISOString(),
      ],
    );
  }

  async saveAgentRun(run: StoredAgentRun): Promise<void> {
    await this.db.query(
      `INSERT INTO agent_runs
        (id, project_id, task_id, role, provider, model, status, error,
         started_at, finished_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        run.id,
        run.projectId,
        run.taskId ?? null,
        run.role,
        run.provider,
        run.model ?? null,
        run.status,
        run.error ?? null,
        run.startedAt.toISOString(),
        run.finishedAt.toISOString(),
      ],
    );
  }

  async listReviews(projectId: string): Promise<StoredReview[]> {
    const rows = await this.db.query<{
      id: string;
      project_id: string;
      task_id: string;
      attempt: number;
      approved: boolean;
      summary: string;
      issues: unknown;
      created_at: string;
    }>(`SELECT * FROM reviews WHERE project_id = $1 ORDER BY created_at`, [
      projectId,
    ]);

    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      taskId: row.task_id,
      attempt: row.attempt,
      approved: row.approved,
      summary: row.summary,
      issues: fromJson<unknown>(row.issues) ?? [],
      createdAt: new Date(row.created_at),
    }));
  }

  async listSupervisorRuns(projectId: string): Promise<StoredSupervisorRun[]> {
    const rows = await this.db.query<{
      id: string;
      project_id: string;
      action: string;
      reason: string;
      instructions: string | null;
      created_at: string;
    }>(
      `SELECT * FROM supervisor_runs WHERE project_id = $1 ORDER BY created_at`,
      [projectId],
    );

    return rows.map((row) => {
      const run: StoredSupervisorRun = {
        id: row.id,
        projectId: row.project_id,
        action: row.action,
        reason: row.reason,
        createdAt: new Date(row.created_at),
      };
      if (row.instructions) run.instructions = row.instructions;
      return run;
    });
  }

  async saveChat(chat: Chat): Promise<void> {
    await this.db.query(
      `INSERT INTO chats (id, project_id, title, seq, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         updated_at = EXCLUDED.updated_at`,
      [
        chat.id,
        chat.projectId,
        chat.title,
        chat.seq,
        chat.createdAt.toISOString(),
        chat.updatedAt.toISOString(),
      ],
    );
  }

  async getChat(id: string): Promise<Chat | undefined> {
    const rows = await this.db.query<{
      id: string;
      project_id: string;
      title: string;
      seq: number;
      created_at: string;
      updated_at: string;
    }>(`SELECT * FROM chats WHERE id = $1`, [id]);
    const row = rows[0];
    if (!row) return undefined;
    return this.rowToChat(row);
  }

  async listChats(projectId: string): Promise<Chat[]> {
    const rows = await this.db.query<{
      id: string;
      project_id: string;
      title: string;
      seq: number;
      created_at: string;
      updated_at: string;
    }>(`SELECT * FROM chats WHERE project_id = $1 ORDER BY seq`, [projectId]);

    return rows.map((row) => this.rowToChat(row));
  }

  async deleteChat(id: string): Promise<void> {
    await this.db.query(`DELETE FROM chat_messages WHERE chat_id = $1`, [id]);
    await this.db.query(`DELETE FROM chats WHERE id = $1`, [id]);
  }

  private rowToChat(row: {
    id: string;
    project_id: string;
    title: string;
    seq: number;
    created_at: string;
    updated_at: string;
  }): Chat {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      seq: row.seq,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async appendChatMessage(message: ChatMessage): Promise<void> {
    await this.db.query(
      `INSERT INTO chat_messages
        (id, chat_id, project_id, role, content, task_ids, agent, error, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)`,
      [
        message.id,
        message.chatId,
        message.projectId,
        message.role,
        message.content,
        toJson(message.taskIds),
        toJson(message.agent),
        message.error ?? null,
        message.createdAt.toISOString(),
      ],
    );
  }

  async listChatMessages(chatId: string): Promise<ChatMessage[]> {
    const rows = await this.db.query<{
      id: string;
      chat_id: string;
      project_id: string;
      role: ChatMessage["role"];
      content: string;
      task_ids: unknown;
      agent: unknown;
      error: string | null;
      created_at: string;
    }>(
      `SELECT * FROM chat_messages WHERE chat_id = $1 ORDER BY created_at`,
      [chatId],
    );

    return rows.map((row) => {
      const message: ChatMessage = {
        id: row.id,
        chatId: row.chat_id,
        projectId: row.project_id,
        role: row.role,
        content: row.content,
        taskIds: fromJson<string[]>(row.task_ids) ?? [],
        createdAt: new Date(row.created_at),
      };
      const agent = fromJson<AgentSpec>(row.agent);
      if (agent) message.agent = agent;
      if (row.error) message.error = row.error;
      return message;
    });
  }
}
