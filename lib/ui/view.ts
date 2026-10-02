/** Pure presentation helpers for the console UI (no React, easy to test). */
import type { ChatResponse, ChatStatus, EvidenceItem, SopRef } from "@/types/api";

export const STATUS_TEXT: Record<ChatStatus, string> = {
  answered: "Grounded in policy",
  no_guidance: "No policy applies",
  data_unavailable: "Weather data unavailable",
  needs_clarification: "Needs more information",
};

export const SEVERITY_LEVEL: Record<SopRef["severity"], number> = { low: 1, moderate: 2, high: 3, critical: 4 };

/** [background, foreground] of the severity panel, from the design. */
export const SEVERITY_STYLE: Record<SopRef["severity"], [string, string]> = {
  critical: ["var(--color-accent-900)", "var(--color-bg)"],
  high: ["var(--color-accent-700)", "var(--color-bg)"],
  moderate: ["var(--color-accent-200)", "var(--color-accent-900)"],
  low: ["transparent", "var(--color-accent-800)"],
};

export function fmt(value: number, unit: string): string {
  if (!unit || unit === "points") return String(value);
  return unit === "%" || unit === "°C" ? `${value}${unit}` : `${value} ${unit}`;
}

/** ">= 33 and < 40" -> "≥ 33 and < 40" */
export function prettyCondition(condition: string): string {
  return condition.replaceAll(">=", "≥").replaceAll("<=", "≤");
}

/** First numeric threshold in a condition string, e.g. ">= 33 and < 40" -> 33. */
export function firstThreshold(condition: string): number | null {
  const m = condition.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Observed-vs-threshold bar geometry (percent of track), as in the design. */
export function thresholdBar(e: EvidenceItem): { barPct: number; markPct: number | null } {
  const th = firstThreshold(e.condition);
  const scale = Math.max(Math.abs(e.value), Math.abs(th ?? 0)) * 1.3 || 1;
  const clamp = (x: number) => Math.min(100, Math.max(0, x));
  return { barPct: clamp((e.value / scale) * 100), markPct: th === null ? null : clamp((th / scale) * 100) };
}

export function placeLabel(r: Pick<ChatResponse, "location">): string | null {
  if (!r.location) return null;
  return [...new Set([r.location.name, r.location.admin1, r.location.country].filter(Boolean))].join(", ");
}

/** Route taken out of each node; mirrors the conditional edges in lib/graph/builder.ts. */
const EDGE_LABELS: Record<string, string> = {
  "parseQuery>resolveLocation": "resolve",
  "parseQuery>askClarification": "need_location",
  "parseQuery>noGuidance": "off_topic",
  "resolveLocation>fetchWeather": "ok",
  "resolveLocation>dataUnavailable": "failed",
  "fetchWeather>evaluatePolicies": "ok",
  "fetchWeather>dataUnavailable": "failed",
  "evaluatePolicies>selectSop": "matched",
  "evaluatePolicies>noGuidance": "no_match",
  "evaluatePolicies>askClarification": "window_past",
};

export function edgeLabel(path: string[], i: number): string {
  if (i === path.length - 1) return "→ END";
  return EDGE_LABELS[`${path[i]}>${path[i + 1]}`] ?? "";
}

/** The main (happy-path) pipeline, shown in the loading strip. */
export const MAIN_PATH = ["parseQuery", "resolveLocation", "fetchWeather", "evaluatePolicies", "selectSop", "composeResponse"];

export function categoryLabel(category: string): string {
  const text = category.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function relativeTime(ts: number, now: number): string {
  const s = Math.round((now - ts) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} h ago`;
}

// Lucide-style icon paths (24×24, stroke) used by the weather tiles.
const I_THERMO = "M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z";
const I_WIND = "M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2";
const I_RAIN = "M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24M16 14v6M8 14v6M12 16v6";
const I_UMBRELLA = "M22 12a10 10 0 0 0-20 0ZM12 12v8a2 2 0 0 0 4 0M12 2v1";
const I_SUN = "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41";
const I_ZAP = "M13 2 4 14h7l-1 8 9-12h-7l1-8Z";
export const I_CLOCK = "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20M12 6v6l4 2";
export const I_PIN = "M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0M12 7a3 3 0 1 0 0 6a3 3 0 1 0 0-6";

export const METRIC_ICON: Record<string, string> = {
  temp_max_c: I_THERMO,
  temp_min_c: I_THERMO,
  feels_like_max_c: I_THERMO,
  feels_like_min_c: I_THERMO,
  wind_max_kmh: I_WIND,
  gust_max_kmh: I_WIND,
  precip_total_mm: I_RAIN,
  precip_prob_max_pct: I_UMBRELLA,
  rain_hours: I_CLOCK,
  uv_max: I_SUN,
  thunderstorm_hours: I_ZAP,
  precip_next_24h_mm: I_RAIN,
  rain_hours_next_24h: I_CLOCK,
};
