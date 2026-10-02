/** Deterministic matching: three-valued logic, scope, scoring and ranking. */
import { describe, expect, it } from "vitest";

import { matchSops, select } from "@/lib/sop/engine";
import { METRICS, type Metrics } from "@/lib/sop/metrics";
import { loadPolicies } from "@/lib/sop/schema";
import { CALM, SOPS, TAXONOMY } from "@/tests/helpers";

const { policies } = loadPolicies(SOPS, TAXONOMY);
const ids = (m: Partial<Metrics>, activities: string[], groups: string[] = [], other: string | null = null) =>
  matchSops(policies, { ...CALM, ...m }, activities, groups, other).map((x) => x.sop.id);

describe("engine", () => {
  it("CALM covers every metric", () => expect(Object.keys(CALM).sort()).toEqual(Object.keys(METRICS).sort()));

  it("calm day -> all-clear for cycling", () => expect(ids({}, ["cycling"])).toEqual(["SOP-016"]));

  it("gray zone matches nothing (UV 7: too high for all-clear, below very-high-UV rule)", () =>
    expect(ids({ uv_max: 7 }, ["running"])).toEqual([]));

  it("missing data never fires or clears a rule", () => {
    expect(ids({ uv_max: null }, ["cycling"])).toEqual([]);
    // any(): one definitely-true branch is enough even if another is unknown
    expect(ids({ gust_max_kmh: null, wind_max_kmh: 50 }, ["cycling"])[0]).toBe("SOP-003");
  });

  it("wind + UV conflict: higher severity leads, moderate surfaced as secondary", () => {
    const { primary, secondary } = select(matchSops(policies, { ...CALM, gust_max_kmh: 60, uv_max: 9 }, ["cycling"], [], null));
    expect(primary.sop.id).toBe("SOP-003");
    expect(secondary.map((m) => m.sop.id)).toEqual(["SOP-008"]);
  });

  it("rain system applies to any activity and leads", () => {
    const m = { precip_next_24h_mm: 70, precip_total_mm: 12, precip_prob_max_pct: 100 };
    expect(ids(m, ["picnic"])[0]).toBe("SOP-001");
    expect(ids(m, ["road_travel"])[0]).toBe("SOP-001");
    expect(ids(m, [], [], "kayaking")).toEqual(["SOP-001"]);
  });

  it("persistent moderate rain (no single extreme number) still triggers the rain-system rule", () =>
    expect(ids({ precip_next_24h_mm: 21.5, rain_hours_next_24h: 13 }, ["cycling"])[0]).toBe("SOP-001"));

  it("unknown activity never gets the all-clear", () => expect(ids({}, [], [], "kayaking")).toEqual([]));

  it("group rules need the group", () => {
    const hot = { feels_like_max_c: 36, uv_max: 7 };
    expect(ids(hot, ["park_visit"], ["children"])).toContain("SOP-010");
    expect(ids(hot, ["park_visit"])).not.toContain("SOP-010");
  });

  it("fuzzy picnic score bands", () => {
    expect(ids({}, ["picnic"])).toEqual(["SOP-015"]); // score 0
    expect(ids({ precip_prob_max_pct: 60 }, ["picnic"])).toEqual(["SOP-014"]); // 2
    expect(ids({ precip_prob_max_pct: 60, gust_max_kmh: 36 }, ["picnic"])).toEqual(["SOP-013"]); // 3
  });

  it("ranking is independent of file order", () => {
    const m = { ...CALM, gust_max_kmh: 60, uv_max: 9, feels_like_max_c: 41 };
    const a = matchSops(policies, m, ["cycling"], [], null).map((x) => x.sop.id);
    const b = matchSops({ ...policies, sops: [...policies.sops].reverse() }, m, ["cycling"], [], null).map((x) => x.sop.id);
    expect(a).toEqual(["SOP-006", "SOP-003", "SOP-008"]);
    expect(b).toEqual(a);
  });
});
