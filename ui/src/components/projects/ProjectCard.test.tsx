import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProjectSummary } from "../../lib/types";
import { ProjectCard } from "./ProjectCard";

const project: ProjectSummary = {
  id: "p1",
  name: "Poketo",
  goal: "app",
  status: "running",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  stats: {
    total: 25,
    done: 18,
    running: 3,
    failed: 0,
    blocked: 1,
    ready: 2,
    todo: 1,
    progress: 72,
    activeAgents: 3,
  },
};

describe("ProjectCard", () => {
  it("muestra nombre, estado, progreso y tareas", () => {
    render(<ProjectCard project={project} />);
    expect(screen.getByText("Poketo")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("18 / 25 tasks")).toBeInTheDocument();
    expect(screen.getByText(/3 agents running/)).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
  });
});
