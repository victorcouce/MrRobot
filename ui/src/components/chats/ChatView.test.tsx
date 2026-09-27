import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatDetail } from "@/lib/types";
import { setPendingMessage } from "@/lib/pending-message";
import { ChatView } from "./ChatView";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  getChatById: vi.fn(),
  sendMessageToChat: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => "/chats/c1",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      getChatById: mocks.getChatById,
      sendMessageToChat: mocks.sendMessageToChat,
      listProjects: vi.fn().mockResolvedValue([]),
    },
  };
});

function detail(overrides: Partial<ChatDetail> = {}): ChatDetail {
  return {
    id: "c1",
    title: "Ideas",
    createdAt: "2026-09-27T10:00:00.000Z",
    updatedAt: "2026-09-27T10:00:00.000Z",
    messageCount: 0,
    taskIds: [],
    messages: [],
    ...overrides,
  };
}

describe("ChatView", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.getChatById.mockReset().mockResolvedValue(detail());
    mocks.sendMessageToChat.mockReset().mockResolvedValue(detail());
  });

  it("sin mensajes invita a empezar", async () => {
    render(<ChatView id="c1" />);
    expect(await screen.findByText("¿En qué puedo ayudarte?")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ideas" })).toBeInTheDocument();
  });

  it("envía el mensaje que llega desde el inicio y enseña la espera", async () => {
    let resolve!: (value: ChatDetail) => void;
    mocks.sendMessageToChat.mockReturnValue(new Promise((r) => (resolve = r)));
    setPendingMessage("c1", { content: "hola robot" });

    render(<ChatView id="c1" />);

    await waitFor(() =>
      expect(mocks.sendMessageToChat).toHaveBeenCalledWith("c1", "hola robot", undefined),
    );
    expect(await screen.findByText("hola robot")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "MrRobot está respondiendo" })).toBeInTheDocument();

    mocks.getChatById.mockResolvedValue(
      detail({
        messages: [
          { id: "m1", chatId: "c1", role: "user", content: "hola robot", taskIds: [], createdAt: "2026-09-27T10:00:00.000Z" },
          { id: "m2", chatId: "c1", role: "assistant", content: "¡Hola!", taskIds: [], createdAt: "2026-09-27T10:00:01.000Z" },
        ],
      }),
    );
    resolve(detail());

    expect(await screen.findByText("¡Hola!")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "MrRobot está respondiendo" })).toBeNull();
  });

  it("escribir en el composer envía al chat", async () => {
    render(<ChatView id="c1" />);
    const box = await screen.findByPlaceholderText("Pregunta lo que quieras…");
    fireEvent.change(box, { target: { value: "otra pregunta" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() =>
      expect(mocks.sendMessageToChat).toHaveBeenCalledWith("c1", "otra pregunta", undefined),
    );
  });

  it("si el chat ya está en un proyecto, lleva a su hilo", async () => {
    mocks.getChatById.mockResolvedValue(detail({ projectId: "p1" }));
    render(<ChatView id="c1" />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/projects/p1?chat=c1"));
  });
});
