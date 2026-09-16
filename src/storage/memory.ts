import type { Project } from "../projects/types.js";
import type {
  ProjectEvent,
  Storage,
  StoredAgentRun,
  StoredReview,
  StoredSupervisorRun,
} from "./types.js";

function cloneProject(project: Project): Project {
  return structuredClone(project);
}

export class InMemoryStorage implements Storage {
  private readonly projects = new Map<string, Project>();
  private readonly events: ProjectEvent[] = [];
  private readonly reviews: StoredReview[] = [];
  private readonly supervisorRuns: StoredSupervisorRun[] = [];
  private readonly agentRuns: StoredAgentRun[] = [];

  async init(): Promise<void> {}
  async close(): Promise<void> {}

  async saveProject(project: Project): Promise<void> {
    this.projects.set(project.id, cloneProject(project));
  }

  async getProject(id: string): Promise<Project | undefined> {
    const project = this.projects.get(id);
    return project ? cloneProject(project) : undefined;
  }

  async listProjects(): Promise<Project[]> {
    return [...this.projects.values()].map(cloneProject);
  }

  async appendEvent(event: ProjectEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }

  async listEvents(projectId: string): Promise<ProjectEvent[]> {
    return this.events
      .filter((event) => event.projectId === projectId)
      .map((event) => structuredClone(event));
  }

  async saveReview(review: StoredReview): Promise<void> {
    this.reviews.push(structuredClone(review));
  }

  async saveSupervisorRun(run: StoredSupervisorRun): Promise<void> {
    this.supervisorRuns.push(structuredClone(run));
  }

  async saveAgentRun(run: StoredAgentRun): Promise<void> {
    this.agentRuns.push(structuredClone(run));
  }
}
