import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { emitProjectEvent } from "./service.js";
import type { Project } from "./types.js";
import type { Storage } from "../storage/types.js";
import type { Task } from "../tasks/types.js";

const MAX_BUFFER = 10 * 1024 * 1024;
const FINAL_BRANCH_RE = /^agent\/project-(.+)-final$/;
const TASK_COMMIT_RE = /^agent\(([^)]+)\):\s*(.+)$/;

export interface ImportProjectInput {
  repoPath: string;
  branch?: string;
  name?: string;
  goal?: string;
}

export interface ImportProjectDeps {
  storage: Storage;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, maxBuffer: MAX_BUFFER, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`git ${args.join(" ")} falló: ${stderr.trim() || error.message}`));
          return;
        }

        resolve(stdout.trim());
      },
    );
  });
}

export async function getRepoRoot(repoPath: string): Promise<string> {
  try {
    const root = await runGit(
      ["rev-parse", "--show-toplevel"],
      repoPath || process.cwd(),
    );
    return root;
  } catch (error) {
    throw new Error(`No se pudo acceder al repositorio Git: ${messageOf(error)}`);
  }
}

export async function listFinalBranches(repoPath: string): Promise<string[]> {
  const root = await getRepoRoot(repoPath);
  const output = await runGit(
    [
      "for-each-ref",
      "--sort=-committerdate",
      "--format=%(refname:short)",
      "refs/heads/agent/project-*-final",
    ],
    root,
  );

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function resolveRemote(root: string): Promise<string | undefined> {
  try {
    const url = await runGit(["remote", "get-url", "origin"], root);
    return url.length > 0 ? url : undefined;
  } catch {
    return undefined;
  }
}

interface ParsedCommit {
  sha: string;
  date: string;
  subject: string;
}

function parseLog(output: string): ParsedCommit[] {
  return output
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length >= 3)
    .map((parts) => ({
      sha: parts[0] as string,
      date: parts[1] as string,
      subject: parts.slice(2).join("\t"),
    }));
}

export async function importCompletedProject(
  input: ImportProjectInput,
  deps: ImportProjectDeps,
): Promise<Project> {
  const root = await getRepoRoot(input.repoPath);

  const requested = input.branch?.trim();
  const branch = requested ?? (await listFinalBranches(root))[0];

  if (!branch) {
    throw new Error(
      "No se encontró ninguna rama final (agent/project-*-final) en el repositorio.",
    );
  }

  await runGit(["rev-parse", "--verify", `refs/heads/${branch}`], root);
  const resultCommit = await runGit(["rev-parse", branch], root);

  const id = branch.match(FINAL_BRANCH_RE)?.[1] ?? randomUUID();

  if (await deps.storage.getProject(id)) {
    throw new Error(`Ya existe un proyecto con id ${id}.`);
  }

  const commits = parseLog(
    await runGit(["log", "--reverse", "--format=%H%x09%cI%x09%s", branch], root),
  );

  const tasksById = new Map<string, Task>();
  const order: string[] = [];
  let firstDate: Date | undefined;
  let lastDate: Date | undefined;

  for (const commit of commits) {
    const match = commit.subject.match(TASK_COMMIT_RE);

    if (!match) continue;

    const taskId = match[1] as string;
    const title = (match[2] ?? "").trim();
    const date = new Date(commit.date);

    if (!firstDate) firstDate = date;
    lastDate = date;

    const task: Task = {
      id: taskId,
      title,
      description: title,
      status: "done",
      type: "coding",
      complexity: "low",
      resultCommit: commit.sha,
      startedAt: date,
      finishedAt: date,
    };

    if (!tasksById.has(taskId)) {
      order.push(taskId);
    }

    tasksById.set(taskId, task);
  }

  const tasks = order
    .map((taskId) => tasksById.get(taskId))
    .filter((task): task is Task => Boolean(task));

  const rootCommit = (
    await runGit(["rev-list", "--max-parents=0", branch], root)
  )
    .split("\n")
    .pop();

  const now = new Date();
  const remoteUrl = await resolveRemote(root);
  const name = input.name?.trim() || basename(root) || id;
  const goal = input.goal?.trim() || `Proyecto importado desde ${branch}`;

  const project: Project = {
    id,
    name,
    goal,
    status: "completed",
    baseRef: rootCommit ?? resultCommit,
    repoPath: root,
    tasks,
    createdAt: firstDate ?? now,
    updatedAt: now,
    startedAt: firstDate ?? now,
    finishedAt: lastDate ?? now,
    resultBranch: branch,
    resultCommit,
  };

  if (remoteUrl) project.remoteUrl = remoteUrl;

  await deps.storage.saveProject(project);
  await emitProjectEvent(deps.storage, id, "project.created");
  await emitProjectEvent(deps.storage, id, "plan.generated", undefined, {
    summary: `Importado desde ${branch}`,
  });

  for (const task of tasks) {
    await emitProjectEvent(deps.storage, id, "task.completed", task.id, {
      commit: task.resultCommit,
    });
  }

  await emitProjectEvent(deps.storage, id, "project.completed", undefined, {
    branch,
    commit: resultCommit,
  });

  return project;
}
