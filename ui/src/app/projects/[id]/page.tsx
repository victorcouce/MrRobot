import { ProjectWorkspace } from "@/components/projects/ProjectWorkspace";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ chat?: string }>;
}) {
  const { id } = await params;
  const { chat } = await searchParams;
  return <ProjectWorkspace id={id} initialChatId={chat} />;
}
