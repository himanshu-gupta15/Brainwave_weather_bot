/**
 * Schema for data/taxonomy.yaml and data/sops.yaml, plus a hot-reloading store.
 *
 * The store re-reads the YAML whenever either file's mtime changes, so a new
 * SOP takes effect on the next chat message with no restart and no code
 * change. Invalid policy files throw `PolicyError`; the API then refuses to
 * advise (fail closed) instead of running with a partial rule set.
 */
import fs from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { isMetricName, METRICS } from "@/lib/sop/metrics";

export const SEVERITIES = ["low", "moderate", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_RANK: Record<Severity, number> = { low: 1, moderate: 2, high: 3, critical: 4 };
export const OPERATORS = ["gt", "gte", "lt", "lte", "eq"] as const;
export type Operator = (typeof OPERATORS)[number];
export const SCORE_PREFIX = "score.";

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

export type Comparison = { metric: string } & Partial<Record<Operator, number>>;
export type Condition = { all: Condition[] } | { any: Condition[] } | { not: Condition } | Comparison;

const ComparisonShape = {
  metric: z.string(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  eq: z.number().optional(),
};
const hasOperator = (c: Partial<Record<Operator, number>>) => OPERATORS.some((op) => c[op] !== undefined);

const ComparisonSchema = z
  .strictObject(ComparisonShape)
  .refine(hasOperator, { message: `a comparison needs one of ${OPERATORS.join(", ")}` });

const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(ConditionSchema).min(1) }),
    z.strictObject({ any: z.array(ConditionSchema).min(1) }),
    z.strictObject({ not: ConditionSchema }),
    ComparisonSchema,
  ]),
);

const ScoreSignalSchema = z
  .strictObject({ ...ComparisonShape, weight: z.number().default(1), label: z.string() })
  .refine(hasOperator, { message: "a score signal needs an operator" });

const ScoreDefSchema = z.strictObject({
  description: z.string(),
  signals: z.array(ScoreSignalSchema).min(1),
});

const AppliesToSchema = z
  .strictObject({
    activities: z.array(z.string()).default([]),
    any_outdoor: z.boolean().default(false),
    groups: z.array(z.string()).default([]),
  })
  .refine((a) => a.activities.length > 0 || a.any_outdoor, {
    message: "applies_to needs `activities` or `any_outdoor: true`",
  });

const SopSchema = z.strictObject({
  id: z.string().regex(/^SOP-\d{3,}$/, "id must look like SOP-001"),
  title: z.string(),
  category: z.string(),
  severity: z.enum(SEVERITIES),
  priority: z.number().int().min(0).max(100),
  applies_to: AppliesToSchema,
  when: ConditionSchema,
  advice: z.string().transform((s) => s.trim()),
  rationale: z.string().optional(),
});

const PolicySetSchema = z.strictObject({
  scores: z.record(z.string(), ScoreDefSchema).default({}),
  sops: z.array(SopSchema).min(1),
});

const TaxonomyEntrySchema = z.strictObject({
  label: z.string(),
  description: z.string(),
  keywords: z.array(z.string()).default([]),
});

const TaxonomySchema = z.strictObject({
  activities: z.record(z.string(), TaxonomyEntrySchema),
  groups: z.record(z.string(), TaxonomyEntrySchema),
});

export type Sop = z.infer<typeof SopSchema>;
export type ScoreDef = z.infer<typeof ScoreDefSchema>;
export type PolicySet = z.infer<typeof PolicySetSchema>;
export type Taxonomy = z.infer<typeof TaxonomySchema>;

export function leafMetrics(c: Condition): string[] {
  if ("all" in c) return c.all.flatMap(leafMetrics);
  if ("any" in c) return c.any.flatMap(leafMetrics);
  if ("not" in c) return leafMetrics(c.not);
  return [c.metric];
}

function validateReferences(policies: PolicySet, taxonomy: Taxonomy): void {
  const errors: string[] = [];
  for (const [name, score] of Object.entries(policies.scores)) {
    for (const s of score.signals) if (!isMetricName(s.metric)) errors.push(`score ${name}: unknown metric "${s.metric}"`);
  }
  const seen = new Set<string>();
  for (const sop of policies.sops) {
    if (seen.has(sop.id)) errors.push(`${sop.id}: duplicate id`);
    seen.add(sop.id);
    for (const metric of leafMetrics(sop.when)) {
      if (metric.startsWith(SCORE_PREFIX)) {
        if (!(metric.slice(SCORE_PREFIX.length) in policies.scores)) errors.push(`${sop.id}: unknown score "${metric}"`);
      } else if (!isMetricName(metric)) {
        errors.push(`${sop.id}: unknown metric "${metric}" (known: ${Object.keys(METRICS).join(", ")})`);
      }
    }
    for (const a of sop.applies_to.activities) if (!(a in taxonomy.activities)) errors.push(`${sop.id}: unknown activity "${a}"`);
    for (const g of sop.applies_to.groups) if (!(g in taxonomy.groups)) errors.push(`${sop.id}: unknown group "${g}"`);
  }
  if (errors.length) throw new PolicyError(`Invalid SOP file:\n  ${errors.join("\n  ")}`);
}

function readYaml(path: string): unknown {
  try {
    return parseYaml(fs.readFileSync(path, "utf8"));
  } catch (err) {
    throw new PolicyError(`Cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function loadPolicies(sopsPath: string, taxonomyPath: string): { policies: PolicySet; taxonomy: Taxonomy } {
  const tax = TaxonomySchema.safeParse(readYaml(taxonomyPath));
  if (!tax.success) throw new PolicyError(`Invalid taxonomy data:\n${z.prettifyError(tax.error)}`);
  const pol = PolicySetSchema.safeParse(readYaml(sopsPath));
  if (!pol.success) throw new PolicyError(`Invalid policy data:\n${z.prettifyError(pol.error)}`);
  validateReferences(pol.data, tax.data);
  return { policies: pol.data, taxonomy: tax.data };
}

/** Caches the parsed policy files and reloads them when they change on disk. */
export class PolicyStore {
  private mtimes: [number, number] | null = null;
  private cached: { policies: PolicySet; taxonomy: Taxonomy } | null = null;

  constructor(
    readonly sopsPath: string,
    readonly taxonomyPath: string,
  ) {}

  get(): { policies: PolicySet; taxonomy: Taxonomy } {
    let mtimes: [number, number];
    try {
      mtimes = [fs.statSync(this.sopsPath).mtimeMs, fs.statSync(this.taxonomyPath).mtimeMs];
    } catch (err) {
      throw new PolicyError(`Policy file missing: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!this.cached || !this.mtimes || mtimes[0] !== this.mtimes[0] || mtimes[1] !== this.mtimes[1]) {
      this.cached = loadPolicies(this.sopsPath, this.taxonomyPath);
      this.mtimes = mtimes;
      console.info(`[policies] loaded ${this.cached.policies.sops.length} SOPs from ${this.sopsPath}`);
    }
    return this.cached;
  }
}
