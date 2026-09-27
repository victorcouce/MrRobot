import { isAbsolute } from "node:path";
import type { AgentSpec } from "../agents/types.js";
import type { ChatPatch, CreateChatInput } from "../chats/service.js";
import type { OrchestratorConfig } from "../config/index.js";
import type { GrillMessage } from "../grill/types.js";
import type { NewTaskInput, TaskPatch } from "../projects/plan-editor.js";
import type { ImportProjectInput } from "../projects/import.js";
import type { ProjectBrief } from "../projects/types.js";
import type { NewSpaceInput } from "../spaces/types.js";
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
      case "claude-haiku":
        return { provider: "claude", model: "haiku" };
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
      const model = obj["model"];

      if (model === "opus" || model === "sonnet" || model === "haiku") {
        return { provider: "claude", model: model as "opus" | "sonnet" | "haiku" };
      }

      return { provider: "claude", model: "sonnet" };
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

export function parseType(value: unknown): TaskType {
  if (typeof value !== "string" || !TASK_TYPES.has(value as TaskType)) {
    throw new Error(`type inválido: ${String(value)}`);
  }
  return value as TaskType;
}

export function parseComplexity(value: unknown): TaskComplexity {
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

const MAX_SPACE_NAME = 80;
const SPACE_ICON = /^[a-z0-9-]{1,40}$/;

export function parseNewSpace(body: Record<string, unknown>): NewSpaceInput {
  const name = body["name"];
  if (typeof name !== "string" || !name.trim()) {
    throw new Error('El campo "name" es obligatorio.');
  }
  if (name.trim().length > MAX_SPACE_NAME) {
    throw new Error(
      `El campo "name" debe ser un texto de ${MAX_SPACE_NAME} caracteres como mucho.`,
    );
  }

  const path = body["path"];
  if (typeof path !== "string" || !path.trim()) {
    throw new Error('El campo "path" es obligatorio.');
  }
  if (!isAbsolute(path.trim())) {
    throw new Error('El campo "path" debe ser una ruta absoluta.');
  }

  const icon = body["icon"] ?? "folder";
  if (typeof icon !== "string" || !SPACE_ICON.test(icon)) {
    throw new Error('El campo "icon" es inválido.');
  }

  return { name: name.trim(), icon, path: path.trim() };
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

    // `size` lo declara el cliente: si no coincide con el tamaño real del
    // base64, un cliente podría declarar size:0 y saltarse el límite de abajo.
    const actualSize = Buffer.byteLength(data, "base64");
    if (actualSize !== size) {
      throw new Error(
        `El adjunto "${name}" declara un tamaño que no coincide con sus datos.`,
      );
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

function optionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`El campo "${key}" debe ser true o false.`);
  }
  return value;
}

export function parseChatPatch(body: Record<string, unknown>): ChatPatch {
  const patch: ChatPatch = {};

  const title = body["title"];
  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim()) {
      throw new Error('El campo "title" debe ser un texto no vacío.');
    }
    patch.title = title.trim();
  }

  const pinned = optionalBoolean(body, "pinned");
  if (pinned !== undefined) patch.pinned = pinned;
  const archived = optionalBoolean(body, "archived");
  if (archived !== undefined) patch.archived = archived;

  if ("projectId" in body) {
    const projectId = body["projectId"];
    if (projectId !== null && (typeof projectId !== "string" || !projectId.trim())) {
      throw new Error('El campo "projectId" debe ser un id de proyecto o null.');
    }
    patch.projectId = projectId === null ? null : projectId.trim();
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No hay campos para actualizar: se requiere title, pinned, archived o projectId.");
  }

  return patch;
}

export interface ProjectPatch {
  title?: string | null;
  pinned?: boolean;
  archived?: boolean;
}

export function parseProjectPatch(body: Record<string, unknown>): ProjectPatch {
  const patch: ProjectPatch = {};

  if ("title" in body) {
    const title = body["title"];
    if (title !== null && typeof title !== "string") {
      throw new Error('El campo "title" debe ser un texto o null.');
    }
    patch.title = title === null ? null : title.trim() || null;
  }

  const pinned = optionalBoolean(body, "pinned");
  if (pinned !== undefined) patch.pinned = pinned;
  const archived = optionalBoolean(body, "archived");
  if (archived !== undefined) patch.archived = archived;

  if (Object.keys(patch).length === 0) {
    throw new Error("No hay campos para actualizar: se requiere title, pinned o archived.");
  }

  return patch;
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

export interface ParsedGrillInput {
  goal: string;
  messages: GrillMessage[];
  repoPath?: string;
  allowedAgents?: AgentSpec[];
  /** Proyecto del que se toman los adjuntos del objetivo. */
  projectId?: string;
}

export function parseGrillInput(body: Record<string, unknown>): ParsedGrillInput {
  const goal = body["goal"];

  if (typeof goal !== "string" || !goal.trim()) {
    throw new Error('El campo "goal" debe ser un texto no vacío.');
  }

  const rawMessages = body["messages"] ?? [];
  if (!Array.isArray(rawMessages)) {
    throw new Error('El campo "messages" debe ser un array.');
  }

  const messages: GrillMessage[] = rawMessages.map((item) => {
    if (typeof item !== "object" || item === null) {
      throw new Error("Cada mensaje del grill debe ser un objeto.");
    }

    const obj = item as Record<string, unknown>;
    const role = obj["role"];
    const content = obj["content"];

    if (role !== "user" && role !== "assistant") {
      throw new Error('El campo "role" del mensaje debe ser "user" o "assistant".');
    }

    if (typeof content !== "string" || !content.trim()) {
      throw new Error('El campo "content" del mensaje debe ser un texto no vacío.');
    }

    return { role, content: content.trim() };
  });

  const parsed: ParsedGrillInput = { goal: goal.trim(), messages };
  const repoPath = body["repoPath"];

  if (typeof repoPath === "string" && repoPath.trim()) {
    parsed.repoPath = repoPath.trim();
  }

  if (body["allowedAgents"] !== undefined) {
    parsed.allowedAgents = parseAllowedAgents(body["allowedAgents"]);
  }

  const projectId = body["projectId"];

  if (typeof projectId === "string" && projectId.trim()) {
    parsed.projectId = projectId.trim();
  }

  return parsed;
}

export interface FallbackChainInput {
  type: TaskType;
  complexity: TaskComplexity;
  agent?: AgentSpec;
  allowedAgents?: AgentSpec[];
}

/** Entrevista de afinado opcional que acompaña a la generación del plan. */
export function parseProjectBrief(value: unknown): ProjectBrief | undefined {
  if (value === undefined || value === null) return undefined;

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error('El campo "brief" debe ser un objeto.');
  }

  const obj = value as Record<string, unknown>;
  const rawRounds = obj["rounds"] ?? [];
  const summary = obj["summary"] ?? "";

  if (!Array.isArray(rawRounds)) {
    throw new Error('El campo "brief.rounds" debe ser un array.');
  }

  if (typeof summary !== "string") {
    throw new Error('El campo "brief.summary" debe ser un texto.');
  }

  const rounds = rawRounds.map((item) => {
    const round = (item ?? {}) as Record<string, unknown>;
    const message = round["message"];
    const answer = round["answer"];

    if (typeof message !== "string" || typeof answer !== "string") {
      throw new Error(
        'Cada ronda de "brief.rounds" debe tener "message" y "answer" de texto.',
      );
    }

    return { message, answer };
  });

  return { rounds, summary: summary.trim() };
}

