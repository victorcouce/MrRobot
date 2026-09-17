import { isAbsolute } from "node:path";
import type { AgentSpec } from "../agents/types.js";
import type { CreateChatInput } from "../chats/service.js";
import type { OrchestratorConfig } from "../config/index.js";
import type { NewTaskInput, TaskPatch } from "../projects/plan-editor.js";
import type { ImportProjectInput } from "../projects/import.js";
import type {
  TaskComplexity,
  TaskType,
} from "../tasks/types.js";
import type { AgentChoice } from "../../shared/types.js";

const TASK_TYPES = new Set<TaskType>([
  "planning",
  "architecture",
  "coding",
  "review",
  "testing",
  "research",
]);

const COMPLEXITIES = new Set<TaskComplexity>([
  "low",
  "medium",
  "high",
  "critical",
]);

export function parseAgent(value: unknown): AgentSpec | undefined {
  if (value === undefined || value === null || value === "auto") {
    return undefined;
  }

  if (typeof value === "string") {
    switch (value as AgentChoice) {
      case "codex":
        return { provider: "codex" };
      case "claude-sonnet":
        return { provider: "claude", model: "sonnet" };
      case "claude-opus":
        return { provider: "claude", model: "opus" };
      case "deepseek":
        return { provider: "deepseek", model: "deepseek-flash" };
      case "deepseek-v4-pro":
        return { provider: "deepseek", model: "deepseek-v4-pro" };
      default:
        throw new Error(`Valor de agente desconocido: ${value}`);
    }
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const provider = obj["provider"];

    if (provider === "codex") {
      return { provider: "codex" };
    }

    if (provider === "claude") {
      return { provider: "claude", model: obj["model"] === "opus" ? "opus" : "sonnet" };
    }

    if (provider === "deepseek") {
      return {
        provider: "deepseek",
        model: obj["model"] === "deepseek-v4-pro" ? "deepseek-v4-pro" : "deepseek-flash",
      };
    }
  }

  throw new Error("Valor de agente inválido.");
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`El campo "${field}" debe ser un texto no vacío.`);
  }
  return value;
}

function parseType(value: unknown): TaskType {
  if (typeof value !== "string" || !TASK_TYPES.has(value as TaskType)) {
    throw new Error(`type inválido: ${String(value)}`);
  }
  return value as TaskType;
}

function parseComplexity(value: unknown): TaskComplexity {
  if (
    typeof value !== "string" ||
    !COMPLEXITIES.has(value as TaskComplexity)
  ) {
    throw new Error(`complexity inválido: ${String(value)}`);
  }
  return value as TaskComplexity;
}

function parseDependsOn(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("dependsOn debe ser un array de strings.");
  }
  return value as string[];
}

function parseAcceptanceCriteria(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("acceptanceCriteria debe ser un array de strings.");
  }
  return value as string[];
}

export function parseNewTask(body: Record<string, unknown>): NewTaskInput {
  const title = assertString(body["title"], "title");
  const description = assertString(body["description"], "description");
  const type = parseType(body["type"]);
  const complexity = parseComplexity(body["complexity"]);

  const input: NewTaskInput = { title, description, type, complexity };

  if (typeof body["id"] === "string" && body["id"].trim().length > 0) {
    input.id = body["id"];
  }
  const dependsOn = parseDependsOn(body["dependsOn"]);
  if (dependsOn) input.dependsOn = dependsOn;
  const acceptanceCriteria = parseAcceptanceCriteria(body["acceptanceCriteria"]);
  if (acceptanceCriteria) input.acceptanceCriteria = acceptanceCriteria;
  if ("agent" in body) {
    const agent = parseAgent(body["agent"]);
    if (agent) input.agent = agent;
  }

  return input;
}

