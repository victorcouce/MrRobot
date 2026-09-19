import type { SupervisorRun } from "../../lib/types";
import { Block } from "../ui/Block";
import { RefreshIcon, AlertIcon } from "../ui/icons";
import { clockTime } from "../../lib/format";

const ACTION_LABELS: Record<string, string> = {
  replan: "El supervisor replanificó",
  fail: "Decisión: fallar el proyecto",
  pause: "El supervisor pausó el proyecto",
};

export function SupervisorRunBlock({
  run,
  round,
}: {
  run: SupervisorRun;
  round: number;
}) {
  const failed = run.action === "fail";
  const replan = run.action === "replan";

  return (
    <Block
      className={
        failed
          ? "border-danger-soft bg-[#FFF8F7] shadow-none"
          : "bg-subtle shadow-none"
      }
    >
      <div className="flex items-start gap-3 px-[18px] py-3.5">
        <span
          className={
            failed
              ? "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-danger-soft text-danger"
              : "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-warning-soft text-warning-text"
          }
        >
          {failed ? <AlertIcon /> : <RefreshIcon />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-4 text-[13.5px]">
            <span className={failed ? "font-semibold text-danger-text" : ""}>
              {failed ? (
                ACTION_LABELS.fail
              ) : (
                <>
                  <span className="font-semibold">
                    {ACTION_LABELS[run.action] ?? run.action}
                  </span>
                  {replan ? ` · ronda ${round}` : ""}
                </>
              )}
            </span>
            <span className="shrink-0 font-mono text-[11.5px] text-ink-4">
              {clockTime(run.createdAt)}
            </span>
          </div>
          <span className="text-[13.5px] leading-relaxed text-ink-2">
            {run.reason}
          </span>
          {run.instructions && (
            <span className="text-[12.5px] text-ink-4">
              {run.instructions}
            </span>
          )}
        </div>
      </div>
    </Block>
  );
}

