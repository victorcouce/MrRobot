import { CheckIcon } from "../ui/icons";

function Step({
  state,
  children,
}: {
  state: "done" | "active" | "pending";
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        state === "pending"
          ? "flex h-[30px] items-center gap-2.5 text-[13.5px] text-[#9A988F]"
          : "flex h-[30px] items-center gap-2.5 text-[13.5px] text-ink-2"
      }
    >
      {state === "done" && (
        <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[6px] bg-success-soft text-success">
          <CheckIcon size={11} strokeWidth={3} />
        </span>
      )}
      {state === "active" && (
        <span
          aria-hidden="true"
          className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-soft border-t-primary"
        />
      )}
      {state === "pending" && (
        <span
          aria-hidden="true"
          className="inline-block h-3.5 w-3.5 rounded-full border-2 border-line-strong"
        />
      )}
      <span>{children}</span>
    </div>
  );
}

export function PlanningState() {
  return (
    <section aria-label="Planificando" aria-live="polite">
      <div className="h-0.5 overflow-hidden bg-primary-soft">
        <div className="h-full w-2/5 animate-[slide_1.8s_ease-in-out_infinite] bg-primary" />
      </div>
      <div className="flex flex-col px-[18px] py-3.5">
        <Step state="done">Leído el plan actual y la conversación</Step>
        <Step state="active">Generando el plan nuevo</Step>
        <Step state="pending">Validar dependencias y ciclos</Step>
        <Step state="pending">Fusionar con las tareas hechas</Step>
      </div>
    </section>
  );
}