export function parseTaskPatch(body: Record<string, unknown>): TaskPatch {
  const patch: TaskPatch = {};

  if (body["title"] !== undefined) patch.title = assertString(body["title"], "title");
  if (body["description"] !== undefined) {
    patch.description = assertString(body["description"], "description");
  }
  if (body["type"] !== undefined) patch.type = parseType(body["type"]);
  if (body["complexity"] !== undefined) {
    patch.complexity = parseComplexity(body["complexity"]);
  }
  if (body["dependsOn"] !== undefined) {
    const dependsOn = parseDependsOn(body["dependsOn"]);
    if (dependsOn !== undefined) patch.dependsOn = dependsOn;
  }
  if (body["acceptanceCriteria"] !== undefined) {
    const criteria = parseAcceptanceCriteria(body["acceptanceCriteria"]);
    if (criteria !== undefined) patch.acceptanceCriteria = criteria;
  }
  if ("agent" in body) {
    patch.agent = parseAgent(body["agent"]) ?? null;
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No se enviaron campos para actualizar.");
  }

  return patch;
}

export interface RepoOptions {
  repoPath?: string;
  remoteUrl?: string;
}

export function parseRepoOptions(body: Record<string, unknown>): RepoOptions {
  const options: RepoOptions = {};

  const repoPath = body["repoPath"];
  if (repoPath !== undefined && repoPath !== null && repoPath !== "") {
    if (typeof repoPath !== "string" || !repoPath.trim()) {
      throw new Error('El campo "repoPath" debe ser una ruta no vacía.');
    }

    const trimmed = repoPath.trim();

    if (!isAbsolute(trimmed)) {
      throw new Error('El campo "repoPath" debe ser una ruta absoluta.');
    }

    options.repoPath = trimmed;
  }

  const remoteUrl = body["remoteUrl"];
  if (remoteUrl !== undefined && remoteUrl !== null && remoteUrl !== "") {
    if (typeof remoteUrl !== "string" || !remoteUrl.trim()) {
      throw new Error('El campo "remoteUrl" debe ser una URL no vacía.');
    }

    options.remoteUrl = remoteUrl.trim();
  }

  return options;
}

export function parseImportProject(
  body: Record<string, unknown>,
): ImportProjectInput {
  const repoPath = body["repoPath"];

  if (typeof repoPath !== "string" || !repoPath.trim()) {
    throw new Error('El campo "repoPath" es obligatorio.');
  }

  const input: ImportProjectInput = { repoPath: repoPath.trim() };

  const branch = body["branch"];
  if (branch !== undefined && branch !== null && branch !== "") {
    if (typeof branch !== "string" || !branch.trim()) {
      throw new Error('El campo "branch" debe ser un texto no vacío.');
    }
    input.branch = branch.trim();
  }

  const name = body["name"];
  if (name !== undefined && name !== null && name !== "") {
    if (typeof name !== "string" || !name.trim()) {
      throw new Error('El campo "name" debe ser un texto no vacío.');
    }
    input.name = name.trim();
  }

  const goal = body["goal"];
  if (goal !== undefined && goal !== null && goal !== "") {
    if (typeof goal !== "string" || !goal.trim()) {
      throw new Error('El campo "goal" debe ser un texto no vacío.');
    }
    input.goal = goal.trim();
  }

  return input;
}

export interface ParsedAttachment {
  name: string;
  type: "image" | "markdown";
  mimeType: string;
  size: number;
  data: string;
}

export function parseAttachments(
  value: unknown,
): ParsedAttachment[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error("El campo attachments debe ser un array.");
  }

  const validated: ParsedAttachment[] = [];

  for (const att of value) {
    if (typeof att !== "object" || att === null) {
      throw new Error("Cada adjunto debe ser un objeto.");
    }

    const obj = att as Record<string, unknown>;
    const name = obj["name"];
    const type = obj["type"];
    const mimeType = obj["mimeType"];
    const size = obj["size"];
    const data = obj["data"];

    if (typeof name !== "string" || !name.trim()) {
      throw new Error('El campo "name" del adjunto es obligatorio.');
    }
    if (type !== "image" && type !== "markdown") {
      throw new Error('El campo "type" debe ser "image" o "markdown".');
    }
    if (typeof mimeType !== "string" || !mimeType.trim()) {
      throw new Error('El campo "mimeType" es obligatorio.');
    }
    if (typeof size !== "number" || size < 0) {
      throw new Error('El campo "size" debe ser un número positivo.');
    }
    if (typeof data !== "string" || !data.trim()) {
      throw new Error('El campo "data" es obligatorio.');
    }

    if (size > 2 * 1024 * 1024) {
      throw new Error(`El adjunto "${name}" excede 2MB.`);
    }

    validated.push({
      name: name.trim(),
      type,
      mimeType: mimeType.trim(),
      size,
      data,
    });
  }

  if (validated.length === 0) {
    return undefined;
  }

  const totalSize = validated.reduce((sum, a) => sum + a.size, 0);
  if (totalSize > 5 * 1024 * 1024) {
    throw new Error("El total de adjuntos excede 5MB.");
  }

  return validated;
}

