import type { Project } from "../projects/types.js";
import type { Chat, ChatMessage } from "../chats/types.js";
import type { Space } from "../spaces/types.js";
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
  private readonly chats = new Map<string, Chat>();
  private readonly chatMessages: ChatMessage[] = [];
  private readonly spaces = new Map<string, Space>();

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

  async deleteProject(id: string): Promise<void> {
    this.projects.delete(id);

    const removeFor = <T extends { projectId: string }>(items: T[]): void => {
      for (let index = items.length - 1; index >= 0; index -= 1) {
        if (items[index]?.projectId === id) {
          items.splice(index, 1);
        }
      }
    };

    removeFor(this.events);
    removeFor(this.reviews);
    removeFor(this.supervisorRuns);
    removeFor(this.agentRuns);

    for (const [chatId, chat] of this.chats) {
      if (chat.projectId === id) {
        this.chats.delete(chatId);
      }
    }

    for (let index = this.chatMessages.length - 1; index >= 0; index -= 1) {
      if (this.chatMessages[index]?.projectId === id) {
        this.chatMessages.splice(index, 1);
      }
    }
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

  async listReviews(projectId: string): Promise<StoredReview[]> {
    return this.reviews
      .filter((review) => review.projectId === projectId)
      .map((review) => structuredClone(review));
  }

  async listSupervisorRuns(projectId: string): Promise<StoredSupervisorRun[]> {
    return this.supervisorRuns
      .filter((run) => run.projectId === projectId)
      .map((run) => structuredClone(run));
  }

  async saveChat(chat: Chat): Promise<void> {
    this.chats.set(chat.id, structuredClone(chat));
  }

  async getChat(id: string): Promise<Chat | undefined> {
    const chat = this.chats.get(id);
    return chat ? structuredClone(chat) : undefined;
  }

  async listChats(projectId: string): Promise<Chat[]> {
    return [...this.chats.values()]
      .filter((chat) => chat.projectId === projectId)
      .map((chat) => structuredClone(chat));
  }

  async listAllChats(): Promise<Chat[]> {
    return [...this.chats.values()].map((chat) => structuredClone(chat));
  }

  async deleteChat(id: string): Promise<void> {
    this.chats.delete(id);

    for (let index = this.chatMessages.length - 1; index >= 0; index -= 1) {
      if (this.chatMessages[index]?.chatId === id) {
        this.chatMessages.splice(index, 1);
      }
    }
  }

  async appendChatMessage(message: ChatMessage): Promise<void> {
    this.chatMessages.push(structuredClone(message));
  }

  async listChatMessages(chatId: string): Promise<ChatMessage[]> {
    return this.chatMessages
      .filter((message) => message.chatId === chatId)
      .map((message) => structuredClone(message));
  }

  async saveSpace(space: Space): Promise<void> {
    this.spaces.set(space.id, structuredClone(space));
  }

  async listSpaces(): Promise<Space[]> {
    return [...this.spaces.values()].map((space) => structuredClone(space));
  }
}