export function parseTaskInstructions(body: Record<string, unknown>): string {
  const instructions = body["instructions"];

  if (typeof instructions !== "string" || !instructions.trim()) {
    throw new Error('El campo "instructions" debe ser un texto no vacío.');
  }

  return instructions.trim();
}

export function parseFallbackChainInput(
  body: Record<string, unknown>,
): FallbackChainInput {
  const input: FallbackChainInput = {
    type: parseType(body["type"]),
    complexity: parseComplexity(body["complexity"]),
  };

  if ("agent" in body) {
    const agent = parseAgent(body["agent"]);
    if (agent) input.agent = agent;
  }

  if (body["allowedAgents"] !== undefined) {
    input.allowedAgents = parseAllowedAgents(body["allowedAgents"]);
  }

  return input;
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
    "maxConcurrency",
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

  if (body["fastMode"] !== undefined) {
    if (typeof body["fastMode"] !== "boolean") {
      throw new Error('El campo "fastMode" debe ser booleano.');
    }
    overrides.fastMode = body["fastMode"];
  }

  if (body["autoRun"] !== undefined) {
    if (typeof body["autoRun"] !== "boolean") {
      throw new Error('El campo "autoRun" debe ser booleano.');
    }
    overrides.autoRun = body["autoRun"];
  }

  if (body["defaultAllowedAgents"] !== undefined) {
    overrides.defaultAllowedAgents = parseAllowedAgents(
      body["defaultAllowedAgents"],
    );
  }

  if (body["harness"] !== undefined && body["harness"] !== null) {
    const harness = body["harness"] as Record<string, unknown>;
    overrides.harness = {};

    if (harness["enabled"] !== undefined) {
      if (typeof harness["enabled"] !== "boolean") {
        throw new Error('harness.enabled debe ser booleano');
      }
      overrides.harness.enabled = harness["enabled"];
    }

    if (harness["bounds"] !== undefined && harness["bounds"] !== null) {
      const bounds = harness["bounds"] as Record<string, unknown>;
      overrides.harness.bounds = {};

      if (bounds["maxIterations"] !== undefined) {
        const val = bounds["maxIterations"];
        if (typeof val !== "number" || val < 1 || val > 100) {
          throw new Error('maxIterations debe estar entre 1 y 100');
        }
        (overrides.harness.bounds as Partial<typeof overrides.harness.bounds>).maxIterations = val;
      }

      if (bounds["timeoutMs"] !== undefined) {
        const val = bounds["timeoutMs"];
        if (typeof val !== "number" || val < 1000 || val > 3_600_000) {
          throw new Error('timeoutMs debe estar entre 1000 y 3600000');
        }
        (overrides.harness.bounds as Partial<typeof overrides.harness.bounds>).timeoutMs = val;
      }
    }

    if (harness["sandbox"] !== undefined && harness["sandbox"] !== null) {
      const sandbox = harness["sandbox"] as Record<string, unknown>;
      overrides.harness.sandbox = {};

      if (sandbox["allowedCommands"] !== undefined) {
        if (!Array.isArray(sandbox["allowedCommands"])) {
          throw new Error('sandbox.allowedCommands debe ser un array');
        }
        const commands = sandbox["allowedCommands"] as unknown[];
        for (const cmd of commands) {
          if (typeof cmd !== "string") {
            throw new Error('allowedCommands debe contener strings');
          }
          // Rechazar comandos con caracteres peligrosos
          if (cmd.includes("/") || cmd.includes("\\") || cmd.includes("..") || cmd.includes(";")) {
            throw new Error(`comando peligroso: "${cmd}" (sin /, \\, .., ;)`);
          }
        }
        overrides.harness.sandbox.allowedCommands = commands as string[];
      }
    }
  }

  return overrides;
}
