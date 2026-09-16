import { CreateProjectForm } from "@/components/projects/CreateProjectForm";

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">New Project</h1>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
          Describe qué quieres construir. MrRobot generará un plan ejecutable.
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <CreateProjectForm />
      </div>
    </div>
  );
}
