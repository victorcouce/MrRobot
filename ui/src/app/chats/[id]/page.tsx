import { ChatView } from "@/components/chats/ChatView";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChatView id={id} />;
}
