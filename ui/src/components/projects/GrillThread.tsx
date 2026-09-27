"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { clsx } from "../../lib/cx";
import type {
  Attachment,
  GrillMessage,
  GrillQuestion,
  GrillResponse,
  Project,
  ProjectBrief,
} from "../../lib/types";
import { Block, BlockContent, BlockFooter, BlockHeader } from "../ui/Block";
import { Button } from "../ui/Button";
import { RobotAvatar } from "../ui/Chip";
import { PaperclipIcon } from "../ui/icons";
import { PlanningState } from "./PlanningState";

type Phase = "loading" | "asking" | "done" | "error";
type FailedAction = "load" | "submit" | "plan";

interface CompletedRound {
  message: string;
  answer: string;
}

function formatAnswers(
  questions: GrillQuestion[],
  answers: Record<string, string>,
): string {
  return questions
    .map((question) => `${question.id}: ${(answers[question.id] ?? "").trim()}`)
    .join("\n");
}

function displayOptions(question: GrillQuestion): string[] {
  const options = question.options ?? [];
  const recommended = question.recommendation;

  if (options.includes(recommended)) {
    return [recommended, ...options.filter((option) => option !== recommended)];
  }

  return options.length > 0 ? [recommended, ...options] : options;
}

function UserBubble({
  children,
  attachments,
}: {
  children: React.ReactNode;
  attachments?: Attachment[] | undefined;
}) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[560px] rounded-[18px_18px_4px_18px] bg-user-bubble px-4 py-[11px]">
        <p className="whitespace-pre-wrap text-[15px] leading-normal text-ink">
          {children}
        </p>
        {attachments && attachments.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-[8px] border border-line bg-surface px-2 py-1 text-[12.5px] text-ink-2"
              >
                <PaperclipIcon />
                <span className="truncate">{attachment.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Who({ meta }: { meta?: string }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-ink-4">
      <RobotAvatar />
      <span className="font-medium text-ink">Planner</span>
      {meta && <span>{meta}</span>}
    </div>
  );
}

/**
 * Entrevista de afinado dentro del hilo: en vez de un modal, las preguntas
 * aparecen como bloques del chat. Al llegar al entendimiento compartido se
 * genera el plan del proyecto ya creado.
 */
export function GrillThread({
  project,
  onGeneratePlan,
}: {
  project: Project;
  onGeneratePlan: (instructions: string, brief: ProjectBrief) => Promise<void>;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [rounds, setRounds] = useState<CompletedRound[]>([]);
  const [questions, setQuestions] = useState<GrillQuestion[]>([]);
  const [roundMessage, setRoundMessage] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [usingCustom, setUsingCustom] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [failedAction, setFailedAction] = useState<FailedAction>("load");
  const [generating, setGenerating] = useState(false);

  const goal = project.goal;
  const projectId = project.id;
  const repoPath = project.repoPath;
  const allowedAgents = project.defaultAllowedAgents;
  const planReady = project.tasks.length > 0;
  const isPlanning = generating || project.status === "planning";
  const initialLoaded = useRef(false);

  const applyResponse = useCallback((response: GrillResponse) => {
    if (response.status === "done") {
      setSummary(response.summary);
      setPhase("done");
      return;
    }

    setQuestions(response.questions);
    setRoundMessage(response.message);
    setAnswers(
      Object.fromEntries(
        response.questions.map((question) => [
          question.id,
          question.recommendation,
        ]),
      ),
    );
    setCustomAnswers({});
    setUsingCustom({});
    setPhase("asking");
  }, []);

  const loadInitial = useCallback(async () => {
    setPhase("loading");
    setError(null);
    setFailedAction("load");

    try {
      const response = await api.grill({
        goal,
        projectId,
        messages: [],
        ...(repoPath ? { repoPath } : {}),
        ...(allowedAgents && allowedAgents.length > 0 ? { allowedAgents } : {}),
      });
      applyResponse(response);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al iniciar la entrevista",
      );
      setPhase("error");
    }
  }, [goal, projectId, repoPath, allowedAgents, applyResponse]);

  useEffect(() => {
    // Solo la primera carga: el proyecto se refresca con cada evento y no debe
    // reiniciar la entrevista ya en curso.
    if (initialLoaded.current) return;
    initialLoaded.current = true;
    void loadInitial();
  }, [loadInitial]);

  const submitAnswers = useCallback(async () => {
    const answer = formatAnswers(questions, answers);
    const nextRounds = [
      ...rounds,
      { message: roundMessage, answer },
    ];
    const history: GrillMessage[] = nextRounds.flatMap((round) => [
      { role: "assistant", content: round.message },
      { role: "user", content: round.answer },
    ]);

    setRounds(nextRounds);
    setPhase("loading");
    setError(null);
    setFailedAction("submit");

    try {
      const response = await api.grill({
        goal,
        projectId,
        messages: history,
        ...(repoPath ? { repoPath } : {}),
        ...(allowedAgents && allowedAgents.length > 0 ? { allowedAgents } : {}),
      });
      applyResponse(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en la entrevista");
      setPhase("error");
    }
  }, [rounds, roundMessage, questions, answers, goal, projectId, repoPath, allowedAgents, applyResponse]);

  const goBackToQuestions = useCallback(() => {
    setRounds((previous) => previous.slice(0, -1));
    setError(null);
    setPhase("asking");
  }, []);

  const handleGeneratePlan = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setFailedAction("plan");

    try {
      const instructions = summary.trim()
        ? `Requisitos acordados:\n${summary.trim()}`
        : "";
      await onGeneratePlan(instructions, { rounds, summary: summary.trim() });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al generar el plan",
      );
      setGenerating(false);
    }
  }, [summary, rounds, onGeneratePlan]);

  const retry = useCallback(() => {
    setError(null);

    if (failedAction === "submit") {
      void submitAnswers();
      return;
    }

    if (failedAction === "plan") {
      void handleGeneratePlan();
      return;
    }

    void loadInitial();
  }, [failedAction, submitAnswers, handleGeneratePlan, loadInitial]);

  return (
    <div className="flex w-full flex-col gap-7">
      <UserBubble attachments={project.attachments}>{goal}</UserBubble>

      {rounds.map((round, index) => (
        <div key={index} className="flex flex-col gap-3">
          <Who meta="afinando el objetivo" />
          <p className="max-w-[820px] whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
            {round.message}
          </p>
          <UserBubble>{round.answer}</UserBubble>
        </div>
      ))}

      {phase === "loading" && (
        <div className="flex items-center gap-2 py-2 text-sm text-ink-3">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Pensando las preguntas…
        </div>
      )}

      {phase === "asking" && questions.length > 0 && (
        <Block>
          <BlockHeader
            title="Afinemos el objetivo"
            meta={`Ronda ${rounds.length + 1} · ${questions.length} ${
              questions.length === 1 ? "pregunta" : "preguntas"
            }`}
          />
          <BlockContent className="flex flex-col gap-5">
            <p className="text-sm leading-relaxed text-ink-3">
              Antes de planificar, te hago algunas preguntas. Acepta mis
              recomendaciones o responde a tu manera.
            </p>

            {questions.map((question) => {
              const hasOptions = Boolean(
                question.options && question.options.length > 0,
              );
              const customSelected =
                usingCustom[question.id] ?? !hasOptions;

              return (
                <div key={question.id} className="flex flex-col gap-1.5">
                  <h3 className="text-sm font-medium text-ink-2">
                    {question.id} — {question.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-ink-3">
                    {question.body}
                  </p>

                  {hasOptions && (
                    <div
                      role="radiogroup"
                      aria-label={question.title}
                      className="mt-2 flex flex-col gap-2"
                    >
                      {displayOptions(question).map((option) => {
                        const isRecommended =
                          option === question.recommendation;
                        const selected =
                          !customSelected && answers[question.id] === option;

                        return (
                          <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => {
                              setUsingCustom((previous) => ({
                                ...previous,
                                [question.id]: false,
                              }));
                              setAnswers((previous) => ({
                                ...previous,
                                [question.id]: option,
                              }));
                            }}
                            className={clsx(
                              "focus-ring flex items-start gap-2.5 rounded-block border px-3 py-2 text-left text-sm leading-relaxed transition-colors",
                              selected
                                ? "border-primary bg-primary-soft text-ink"
                                : "border-line-strong bg-surface text-ink-2 hover:bg-muted",
                            )}
                          >
                            <span
                              className={clsx(
                                "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                                selected
                                  ? "border-primary bg-primary text-ink"
                                  : "border-line-strong",
                              )}
                            >
                              {selected && (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" aria-hidden>
                                  <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                            <span>
                              {option}
                              {isRecommended && (
                                <span className="text-ink-4"> (recomendada)</span>
                              )}
                            </span>
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        role="radio"
                        aria-checked={customSelected}
                        onClick={() => {
                          setUsingCustom((previous) => ({
                            ...previous,
                            [question.id]: true,
                          }));
                          setAnswers((previous) => ({
                            ...previous,
                            [question.id]: customAnswers[question.id] ?? "",
                          }));
                        }}
                        className={clsx(
                          "focus-ring flex items-start gap-2.5 rounded-block border px-3 py-2 text-left text-sm leading-relaxed transition-colors",
                          customSelected
                            ? "border-primary bg-primary-soft text-ink"
                            : "border-line-strong bg-surface text-ink-2 hover:bg-muted",
                        )}
                      >
                        <span
                          className={clsx(
                            "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                            customSelected
                              ? "border-primary bg-primary text-ink"
                              : "border-line-strong",
                          )}
                        >
                          {customSelected && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" aria-hidden>
                              <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        <span>Otra respuesta</span>
                      </button>
                    </div>
                  )}

                  {customSelected && (
                    <textarea
                      value={
                        hasOptions
                          ? (customAnswers[question.id] ?? "")
                          : (answers[question.id] ?? "")
                      }
                      onChange={(event) => {
                        const value = event.target.value;
                        if (hasOptions) {
                          setCustomAnswers((previous) => ({
                            ...previous,
                            [question.id]: value,
                          }));
                        }
                        setAnswers((previous) => ({
                          ...previous,
                          [question.id]: value,
                        }));
                      }}
                      autoFocus
                      rows={3}
                      placeholder="Escribe tu respuesta"
                      className="resize-none rounded-btn border border-line-strong bg-surface px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-ink-4 focus:border-primary focus:ring-1 focus:ring-primary-soft"
                    />
                  )}
                </div>
              );
            })}
          </BlockContent>
          <BlockFooter>
            <span className="text-[12.5px] text-ink-4">
              Puedes responder a tu manera: mis recomendaciones son un punto de
              partida.
            </span>
            <Button variant="primary" size="sm" onClick={() => void submitAnswers()}>
              Continuar
            </Button>
          </BlockFooter>
        </Block>
      )}

      {phase === "done" && (
        <Block>
          <BlockHeader
            title="Entendimiento compartido"
            meta={
              planReady
                ? "Plan generado"
                : "Revísalo o vuelve a las preguntas para ajustar"
            }
          />
          <SummaryView text={summary} />
          {isPlanning && !planReady ? (
            <PlanningState />
          ) : planReady ? null : (
            <BlockFooter>
              <Button variant="ghost" size="sm" onClick={goBackToQuestions}>
                Volver a las preguntas
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={generating}
                onClick={() => void handleGeneratePlan()}
              >
                Generar el plan
              </Button>
            </BlockFooter>
          )}
        </Block>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-block border border-danger bg-danger-soft px-3 py-2 text-sm text-danger-text"
        >
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={retry}>
            Reintentar
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * La entrevista ya cerrada, de solo lectura: el hilo la reconstruye desde lo
 * guardado en el proyecto para no perder la conversación inicial al recargar
 * o cuando el proyecto ya está planificado o terminado.
 */
export function GrillTranscript({
  goal,
  brief,
  attachments,
}: {
  goal: string;
  brief?: ProjectBrief | undefined;
  attachments?: Attachment[] | undefined;
}) {
  return (
    <div className="flex w-full flex-col gap-7">
      <UserBubble attachments={attachments}>{goal}</UserBubble>

      {brief?.rounds.map((round, index) => (
        <div key={index} className="flex flex-col gap-3">
          <Who meta="afinando el objetivo" />
          <p className="max-w-[820px] whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
            {round.message}
          </p>
          <UserBubble>{round.answer}</UserBubble>
        </div>
      ))}

      {brief?.summary && (
        <Block>
          <BlockHeader title="Entendimiento compartido" />
          <SummaryView text={brief.summary} />
        </Block>
      )}
    </div>
  );
}

function SummaryView({ text }: { text: string }) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return (
    <BlockContent className="space-y-2">
      {lines.map((line, index) => {
        const bullet = /^([-*•]|\d+[.)])\s+/.test(line);
        const heading = !bullet && line.length <= 72 && line.endsWith(":");

        if (bullet) {
          return (
            <div key={index} className="flex gap-2.5">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span className="text-sm leading-relaxed text-ink-2">
                {line.replace(/^([-*•]|\d+[.)])\s+/, "")}
              </span>
            </div>
          );
        }

        if (heading) {
          return (
            <p
              key={index}
              className="pt-1 text-xs font-semibold tracking-wide text-ink-3 uppercase"
            >
              {line.replace(/:\s*$/, "")}
            </p>
          );
        }

        return (
          <p key={index} className="text-sm leading-relaxed text-ink-2">
            {line}
          </p>
        );
      })}
    </BlockContent>
  );
}
