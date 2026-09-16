import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatDetail, ChatSummary, Project } from "../../lib/types";
import { ChatsPanel } from "./ChatsPanel";

const mocks = vi.hoisted(() => ({
  getChat: vi.fn(),
  sendChatMessage: vi.fn(),
  createChat: vi.fn(),
  deleteChat: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getChat: mocks.getChat,
    sendChatMessage: mocks.sendChatMessage,
    createChat: mocks.createChat,
    deleteChat: mocks.deleteChat,
  },
}));

const now = new Date().toISOString();

const project: Project = {
  id: "p1",
  name: "Web",
  goal: "web",
  status: "ready",
  baseRef: "base0",
  tasks: [
    {
      id: "C1-TASK-001",
      title: "Login",
      description: "hacer login",
      status: "todo",
      type: "coding",
      complexity: "low",
      chatId: "c1",
    },
  ],
  createdAt: now,
  updatedAt: now,
  stats: {
    total: 1,
    done: 0,
    running: 0,
    failed: 0,
    blocked: 0,
    ready: 0,
    todo: 1,
    progress: 0,
    activeAgents: 0,
  },
  agentsUsed: [],
};

const chat: ChatSummary = {
  id: "c1",
  projectId: "p1",
  title: "Iterar login",
  createdAt: now,
  updatedAt: now,
  messageCount: 2,
  taskIds: ["C1-TASK-001"],
};

const detail: ChatDetail = {
  ...chat,
  messages: [
    {
      id: "m1",
      chatId: "c1",
      projectId: "p1",
      role: "user",
      content: "añade login",
      taskIds: [],
      createdAt: now,
    },
    {
      id: "m2",
      chatId: "c1",
      projectId: "p1",
      role: "assistant",
      content: "he añadido la tarea de login",
      taskIds: ["C1-TASK-001"],
      createdAt: now,
    },
  ],
};

describe("ChatsPanel", () => {
  beforeEach(() => {
    mocks.getChat.mockReset();
    mocks.sendChatMessage.mockReset();
    mocks.createChat.mockReset();
    mocks.deleteChat.mockReset();
  });

  it("carga el chat seleccionado y muestra sus mensajes y tareas", async () => {
    mocks.getChat.mockResolvedValue(detail);

    render(<ChatsPanel project={project} chats={[chat]} onRefresh={vi.fn()} />);

    expect(await screen.findByText("añade login")).toBeInTheDocument();
    expect(
      screen.getByText("he añadido la tarea de login"),
    ).toBeInTheDocument();
    expect(screen.getByText("Tareas de este chat")).toBeInTheDocument();
    await waitFor(() => expect(mocks.getChat).toHaveBeenCalledWith("p1", "c1"));
  });

  it("envía un mensaje y refresca el proyecto", async () => {
    mocks.getChat.mockResolvedValue(detail);
    mocks.sendChatMessage.mockResolvedValue({
      ...detail,
      messages: [
        ...detail.messages,
        {
          id: "m3",
          chatId: "c1",
          projectId: "p1",
          role: "user",
          content: "y logout",
          taskIds: [],
          createdAt: now,
        },
      ],
    });

    const onRefresh = vi.fn();
    render(<ChatsPanel project={project} chats={[chat]} onRefresh={onRefresh} />);

    const textarea = await screen.findByLabelText("Mensaje");
    await userEvent.type(textarea, "y logout");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(mocks.sendChatMessage).toHaveBeenCalledWith("p1", "c1", "y logout"),
    );
    expect(onRefresh).toHaveBeenCalled();
    expect(await screen.findByText("y logout")).toBeInTheDocument();
  });

  it("crea un chat nuevo cuando no hay ninguno", async () => {
    mocks.createChat.mockResolvedValue({
      id: "c2",
      projectId: "p1",
      title: "Chat 1",
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      taskIds: [],
      messages: [],
    });

    const onRefresh = vi.fn();
    render(<ChatsPanel project={project} chats={[]} onRefresh={onRefresh} />);

    expect(screen.getByText(/Aún no hay chats/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "+ New" }));

    await waitFor(() => expect(mocks.createChat).toHaveBeenCalledWith("p1", {}));
    expect(onRefresh).toHaveBeenCalled();
  });
});
