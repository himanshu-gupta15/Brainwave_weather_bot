/**
 * Deterministic SOP matching and conflict resolution. No LLM involved.
 *
 * Evaluation uses three-valued logic: a comparison on a missing metric is
 * `null` (unknown). `all` is false if any child is false, else unknown if any
 * child is unknown. `any` is true if any child is true, else unknown if any
 * child is unknown. An SOP only matches when its condition is definitely true,
 * so missing data can never trigger *or* clear a rule.
 */
import { METRICS, type Metrics, isMetricName } from "@/lib/sop/metrics";
import {
  type Comparison,
  type Condition,
  OPERATORS,
  type Operator,
  type PolicySet,
  SCORE_PREFIX,
  SEVERITY_RANK,
  type Severity,
  type Sop,
} from "@/lib/sop/schema";

const OPS: Record<Operator, (v: number, t: number) => boolean> = {
  gt: (v, t) => v > t,
  gte: (v, t) => v >= t,
  lt: (v, t) => v < t,
  lte: (v, t) => v <= t,
  eq: (v, t) => v === t,
};
const OP_SYMBOL: Record<Operator, string> = { gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "=" };

// Additional matched SOPs at or above this severity are surfaced alongside the
// primary one; lower ones are kept in the audit record but not shown.
export const SECONDARY_MIN_SEVERITY = SEVERITY_RANK.moderate;
export const MAX_SECONDARY = 2;

/** A metric whose comparisons held true, i.e. a reason a rule fired. */
export interface Evidence {
  metric: string;
  label: string;
  value: number;
  unit: string;
  condition: string; // e.g. ">= 33 and < 40"
  signals: string[]; // for score metrics: which signals contributed
}

export interface Match {
  sop: Sop;
  evidence: Evidence[];
}

interface ScoreResult {
  value: number | null;
  signals: string[];
}

type Tri = boolean | null;

function operators(c: Comparison): [Operator, number][] {
  return OPERATORS.flatMap((op) => (c[op] === undefined ? [] : [[op, c[op] as number] as [Operator, number]]));
}

function compare(c: Comparison, value: number | null): Tri {
  if (value === null) return null;
  return operators(c).every(([op, t]) => OPS[op](value, t));
}

function describe(metric: string): { label: string; unit: string } {
  if (metric.startsWith(SCORE_PREFIX)) return { label: `Score: ${metric.slice(SCORE_PREFIX.length)}`, unit: "points" };
  return isMetricName(metric) ? METRICS[metric] : { label: metric, unit: "" };
}

export function computeScores(policies: PolicySet, metrics: Metrics): Record<string, ScoreResult> {
  const out: Record<string, ScoreResult> = {};
  for (const [name, score] of Object.entries(policies.scores)) {
    let total = 0;
    let unknown = false;
    const fired: string[] = [];
    for (const signal of score.signals) {
      const hit = compare(signal, isMetricName(signal.metric) ? metrics[signal.metric] : null);
      if (hit === null) unknown = true;
      else if (hit) {
        total += signal.weight;
        fired.push(signal.label);
      }
    }
    out[name] = { value: unknown ? null : total, signals: fired };
  }
  return out;
}

type Leaf = { metric: string; value: number; conditions: [Operator, number][]; signals: string[] };

function evaluate(c: Condition, metrics: Metrics, scores: Record<string, ScoreResult>): [Tri, Leaf[]] {
  if ("metric" in c) {
    let value: number | null;
    let signals: string[] = [];
    if (c.metric.startsWith(SCORE_PREFIX)) {
      const score = scores[c.metric.slice(SCORE_PREFIX.length)];
      value = score?.value ?? null;
      signals = score?.signals ?? [];
    } else {
      value = isMetricName(c.metric) ? metrics[c.metric] : null;
    }
    const result = compare(c, value);
    return result && value !== null ? [true, [{ metric: c.metric, value, conditions: operators(c), signals }]] : [result, []];
  }
  if ("not" in c) {
    const [inner] = evaluate(c.not, metrics, scores);
    return [inner === null ? null : !inner, []];
  }
  const isAll = "all" in c;
  const children = (isAll ? c.all : c.any).map((child) => evaluate(child, metrics, scores));
  const results = children.map(([r]) => r);
  if (isAll) {
    if (results.includes(false)) return [false, []];
    if (results.includes(null)) return [null, []];
    return [true, children.flatMap(([, ev]) => ev)];
  }
  if (results.includes(true)) return [true, children.filter(([r]) => r === true).flatMap(([, ev]) => ev)];
  if (results.includes(null)) return [null, []];
  return [false, []];
}

/** Collapse e.g. `>= 33` and `< 40` on the same metric into one evidence item. */
function toEvidence(leaves: Leaf[]): Evidence[] {
  const merged = new Map<string, Leaf>();
  for (const leaf of leaves) {
    const prev = merged.get(leaf.metric);
    merged.set(leaf.metric, prev ? { ...prev, conditions: [...prev.conditions, ...leaf.conditions] } : leaf);
  }
  return [...merged.values()].map((l) => ({
    metric: l.metric,
    ...describe(l.metric),
    value: l.value,
    condition: l.conditions.map(([op, t]) => `${OP_SYMBOL[op]} ${t}`).join(" and "),
    signals: l.signals,
  }));
}

export function inScope(sop: Sop, activities: string[], groups: string[], otherActivity: string | null): boolean {
  const scope = sop.applies_to;
  const activityOk =
    scope.activities.some((a) => activities.includes(a)) ||
    (scope.any_outdoor && (activities.length > 0 || otherActivity !== null));
  const groupOk = scope.groups.length === 0 || scope.groups.some((g) => groups.includes(g));
  return activityOk && groupOk;
}

export function matchSops(
  policies: PolicySet,
  metrics: Metrics,
  activities: string[],
  groups: string[],
  otherActivity: string | null,
): Match[] {
  const scores = computeScores(policies, metrics);
  const matches: Match[] = [];
  for (const sop of policies.sops) {
    if (!inScope(sop, activities, groups, otherActivity)) continue;
    const [result, leaves] = evaluate(sop.when, metrics, scores);
    if (result === true) matches.push({ sop, evidence: toEvidence(leaves) });
  }
  return rank(matches);
}

/**
 * Conflict resolution: severity (desc), then priority (desc), then id (asc).
 * Fully deterministic: the same weather + question always gives the same
 * primary SOP regardless of file order.
 */
export function rank(matches: Match[]): Match[] {
  return [...matches].sort(
    (a, b) =>
      SEVERITY_RANK[b.sop.severity] - SEVERITY_RANK[a.sop.severity] ||
      b.sop.priority - a.sop.priority ||
      a.sop.id.localeCompare(b.sop.id),
  );
}

/**
 * Primary = top-ranked match. Secondary = up to MAX_SECONDARY further matches of
 * moderate+ severity, so e.g. high UV is not hidden behind strong wind on the
 * same cycling question. Lower-severity extras stay in `matched_sop_ids`.
 */
export function select<T extends { sop: { severity: Severity } }>(ranked: T[]): { primary: T; secondary: T[] } {
  const [primary, ...rest] = ranked;
  const secondary = rest.filter((m) => SEVERITY_RANK[m.sop.severity] >= SECONDARY_MIN_SEVERITY).slice(0, MAX_SECONDARY);
  return { primary, secondary };
}
