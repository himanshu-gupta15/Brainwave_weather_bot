/**
 * Deterministic reply builder. Used when no LLM is configured and as the
 * fallback whenever LLM output fails the grounding guard.
 */
import { type AnswerFacts, fmt, type ValueFact } from "@/lib/compose/facts";

function why(evidence: ValueFact[]): string {
  return evidence
    .map((e) => {
      let part = `${e.label.toLowerCase()} ${fmt(e.value, e.unit)} (policy threshold ${e.condition})`;
      if (e.signals?.length) part += `: ${e.signals.join(", ")}`;
      return part;
    })
    .join("; ");
}

export function renderTemplate(f: AnswerFacts): string {
  const p = f.primary;
  const lines = [
    `For ${f.subject} in ${f.locationLabel} (${f.windowLabel}), policy ${p.id} "${p.title}" applies (severity: ${p.severity}).`,
  ];
  const primaryEvidence = f.evidence.filter((e) => e.sopId === p.id);
  if (primaryEvidence.length) lines.push(`Why: ${why(primaryEvidence)}.`);
  lines.push(p.advice);
  for (const s of f.secondary) lines.push(`Also applies, ${s.id} "${s.title}" (severity: ${s.severity}): ${s.advice}`);
  const prev = f.previous;
  if (
    prev &&
    prev.sopId &&
    prev.locationLabel === f.locationLabel &&
    (prev.windowLabel !== f.windowLabel || prev.sopId !== p.id)
  ) {
    lines.push(`(Earlier in this chat, for ${prev.windowLabel}, the applicable policy was ${prev.sopId} "${prev.sopTitle}".)`);
  }
  return lines.join("\n\n");
}
