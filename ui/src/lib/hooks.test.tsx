import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ProjectSummary } from "./types";

vi.mock("./api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  api: {
    listProjects: vi.fn(),
    listAllChats: vi.fn(),
  },
}));

vi.mock("./sse", () => ({
  subscribeProject: vi.fn(() => () => {}),
}));

import { api } from "./api";
import { useProjects } from "./hooks";

function project(id: string, name: string): ProjectSummary {
  return {
    id,
    name,
    goal: name,
    status: "draft",
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
    stats: {
      total: 0,
      done: 0,
      running: 0,
      failed: 0,
      blocked: 0,
      ready: 0,
      todo: 0,
      progress: 0,
      activeAgents: 0,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("useProjects", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("ignora una respuesta antigua que llega después de una más reciente", async () => {
    const slow = deferred<ProjectSummary[]>();
    const fast = deferred<ProjectSummary[]>();
    const listProjects = api.listProjects as Mock;
    listProjects
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);

    const { result } = renderHook(() => useProjects());

    await waitFor(() => expect(listProjects).toHaveBeenCalledTimes(1));

    act(() => {
      void result.current.refresh();
    });
    await waitFor(() => expect(listProjects).toHaveBeenCalledTimes(2));

    // La petición nueva responde primero: ya no está el proyecto borrado.
    await act(async () => {
      fast.resolve([]);
    });
    expect(result.current.projects).toEqual([]);

    // La petición antigua llega tarde y todavía incluye el proyecto.
    await act(async () => {
      slow.resolve([project("p1", "borrado")]);
    });

    expect(result.current.projects).toEqual([]);
  });
});
