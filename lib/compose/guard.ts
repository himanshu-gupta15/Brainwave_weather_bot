/**
 * Grounding guard for LLM-composed replies.
 *
 * This is where "the model composes language but does not decide facts" is
 * enforced in code. A reply is rejected if it:
 *  - contains any number that isn't in the verified fact set (weather values
 *    from the API, policy thresholds, numbers inside SOP advice/title text or
 *    metric labels such as "24 h"), allowing only rounding of a real value to
 *    0 or 1 decimal places;
 *  - cites an SOP id other than the selected ones (or the previous turn's);
 *  - fails to cite the primary SOP id.
 */
import type { AnswerFacts } from "@/lib/compose/facts";

const SOP_ID_RE = /\bSOP-\d+\b/gi;
const NUMBER_RE = /(?<![\w.])\d+(?:\.\d+)?/g;
const THRESHOLD_RE = /-?\d+(?:\.\d+)?/g;

const norm = (x: number) => String(Number(x.toPrecision(12)));
const numbersIn = (text: string, re: RegExp) => [...text.matchAll(re)].map((m) => Number(m[0]));

export function allowedNumbers(f: AnswerFacts): Set<string> {
  const values: number[] = [];
  for (const v of [...f.evidence, ...f.weather]) {
    values.push(v.value, ...numbersIn(v.label, NUMBER_RE));
    if (v.condition) values.push(...numbersIn(v.condition, THRESHOLD_RE));
  }
  for (const p of [f.primary, ...f.secondary]) values.push(...numbersIn(`${p.title} ${p.advice}`, NUMBER_RE));
  const allowed = new Set<string>();
  for (const v of values) {
    allowed.add(norm(v));
    allowed.add(norm(Math.round(v)));
    allowed.add(norm(Math.round(v * 10) / 10));
  }
  return allowed;
}

export function checkGrounding(text: string, f: AnswerFacts): string[] {
  const problems: string[] = [];
  const permittedIds = [f.primary.id, ...f.secondary.map((s) => s.id), ...(f.previous?.sopId ? [f.previous.sopId] : [])];
  const permitted = new Set(permittedIds.map((id) => id.toUpperCase()));
  const cited = new Set([...text.matchAll(SOP_ID_RE)].map((m) => m[0].toUpperCase()));
  const unknown = [...cited].filter((id) => !permitted.has(id));
  if (unknown.length) problems.push(`cites SOP ids not selected by the engine: ${unknown.join(", ")}`);
  if (!cited.has(f.primary.id.toUpperCase())) problems.push(`does not cite the primary policy ${f.primary.id}`);

  const allowed = allowedNumbers(f);
  for (const n of numbersIn(text.replace(SOP_ID_RE, " "), NUMBER_RE)) {
    if (!allowed.has(norm(n))) problems.push(`number ${n} is not in the verified facts`);
  }
  return problems;
}
