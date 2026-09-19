export interface GrillQuestion {
  id: string;
  title: string;
  body: string;
  /** Alternativas discretas que el usuario puede elegir con un clic. */
  options?: string[] | undefined;
  recommendation: string;
}

export type GrillOutcome =
  | { status: "questions"; questions: GrillQuestion[]; message: string }
  | { status: "done"; summary: string };

export interface GrillMessage {
  role: "user" | "assistant";
  content: string;
}
