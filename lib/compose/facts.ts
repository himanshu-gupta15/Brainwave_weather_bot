/**
 * The complete, verified fact set a reply may be built from.
 *
 * Both composers (template and LLM) receive only this object, never the raw
 * user message, so text typed by the user cannot reach the composing model.
 */

export interface PolicyFact {
  id: string;
  title: string;
  severity: string;
  advice: string;
}

export interface ValueFact {
  label: string;
  value: number;
  unit: string;
  condition?: string; // e.g. ">= 50" when this value triggered a rule
  sopId?: string;
  signals?: string[];
}

export interface PreviousDecision {
  windowLabel: string;
  sopId: string | null;
  sopTitle: string | null;
  locationLabel: string | null;
}

export interface AnswerFacts {
  subject: string; // e.g. "cycling with children"
  locationLabel: string;
  windowLabel: string;
  primary: PolicyFact;
  secondary: PolicyFact[];
  evidence: ValueFact[]; // the comparisons that made the rules fire
  weather: ValueFact[]; // all window metrics, for context
  previous: PreviousDecision | null;
}

export function fmt(value: number, unit: string): string {
  const text = String(value);
  if (unit === "" || unit === "points") return text;
  return unit === "%" || unit === "°C" ? `${text}${unit}` : `${text} ${unit}`;
}
