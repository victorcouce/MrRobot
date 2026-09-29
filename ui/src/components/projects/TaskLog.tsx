"use client";

import { useState } from "react";
import type {
  ProjectEvent,
  Task,
  TaskInstructionOutcome,
} from "../../lib/types";
import { describeEvent } from "../../lib/events";
import { clockTime } from "../../lib/format";
import { Button } from "../ui/Button";
import { clsx } from "../../lib/cx";

const INSTRUCTION_EVENTS = new Set([
  "task.instruction",
  "task.instruction_reply",
]);

interface InstructionTurn {
  role: "user" | "assistant";
  content: string;
  questions?: string[];
}

function instructionTurns(events: ProjectEvent[]): InstructionTurn[] {
  return events
    .filter((event) => INSTRUCTION_EVENTS.has(event.type))
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((event) => {
      const payload = event.payload as
        | { instructions?: string; reply?: string; questions?: string[] }
        | undefined;

      if (event.type === "task.instruction") {
        return { role: "user" as const, content: payload?.instructions ?? "" };
      }

      return {
        role: "assistant" as const,
        content: payload?.reply ?? "",
        questions: payload?.questions,
      };
    })
    .filter((turn) => turn.content.length > 0);
}

function InstructionPanel({
  events,
  onSend,
}: {
  events: ProjectEvent[];
  onSend: (instruction: string) => Promise<TaskInstructionOutcome>;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const turns = instructionTurns(events);
  const lastAssistantIndex = turns.reduce(
    (acc, turn, index) => (turn.role === "assistant" ? index : acc),
    -1,
  );

  async function submit(value: string) {
    const text = value.trim();
    if (!text || sending) return;

    setDraft("");
    setSending(true);
    setError(null);

    try {
      await onSend(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {turns.length === 0 && (
        <p className="text-xs text-ink-4">
          Envía una instrucción para reconducir la tarea.
        </p>
      )}

      {turns.map((turn, index) => (
        <div
          key={index}
          className={clsx(
            "flex",
            turn.role === "user" ? "justify-end" : "justify-start",
          )}
        >
          <div
            className={clsx(
              "max-w-[90%] rounded-btn px-3 py-2 text-sm",
              turn.role === "user"
                ? "bg-user-bubble text-ink"
                : "bg-muted text-ink-2",
            )}
          >
            <p className="whitespace-pre-wrap">{turn.content}</p>
            {turn.role === "assistant" &&
              index === lastAssistantIndex &&
              turn.questions &&
              turn.questions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {turn.questions.map((question, questionIndex) => (
                    <button
                      key={questionIndex}
                      type="button"
                      disabled={sending}
                      onClick={() => void submit(question)}
                      className="focus-ring rounded-chip border border-line-strong bg-surface px-2.5 py-1 text-xs text-ink-2 transition-colors hover:border-primary hover:text-ink disabled:opacity-50"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              )}
          </div>
        </div>
      ))}

      {error && (
        <p className="text-xs text-danger-text">{error}</p>
      )}

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(draft);
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Instrucción para la tarea…"
          rows={2}
          className="focus-ring min-w-0 flex-1 resize-none rounded-btn border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary"
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={sending}
          disabled={!draft.trim()}
        >
          Enviar
        </Button>
      </form>
    </div>
  );
}

export function TaskLog({
  task,
  events,
  liveOutput,
  onSendInstructions,
}: {
  task: Task;
  events: ProjectEvent[];
  liveOutput?: string;
  onSendInstructions?: (instruction: string) => Promise<TaskInstructionOutcome>;
}) {
  const logEvents = events
    .filter((event) => !INSTRUCTION_EVENTS.has(event.type))
    .slice()
    .reverse();
  const attempts = task.attempts ?? [];
  const canInstruct =
    (task.status === "failed" || task.status === "blocked") &&
    Boolean(onSendInstructions);

  return (
    <div className="space-y-4">
      {liveOutput && liveOutput.trim().length > 0 && (
        <div>
          <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-4">
            Salida en vivo
          </h5>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-btn bg-muted px-3 py-2 font-mono text-xs leading-relaxed text-ink-2">
            {liveOutput}
          </pre>
        </div>
      )}

      <div>
        <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-4">
          Actividad
        </h5>
        {logEvents.length === 0 && attempts.length === 0 ? (
          <p className="text-xs text-ink-4">Sin actividad registrada todavía.</p>
        ) : (
          <ul className="space-y-1.5">
            {logEvents.map((event) => {
              const descriptor = describeEvent(event);
              return (
                <li
                  key={event.id}
                  className="flex items-baseline gap-2 text-xs"
                >
                  <span className="w-12 shrink-0 font-mono tabular-nums text-ink-4">
                    {clockTime(event.createdAt)}
                  </span>
                  <span className="text-ink-3">{descriptor.title}</span>
                  {descriptor.detail && (
                    <span className="truncate text-ink-4">
                      {descriptor.detail}
                    </span>
                  )}
                </li>
              );
            })}
            {attempts.map((attempt, index) => (
              <li key={`attempt-${index}`} className="flex items-center gap-2 text-xs">
                <span className="w-12 shrink-0 font-mono tabular-nums text-ink-4">
                  {clockTime(attempt.startedAt)}
                </span>
                <span
                  className={clsx(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    attempt.status === "success" ? "bg-success" : "bg-danger",
                  )}
                />
                <span className="text-ink-3">
                  Intento #{attempt.attempt}
                  {attempt.error ? ` · ${attempt.error}` : " · completado"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canInstruct && onSendInstructions && (
        <div className="border-t border-line-soft pt-3">
          <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-4">
            Reconducir
          </h5>
          <InstructionPanel events={events} onSend={onSendInstructions} />
        </div>
      )}
    </div>
  );
}
