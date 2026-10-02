/** The rule set meets the brief, and invalid rule files are rejected loudly. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { leafMetrics, loadPolicies, PolicyError, PolicyStore } from "@/lib/sop/schema";
import { SOPS, TAXONOMY } from "@/tests/helpers";

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sops-")), "sops.yaml");

function withExtraSop(sop: Record<string, unknown>): string {
  const data = parse(fs.readFileSync(SOPS, "utf8"));
  data.sops.push(sop);
  const file = tmpFile();
  fs.writeFileSync(file, stringify(data));
  return file;
}

const BASE = {
  id: "SOP-099",
  title: "t",
  category: "c",
  severity: "low",
  priority: 1,
  applies_to: { activities: ["cycling"] },
  advice: "a",
};

describe("policy set", () => {
  const { policies } = loadPolicies(SOPS, TAXONOMY);

  it("meets the brief: >=10 SOPs, >=3 categories, every severity, a fuzzy rule", () => {
    expect(policies.sops.length).toBeGreaterThanOrEqual(10);
    expect(new Set(policies.sops.map((s) => s.category)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(policies.sops.map((s) => s.severity))).toEqual(new Set(["low", "moderate", "high", "critical"]));
    expect(policies.sops.some((s) => leafMetrics(s.when).some((m) => m.startsWith("score.")))).toBe(true);
  });

  it.each([
    [{ ...BASE, when: { metric: "humidity_pct", gte: 90 } }, 'unknown metric "humidity_pct"'],
    [{ ...BASE, when: { metric: "uv_max", gte: 1 }, applies_to: { activities: ["surfing"] } }, 'unknown activity "surfing"'],
    [{ ...BASE, id: "SOP-001", when: { metric: "uv_max", gte: 1 } }, "duplicate id"],
    [{ ...BASE, when: { metric: "uv_max", above: 1 } }, "Invalid policy data"],
    [{ ...BASE, when: { metric: "uv_max", gte: 1 }, severity: "extreme" }, "Invalid policy data"],
    [{ ...BASE, when: { metric: "score.nope", gte: 1 } }, "unknown score"],
  ])("rejects invalid rule %#", (bad, message) => {
    const file = withExtraSop(bad);
    expect(() => loadPolicies(file, TAXONOMY)).toThrow(PolicyError);
    expect(() => loadPolicies(file, TAXONOMY)).toThrow(message);
  });

  it("hot-reloads when the file changes", () => {
    const file = tmpFile();
    fs.copyFileSync(SOPS, file);
    const store = new PolicyStore(file, TAXONOMY);
    const before = store.get().policies.sops.length;
    const data = parse(fs.readFileSync(file, "utf8"));
    data.sops.push({ ...BASE, when: { metric: "uv_max", gte: 1 } });
    fs.writeFileSync(file, stringify(data));
    const t = new Date(Date.now() + 5000);
    fs.utimesSync(file, t, t);
    expect(store.get().policies.sops.length).toBe(before + 1);
  });
});
