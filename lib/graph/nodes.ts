/**
 * Graph nodes. Each node does one job and records a `route` the edges read.
 *
 * LLM touchpoints: `parseQuery` (classification into a fixed schema) and
 * `composeResponse` (wording only, checked by the grounding guard). Every other
 * node, including all three failure/fallback nodes, is deterministic, so honest
 * failure messages never depend on a model.
 */
import { AIMessage } from "@langchain/core/messages";

import type { Composer } from "@/lib/compose/composer";
import type { AnswerFacts, ValueFact } from "@/lib/compose/facts";
import { type IntentExtractor, merge, sanitize, type SessionContext } from "@/lib/intent/intent";
import type { GraphState, GraphUpdate, TurnResult } from "@/lib/graph/state";
import { type Match, matchSops, select } from "@/lib/sop/engine";
import { computeMetrics, METRICS, type Metrics, type MetricName, resolveWindow } from "@/lib/sop/metrics";
import type { PolicyStore, Sop, Taxonomy } from "@/lib/sop/schema";
import { type Location, type WeatherClient, WeatherDataError } from "@/lib/weather/openMeteo";
import type { ChatStatus, SopRef, WeatherValue } from "@/types/api";

export const UNRECOGNISED_ACTIVITY = "the activity you asked about";

export interface GraphDeps {
  weather: WeatherClient;
  extractor: IntentExtractor;
  composer: Composer;
  policies: PolicyStore;
}

function locationLabel(loc: Location | null): string | null {
  if (!loc) return null;
  return [...new Set([loc.name, loc.admin1, loc.country].filter((p): p is string => Boolean(p)))].join(", ");
}

function subject(ctx: SessionContext, taxonomy: Taxonomy): string {
  const names = ctx.activities.map((a) => taxonomy.activities[a]?.label ?? a);
  if (ctx.otherActivity) names.push(ctx.otherActivity);
  const main = names.join(" / ") || "your plans";
  const groups = ctx.groups.map((g) => taxonomy.groups[g]?.label ?? g);
  return groups.length ? `${main} with ${groups.join(" and ")}` : main;
}

function weatherValues(metrics: Metrics | null): WeatherValue[] {
  if (!metrics) return [];
  return (Object.keys(metrics) as MetricName[]).flatMap((k) => {
    const v = metrics[k];
    return v === null ? [] : [{ metric: k, label: METRICS[k].label, value: v, unit: METRICS[k].unit }];
  });
}

function sopRef(sop: Sop): SopRef {
  const { id, title, category, severity, priority, advice } = sop;
  return { id, title, category, severity, priority, advice };
}

export class Nodes {
  constructor(private readonly deps: GraphDeps) {}

  // ---------------------------------------------------------------- main path
  parseQuery = async (state: GraphState): Promise<GraphUpdate> => {
    const { taxonomy } = this.deps.policies.get();
    const prev = state.context;
    const { intent: raw, source } = await this.deps.extractor.extract(state.userMessage, prev, taxonomy);
    const intent = sanitize(raw, taxonomy);
    if (!intent.relevant) return { intent, intentSource: source, route: "off_topic" };

    const ctx = merge(prev, intent);
    if (!ctx.activities.length && !ctx.otherActivity) {
      if (ctx.groups.length) {
        ctx.activities = ["general_outdoor"]; // "can I take my dog out?"
      } else {
        // Activity not recognised. Treat it as unknown, never as "general outdoor":
        // only any_outdoor SOPs (e.g. a rain system) may apply, so an all-clear
        // rule can never vouch for an activity we know nothing about.
        ctx.otherActivity = UNRECOGNISED_ACTIVITY;
      }
    }
    const route = ctx.locationQuery ? "resolve" : "need_location";
    console.info(`[graph] intent=${JSON.stringify(intent)} source=${source} route=${route}`);
    return { intent, intentSource: source, context: ctx, route };
  };

