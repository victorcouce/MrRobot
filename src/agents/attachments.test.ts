import assert from "node:assert/strict";
import { test } from "node:test";
import { planProject } from "../planner/planner.js";
import { runTask } from "../tasks/runner.js";
import type { Task } from "../tasks/types.js";
import type { WorkspaceManager } from "../workspace/types.js";
import {
  attachmentRef,
  pickAttachments,
  renderAttachments,
  resolveAttachmentRefs,
} from "./attachments.js";
import type { Attachment } from "./types.js";

function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: "att-1",
    name: "spec.md",
    type: "markdown",
    mimeType: "text/markdown",
    size: 12,
    data: Buffer.from("# Especificación\ncontenido").toString("base64"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

const IMAGE = makeAttachment({
  id: "att-2",
  name: "mockup.png",
  type: "image",
  mimeType: "image/png",
  size: 2048,
  data: "AAAA",
});

function fakeWorkspace(): WorkspaceManager {
  return {
    getRepoRoot: async () => "/fake/repo",
    resolveBaseRef: async () => "fakesha",
    isDirty: async () => false,
    create: async (taskId, attempt, baseRef) => ({
      taskId,
      branchName: `agent/${taskId}-attempt-${attempt}`,
      path: `/fake/repo/.worktrees/${taskId}-attempt-${attempt}`,
      baseRef,
    }),
    commit: async () => "fakecommit",
    remove: async () => {},
    diff: async () => "",
    integrateDependencies: async (_taskId, _commits, baseRef) => ({
      ok: true,
      ref: baseRef,
      branchName: "integration/fake",
    }),
    finalizeProject: async (_projectId, _commits, baseRef) => ({
      ok: true,
      ref: baseRef,
      branchName: "agent/project-fake-final",
    }),
  };
}

test("renderAttachments inyecta el markdown y solo describe las imágenes", () => {
  const block = renderAttachments([makeAttachment(), IMAGE]).join("\n");

  assert.match(block, /\[ADJ-1\] spec\.md \(markdown, text\/markdown/);
  assert.match(block, /# Especificación/);
  assert.match(block, /\[ADJ-2\] mockup\.png \(imagen, image\/png, 2 KB\)/);
  // De la imagen no se vuelca el base64.
  assert.doesNotMatch(block, /AAAA/);
});

test("resolveAttachmentRefs acepta la referencia corta, el nombre y el id", () => {
  const attachments = [makeAttachment(), IMAGE];

  assert.deepEqual(resolveAttachmentRefs(["ADJ-1"], attachments), ["att-1"]);
  assert.deepEqual(resolveAttachmentRefs(["mockup.png"], attachments), [
    "att-2",
  ]);
  assert.deepEqual(resolveAttachmentRefs(["att-2"], attachments), ["att-2"]);
  assert.deepEqual(resolveAttachmentRefs(["ADJ-9", "nada"], attachments), []);
  assert.equal(attachmentRef(0), "ADJ-1");
});

test("pickAttachments filtra por id", () => {
  const attachments = [makeAttachment(), IMAGE];

  assert.deepEqual(pickAttachments(["att-2"], attachments), [IMAGE]);
  assert.deepEqual(pickAttachments(undefined, attachments), []);
});

test("el planner ve los adjuntos y puede referenciarlos por tarea", async () => {
  let prompt = "";

  const plan = await planProject(
    "objetivo",
    { attachments: [makeAttachment(), IMAGE] },
    {
      execute: async (received) => {
        prompt = received;
        return JSON.stringify({
          summary: "plan",
          tasks: [
            {
              id: "TASK-001",
              title: "maquetar",
              description: "según el mockup",
              type: "coding",
              complexity: "low",
              dependsOn: [],
              acceptanceCriteria: [],
              attachments: ["ADJ-2"],
            },
          ],
        });
      },
      maxAttempts: 1,
    },
  );

  assert.match(prompt, /ADJUNTOS/);
  assert.match(prompt, /# Especificación/);
  assert.deepEqual(plan.tasks[0]?.attachments, ["ADJ-2"]);
});

test("el prompt del worker incluye los adjuntos de la tarea", async () => {
  let prompt = "";

  const task: Task = {
    id: "T-1",
    title: "maquetar",
    description: "según el mockup",
    status: "ready",
    type: "coding",
    complexity: "low",
    attachmentIds: ["att-1"],
  };

  const result = await runTask(task, {
    execute: async (received) => {
      prompt = received;
      return "ok";
    },
    workspace: fakeWorkspace(),
    attachments: [makeAttachment()],
  });

  assert.equal(result.status, "done");
  assert.match(prompt, /ADJUNTOS/);
  assert.match(prompt, /spec\.md/);
  assert.match(prompt, /# Especificación/);
});

test("sin adjuntos el prompt del worker no cambia", async () => {
  let prompt = "";

  const task: Task = {
    id: "T-2",
    title: "tarea",
    description: "descripción",
    status: "ready",
    type: "coding",
    complexity: "low",
  };

  await runTask(task, {
    execute: async (received) => {
      prompt = received;
      return "ok";
    },
    workspace: fakeWorkspace(),
  });

  assert.doesNotMatch(prompt, /ADJUNTOS/);
});
