import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../lib/types";
import { PreviewPanel } from "./PreviewPanel";

const mocks = vi.hoisted(() => ({
  getPreview: vi.fn(),
  startPreview: vi.fn(),
  stopPreview: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getPreview: mocks.getPreview,
    startPreview: mocks.startPreview,
    stopPreview: mocks.stopPreview,
  },
}));

const project: Project = {
  id: "p1",
  name: "Web",
  goal: "web",
  status: "completed",
  baseRef: "base0",
  tasks: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  resultBranch: "agent/project-p1-final",
  resultCommit: "final-commit",
  stats: {
    total: 1,
    done: 1,
    running: 0,
    failed: 0,
    blocked: 0,
    ready: 0,
    todo: 0,
    progress: 100,
    activeAgents: 0,
  },
  agentsUsed: [],
};

describe("PreviewPanel", () => {
  beforeEach(() => {
    mocks.getPreview.mockReset();
    mocks.startPreview.mockReset();
    mocks.stopPreview.mockReset();
  });

  it("muestra el botón para abrir el preview cuando está detenido", async () => {
    mocks.getPreview.mockResolvedValue({ projectId: "p1", status: "stopped" });
    mocks.startPreview.mockResolvedValue({
      projectId: "p1",
      status: "starting",
    });

    render(<PreviewPanel project={project} />);

    const button = await screen.findByRole("button", {
      name: "Abrir preview",
    });
    await userEvent.click(button);

    await waitFor(() =>
      expect(mocks.startPreview).toHaveBeenCalledWith("p1"),
    );
  });

  it("enlaza a la URL cuando el preview está en marcha", async () => {
    mocks.getPreview.mockResolvedValue({
      projectId: "p1",
      status: "running",
      url: "http://localhost:5173",
    });

    render(<PreviewPanel project={project} />);

    const link = await screen.findByRole("link", { name: "Abrir preview" });
    expect(link).toHaveAttribute("href", "http://localhost:5173");
  });
});
