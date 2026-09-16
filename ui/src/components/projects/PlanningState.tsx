import { Spinner } from "../ui/Button";

export function PlanningState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <Spinner className="h-6 w-6 text-accent" />
      <div>
        <h2 className="text-base font-semibold">Creating project plan…</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          MrRobot está descomponiendo el objetivo en tareas y validando el DAG.
        </p>
      </div>
    </div>
  );
}