  resolveLocation = async (state: GraphState): Promise<GraphUpdate> => {
    const ctx = state.context;
    if (ctx.resolvedLocation) return { location: ctx.resolvedLocation, route: "ok" }; // same place as before
    try {
      const location = await this.deps.weather.geocode(ctx.locationQuery ?? "");
      return { location, context: { ...ctx, resolvedLocation: location }, route: "ok" };
    } catch (err) {
      if (!(err instanceof WeatherDataError)) throw err;
      return { failure: { kind: err.kind, detail: err.detail }, route: "failed" };
    }
  };

  fetchWeather = async (state: GraphState): Promise<GraphUpdate> => {
    try {
      const forecast = await this.deps.weather.forecast(state.location as Location);
      return { forecast, route: "ok" };
    } catch (err) {
      if (!(err instanceof WeatherDataError)) throw err;
      return { failure: { kind: err.kind, detail: err.detail }, route: "failed" };
    }
  };

  evaluatePolicies = async (state: GraphState): Promise<GraphUpdate> => {
    const { policies } = this.deps.policies.get();
    const ctx = state.context;
    if (!state.forecast) throw new Error("evaluatePolicies reached without a forecast");
    const window = resolveWindow(state.forecast, ctx.day, ctx.partOfDay);
    if (!window) return { route: "window_past" };
    const metrics = computeMetrics(state.forecast, window);
    const matches = matchSops(policies, metrics, ctx.activities, ctx.groups, ctx.otherActivity);
    console.info(`[graph] window=${window.label} metrics=${JSON.stringify(metrics)} matched=${matches.map((m) => m.sop.id)}`);
    return { window, metrics, matches, route: matches.length ? "matched" : "no_match" };
  };

  selectSop = async (state: GraphState): Promise<GraphUpdate> => {
    const { primary, secondary } = select(state.matches ?? []);
    return { primary, secondary };
  };

  composeResponse = async (state: GraphState): Promise<GraphUpdate> => {
    const { taxonomy } = this.deps.policies.get();
    const ctx = state.context;
    const primary = state.primary as Match;
    const secondary = state.secondary ?? [];
    const shown = [primary, ...secondary];
    const evidence: ValueFact[] = shown.flatMap((m) =>
      m.evidence.map((e) => ({ ...e, sopId: m.sop.id })),
    );
    const facts: AnswerFacts = {
      subject: subject(ctx, taxonomy),
      locationLabel: locationLabel(state.location) ?? "",
      windowLabel: state.window?.label ?? "",
      primary: { id: primary.sop.id, title: primary.sop.title, severity: primary.sop.severity, advice: primary.sop.advice },
      secondary: secondary.map((m) => ({ id: m.sop.id, title: m.sop.title, severity: m.sop.severity, advice: m.sop.advice })),
      evidence: evidence.map(({ label, value, unit, condition, sopId, signals }) => ({ label, value, unit, condition, sopId, signals })),
      weather: weatherValues(state.metrics).map(({ label, value, unit }) => ({ label, value, unit })),
      previous: ctx.lastDecision,
    };
    const { text, composer } = await this.deps.composer.compose(facts);
    return this.finish(state, ctx, "answered", text, null, {
      sop: sopRef(primary.sop),
      additional_sops: secondary.map((m) => sopRef(m.sop)),
      evidence: shown.flatMap((m) =>
        m.evidence.map((e) => ({
          sop_id: m.sop.id,
          metric: e.metric,
          label: e.label,
          value: e.value,
          unit: e.unit,
          condition: e.condition,
          signals: e.signals,
        })),
      ),
      composer,
    });
  };

