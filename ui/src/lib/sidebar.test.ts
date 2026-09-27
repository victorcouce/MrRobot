import { describe, expect, it } from "vitest";
import {
  chatHref,
  groupChatsByProject,
  looseChats,
  orderProjects,
  projectInSpace,
  projectLabel,
  recencyOf,
} from "./sidebar";
import type { ChatSummary, ProjectSummary, Space } from "./types";

const NOW = Date.parse("2026-09-27T12:00:00");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function iso(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

function project(id: string, updatedAt: string, extra: Partial<ProjectSummary> = {}) {
  return {
    id,
    name: "Web",
    goal: `Objetivo ${id}`,
    status: "ready",
    createdAt: updatedAt,
    updatedAt,
    stats: {} as ProjectSummary["stats"],
    ...extra,
  } as ProjectSummary;
}

function chat(
  id: string,
  projectId: string | undefined,
  updatedAt: string,
  extra: Partial<ChatSummary> = {},
): ChatSummary {
  return {
    id,
    ...(projectId ? { projectId } : {}),
    title: "Chat",
    createdAt: updatedAt,
    updatedAt,
    messageCount: 1,
    taskIds: [],
    ...extra,
  };
}

describe("recencyOf", () => {
  it("agrupa como el buscador de ChatGPT", () => {
    expect(recencyOf(iso(HOUR), NOW)).toBe("today");
    expect(recencyOf(iso(DAY), NOW)).toBe("yesterday");
    expect(recencyOf(iso(3 * DAY), NOW)).toBe("week");
    expect(recencyOf(iso(20 * DAY), NOW)).toBe("month");
    expect(recencyOf(iso(90 * DAY), NOW)).toBe("older");
  });
});

describe("orderProjects", () => {
  it("pone los fijados arriba y luego por última actividad, contando los chats", () => {
    const old = project("old", iso(10 * DAY));
    const fresh = project("fresh", iso(2 * HOUR));
    const pinned = project("pinned", iso(30 * DAY), { pinned: true });
    const byChat = groupChatsByProject([chat("c1", "old", iso(HOUR))]);

    expect(orderProjects([fresh, old, pinned], byChat).map((p) => p.id)).toEqual([
      "pinned",
      "old",
      "fresh",
    ]);
  });

  it("deja fuera los archivados", () => {
    const archived = project("a", iso(HOUR), { archivedAt: iso(HOUR) });
    expect(orderProjects([archived, project("b", iso(DAY))], new Map())).toHaveLength(1);
  });
});

describe("groupChatsByProject", () => {
  it("agrupa por proyecto, fijados primero, e ignora los chats sueltos", () => {
    const map = groupChatsByProject([
      chat("a", "p1", iso(3 * HOUR)),
      chat("b", "p1", iso(HOUR)),
      chat("pin", "p1", iso(9 * DAY), { pinned: true }),
      chat("loose", undefined, iso(HOUR)),
    ]);
    expect(map.get("p1")?.map((c) => c.id)).toEqual(["pin", "b", "a"]);
    expect([...map.keys()]).toEqual(["p1"]);
  });
});

describe("looseChats", () => {
  it("solo los chats sin proyecto y sin archivar, fijados primero", () => {
    const list = looseChats([
      chat("in-project", "p1", iso(HOUR)),
      chat("new", undefined, iso(HOUR)),
      chat("old-pinned", undefined, iso(9 * DAY), { pinned: true }),
      chat("archived", undefined, iso(HOUR), { archivedAt: iso(HOUR) }),
    ]);
    expect(list.map((c) => c.id)).toEqual(["old-pinned", "new"]);
  });
});

describe("chatHref", () => {
  it("los de proyecto van a su hilo; los sueltos, a /chats", () => {
    expect(chatHref({ id: "c1", projectId: "p1" })).toBe("/projects/p1?chat=c1");
    expect(chatHref({ id: "c2" })).toBe("/chats/c2");
  });
});

describe("projectLabel", () => {
  it("prefiere el nombre que puso el usuario, luego el objetivo", () => {
    expect(projectLabel({ name: "Web", goal: "Landing", title: "Mi web" })).toBe("Mi web");
    expect(projectLabel({ name: "Web", goal: "Landing" })).toBe("Landing");
    expect(projectLabel({ name: "Web", goal: "  " })).toBe("Web");
  });
});

describe("projectInSpace", () => {
  it("usa la carpeta del espacio; sin espacio entra todo", () => {
    const space = { path: "/repos/tienda" } as Space;
    expect(projectInSpace(project("p", iso(0), { repoPath: "/repos/tienda" }), space)).toBe(true);
    expect(projectInSpace(project("p", iso(0), { repoPath: "/repos/blog" }), space)).toBe(false);
    expect(projectInSpace(project("p", iso(0)), null)).toBe(true);
  });
});
