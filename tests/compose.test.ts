/** The grounding guard is what stops an LLM from inventing numbers or policies. */
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { describe, expect, it } from "vitest";

import { LLMComposer } from "@/lib/compose/composer";
import type { AnswerFacts } from "@/lib/compose/facts";
import { checkGrounding } from "@/lib/compose/guard";

const FACTS: AnswerFacts = {
  subject: "cycling",
  locationLabel: "Bhopal, Madhya Pradesh, India",
  windowLabel: "the next few hours",
  primary: { id: "SOP-003", title: "Strong wind on two wheels", severity: "high", advice: "Use enclosed transport." },
  secondary: [{ id: "SOP-008", title: "Very high UV", severity: "moderate", advice: "Use SPF 30+ sunscreen." }],
  evidence: [{ label: "Max wind gust", value: 52.4, unit: "km/h", condition: ">= 50", sopId: "SOP-003" }],
  weather: [{ label: "Max UV index", value: 8.65, unit: "" }],
  previous: null,
};

describe("grounding guard", () => {
  it("accepts a grounded reply (incl. rounding)", () =>
    expect(checkGrounding("Gusts up to 52.4 km/h (52 rounded) exceed the 50 km/h limit in SOP-003. UV 8.7, SOP-008: SPF 30.", FACTS)).toEqual([]));

  it("rejects an invented number", () =>
    expect(checkGrounding("SOP-003: gusts of 47 km/h.", FACTS).join()).toContain("47"));

  it("rejects an invented policy id", () =>
    expect(checkGrounding("Per SOP-003 and SOP-777 cycling is always safe.", FACTS).join()).toContain("SOP-777"));

  it("rejects a reply that doesn't cite the primary SOP", () =>
    expect(checkGrounding("Please use enclosed transport.", FACTS).length).toBeGreaterThan(0));

  it("LLM composer falls back to the template when the model hallucinates", async () => {
    const model = new FakeListChatModel({ responses: ["SOP-003 applies: winds will reach 70 km/h this afternoon."] });
    const { text, composer } = await new LLMComposer(model).compose(FACTS);
    expect(composer).toMatch(/^template \(llm reply rejected/);
    expect(text).not.toContain("70");
    expect(text).toContain("SOP-003");
  });

  it("LLM composer keeps a grounded reply", async () => {
    const reply = "Under SOP-003, gusts up to 52 km/h make cycling risky; use enclosed transport.";
    const out = await new LLMComposer(new FakeListChatModel({ responses: [reply] })).compose(FACTS);
    expect(out).toEqual({ text: reply, composer: "llm" });
  });
});

describe("grounding guard: legitimate facts outside the current SOPs", () => {
  it("allows numbers that appear in metric labels (e.g. '24 h')", () => {
    const facts: AnswerFacts = { ...FACTS, weather: [{ label: "Precipitation, 24 h from window start", value: 21.5, unit: "mm" }] };
    expect(checkGrounding("SOP-003: 21.5 mm expected over the next 24 hours.", facts)).toEqual([]);
  });

  it("allows citing the previous turn's SOP, but no other", () => {
    const facts: AnswerFacts = { ...FACTS, previous: { windowLabel: "the next few hours", sopId: "SOP-016", sopTitle: "x", locationLabel: null } };
    expect(checkGrounding("Earlier SOP-016 applied; now SOP-003 does.", facts)).toEqual([]);
    expect(checkGrounding("Earlier SOP-015 applied; now SOP-003 does.", facts).join()).toContain("SOP-015");
  });
});