  // ---------------------------------------------------------------- fallbacks
  noGuidance = async (state: GraphState): Promise<GraphUpdate> => {
    const ctx = state.context;
    if (state.route === "off_topic") {
      return this.finish(
        state,
        ctx,
        "no_guidance",
        "I can only help with whether current weather makes an outdoor plan advisable, for example cycling, " +
          "a picnic, or taking kids to the park. I don't have guidance for that question.",
        "off_topic",
      );
    }
    const { taxonomy } = this.deps.policies.get();
    const where = locationLabel(state.location);
    const when = state.window?.label ?? "";
    if (ctx.otherActivity && !ctx.activities.length) {
      return this.finish(
        state,
        ctx,
        "no_guidance",
        `I checked the live weather for ${where} (${when}), but none of our policies cover ${ctx.otherActivity}, ` +
          "so I can't give you safety guidance for it. I'd rather say that than guess.",
        "unsupported_activity",
      );
    }
    return this.finish(
      state,
      ctx,
      "no_guidance",
      `I checked the live weather for ${where} (${when}), but none of our policies match these conditions for ` +
        `${subject(ctx, taxonomy)}, so I don't have specific safety guidance to give. The weather figures are ` +
        "shown for reference, but I won't guess at advice.",
      "no_matching_policy",
    );
  };

  dataUnavailable = async (state: GraphState): Promise<GraphUpdate> => {
    const ctx = { ...state.context };
    const kind = state.failure?.kind ?? "weather_unavailable";
    let answer: string;
    if (kind === "location_not_found") {
      answer =
        `I couldn't resolve the location "${ctx.locationQuery}", so I can't check its weather or give ` +
        "weather-based guidance. Could you check the spelling or name a nearby larger town?";
      ctx.locationQuery = null; // don't keep retrying a name that failed
      ctx.resolvedLocation = null;
    } else {
      answer =
        `I couldn't retrieve current weather data for ${locationLabel(state.location)}, so I can't safely ` +
        "provide weather-based guidance right now. Please try again shortly.";
    }
    console.warn(`[graph] data unavailable: ${kind}: ${state.failure?.detail}`);
    return this.finish(state, ctx, "data_unavailable", answer, kind);
  };

  askClarification = async (state: GraphState): Promise<GraphUpdate> => {
    if (state.route === "window_past") {
      return this.finish(
        state,
        state.context,
        "needs_clarification",
        `That time window has already passed in ${locationLabel(state.location)}'s local time. ` +
          "Ask me about the rest of today or about tomorrow instead.",
        "window_past",
      );
    }
    return this.finish(
      state,
      state.context,
      "needs_clarification",
      "Which city or town are you asking about? I need a location to check the live weather.",
      "missing_location",
    );
  };

  // ---------------------------------------------------------------- shared
  private finish(
    state: GraphState,
    ctx: SessionContext,
    status: ChatStatus,
    answer: string,
    reason: string | null,
    extra: Partial<TurnResult> = {},
  ): GraphUpdate {
    const sop = extra.sop ?? null;
    const window = state.window;
    const nextCtx: SessionContext = { ...ctx };
    if ((status === "answered" || status === "no_guidance") && window) {
      nextCtx.lastDecision = {
        windowLabel: window.label,
        sopId: sop?.id ?? null,
        sopTitle: sop?.title ?? null,
        locationLabel: locationLabel(state.location),
      };
    }
    const weather = weatherValues(state.metrics);
    const result: TurnResult = {
      status,
      answer,
      reason,
      sop: null,
      additional_sops: [],
      matched_sop_ids: (state.matches ?? []).map((m) => m.sop.id),
      evidence: [],
      composer: "template",
      location: state.location,
      window: window ? { label: window.label, day: window.day, part: window.part, start: window.start, end: window.end } : null,
      weather: weather.length ? weather : null,
      intent: {
        location_query: nextCtx.locationQuery,
        activities: nextCtx.activities,
        other_activity: nextCtx.otherActivity,
        groups: nextCtx.groups,
        day: nextCtx.day,
        part_of_day: nextCtx.partOfDay,
        source: state.intentSource,
      },
      ...extra,
    };
    return {
      result,
      context: nextCtx,
      messages: [new AIMessage(answer)],
      decisionLog: [
        {
          userMessage: state.userMessage,
          status,
          reason,
          sopId: sop?.id ?? null,
          matchedSopIds: result.matched_sop_ids,
          window: window?.label ?? null,
          location: locationLabel(state.location),
        },
      ],
    };
  }
}