export function parseChatInput(body: Record<string, unknown>): CreateChatInput {
  const input: CreateChatInput = {};

  const title = body["title"];
  if (title !== undefined && title !== null && title !== "") {
    if (typeof title !== "string" || !title.trim()) {
      throw new Error('El campo "title" debe ser un texto no vacío.');
    }
    input.title = title.trim();
  }

  const message = body["message"];
  if (message !== undefined && message !== null && message !== "") {
    if (typeof message !== "string" || !message.trim()) {
      throw new Error('El campo "message" debe ser un texto no vacío.');
    }
    input.message = message.trim();
  }

  const attachments = parseAttachments(body["attachments"]);
  if (attachments) {
    input.attachments = attachments;
  }

  return input;
}

export interface ParsedChatMessage {
  content: string;
  attachments?: ParsedAttachment[];
}

export function parseChatMessage(body: Record<string, unknown>): ParsedChatMessage {
  const content = body["content"];

  if (typeof content !== "string" || !content.trim()) {
    throw new Error('El campo "content" debe ser un texto no vacío.');
  }

  const parsed: ParsedChatMessage = { content: content.trim() };

  const attachments = parseAttachments(body["attachments"]);
  if (attachments) {
    parsed.attachments = attachments;
  }

  return parsed;
}

export function parseAllowedAgents(value: unknown): AgentSpec[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("allowedAgents debe ser un array.");
  }

  return value.map((item) => {
    const agent = parseAgent(item);
    if (!agent) {
      throw new Error("Cada agente permitido debe ser un agente concreto (no auto).");
    }
    return agent;
  });
}

export function parseConfigOverrides(
  body: Record<string, unknown>,
): Partial<OrchestratorConfig> {
  const overrides: Partial<OrchestratorConfig> = {};

  for (const field of [
    "concurrency",
    "maxRetriesPerAgent",
    "maxReviewFixCycles",
    "plannerMaxAttempts",
  ] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      throw new Error(`El campo "${field}" debe ser un entero positivo.`);
    }
    (overrides as Record<string, unknown>)[field] = value;
  }

  for (const field of ["plannerAgent", "reviewerAgent", "supervisorAgent"] as const) {
    const value = body[field];
    if (value === undefined) continue;
    const agent = parseAgent(value);
    if (!agent) {
      throw new Error(`El campo "${field}" requiere un agente concreto (no auto).`);
    }
    (overrides as Record<string, unknown>)[field] = agent;
  }

  const checks = body["checks"];
  if (checks !== undefined) {
    if (typeof checks !== "object" || checks === null || Array.isArray(checks)) {
      throw new Error('El campo "checks" debe ser un objeto.');
    }

    const commands = (checks as Record<string, unknown>)["commands"];
    if (commands !== undefined) {
      if (
        !Array.isArray(commands) ||
        commands.some((command) => typeof command !== "string")
      ) {
        throw new Error('El campo "checks.commands" debe ser un array de textos.');
      }

      overrides.checks = {
        commands: (commands as string[])
          .map((command) => command.trim())
          .filter((command) => command.length > 0),
      };
    }
  }

  if (body["defaultAllowedAgents"] !== undefined) {
    overrides.defaultAllowedAgents = parseAllowedAgents(
      body["defaultAllowedAgents"],
    );
  }

  return overrides;
}
