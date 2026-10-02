/**
 * Turns a raw Open-Meteo hourly forecast into the named metrics SOPs reference.
 *
 * This is the *only* place weather numbers are produced. Every metric is a
 * plain aggregate (max / min / sum / count) over the API's own hourly values
 * for the requested window, so each number traces back to the response. If any
 * hour in the window is missing a value the metric is `null` (unknown) rather
 * than an under-estimate, and any SOP condition depending on it won't fire.
 */
import type { Forecast, HourlyField } from "@/lib/weather/openMeteo";

export type Day = "today" | "tomorrow";
export type Part = "now" | "morning" | "afternoon" | "evening" | "night" | "all_day";

// Local-time hour ranges (inclusive) for each part of day.
const PART_HOURS: Record<"morning" | "afternoon" | "evening" | "night", [number, number]> = {
  morning: [6, 11],
  afternoon: [12, 16],
  evening: [17, 20],
  night: [21, 23],
};
const NOW_SPAN_HOURS = 3;
const TOMORROW_ALL_DAY: [number, number] = [6, 21];
const THUNDERSTORM_CODES = new Set([95, 96, 99]); // WMO weather codes
const RAIN_HOUR_MM = 0.5;

export const METRICS = {
  temp_max_c: { label: "Max temperature", unit: "°C" },
  temp_min_c: { label: "Min temperature", unit: "°C" },
  feels_like_max_c: { label: "Max feels-like temperature", unit: "°C" },
  feels_like_min_c: { label: "Min feels-like temperature", unit: "°C" },
  wind_max_kmh: { label: "Max wind speed", unit: "km/h" },
  gust_max_kmh: { label: "Max wind gust", unit: "km/h" },
  precip_total_mm: { label: "Total precipitation", unit: "mm" },
  precip_prob_max_pct: { label: "Max precipitation probability", unit: "%" },
  rain_hours: { label: "Hours with rain (>=0.5 mm)", unit: "h" },
  uv_max: { label: "Max UV index", unit: "" },
  thunderstorm_hours: { label: "Hours with thunderstorms", unit: "h" },
  precip_next_24h_mm: { label: "Precipitation, 24 h from window start", unit: "mm" },
  rain_hours_next_24h: { label: "Rain hours, 24 h from window start", unit: "h" },
} as const satisfies Record<string, { label: string; unit: string }>;

export type MetricName = keyof typeof METRICS;
export type Metrics = Record<MetricName, number | null>;

export function isMetricName(name: string): name is MetricName {
  return Object.prototype.hasOwnProperty.call(METRICS, name);
}

export interface Window {
  day: Day;
  part: Part;
  label: string;
  startIndex: number; // into Forecast.hourlyTimes
  endIndex: number; // exclusive
  start: string;
  end: string; // start of the last hour in the window
}

function windowLabel(day: Day, part: Part): string {
  if (part === "now") return "the next few hours";
  if (part === "all_day") return day === "today" ? "the rest of today" : "tomorrow";
  return `${day === "today" ? "this" : "tomorrow"} ${part}`;
}

function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Map (day, part) onto hourly indices. Returns null if the window is entirely
 * in the past (e.g. "this morning" asked at 3 pm).
 */
export function resolveWindow(forecast: Forecast, day: Day, part: Part): Window | null {
  const nowHourStr = `${forecast.currentTime.slice(0, 13)}:00`;
  const today = forecast.currentTime.slice(0, 10);
  const target = day === "today" ? today : addDays(today, 1);
  const nowHour = Number(forecast.currentTime.slice(11, 13));

  let lo: number;
  let hi: number;
  if (part === "now" || part === "all_day") {
    [lo, hi] = day === "today" ? [nowHour, 23] : TOMORROW_ALL_DAY;
  } else {
    [lo, hi] = PART_HOURS[part];
  }

  const indices: number[] = [];
  forecast.hourlyTimes.forEach((t, i) => {
    if (day === "today" && part === "now") {
      // "now" may roll past midnight, so select by absolute position.
      if (t >= nowHourStr && indices.length < NOW_SPAN_HOURS) indices.push(i);
      return;
    }
    if (t.slice(0, 10) !== target) return;
    const hour = Number(t.slice(11, 13));
    if (hour >= lo && hour <= hi && (day !== "today" || t >= nowHourStr)) indices.push(i);
  });

  if (indices.length === 0) return null;
  const first = indices[0];
  const last = indices[indices.length - 1];
  return {
    day,
    part,
    label: windowLabel(day, part),
    startIndex: first,
    endIndex: last + 1,
    start: forecast.hourlyTimes[first],
    end: forecast.hourlyTimes[last],
  };
}

function series(f: Forecast, field: HourlyField, start: number, end: number): number[] | null {
  const values = f.hourly[field].slice(start, end);
  if (values.length === 0 || values.some((v) => v === null)) return null;
  return values as number[];
}

const agg = (fn: (xs: number[]) => number, xs: number[] | null): number | null => (xs === null ? null : fn(xs));
const max = (xs: number[]) => Math.max(...xs);
const min = (xs: number[]) => Math.min(...xs);
const total = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
const rainHours = (xs: number[]) => xs.filter((x) => x >= RAIN_HOUR_MM).length;
const stormHours = (xs: number[]) => xs.filter((x) => THUNDERSTORM_CODES.has(Math.round(x))).length;

export function computeMetrics(f: Forecast, w: Window): Metrics {
  const s = w.startIndex;
  const e = w.endIndex;
  const e24 = Math.min(s + 24, f.hourlyTimes.length);
  const temp = series(f, "temperature_2m", s, e);
  const feels = series(f, "apparent_temperature", s, e);
  const precip = series(f, "precipitation", s, e);
  const precip24 = series(f, "precipitation", s, e24);
  return {
    temp_max_c: agg(max, temp),
    temp_min_c: agg(min, temp),
    feels_like_max_c: agg(max, feels),
    feels_like_min_c: agg(min, feels),
    wind_max_kmh: agg(max, series(f, "wind_speed_10m", s, e)),
    gust_max_kmh: agg(max, series(f, "wind_gusts_10m", s, e)),
    precip_total_mm: agg(total, precip),
    precip_prob_max_pct: agg(max, series(f, "precipitation_probability", s, e)),
    rain_hours: agg(rainHours, precip),
    uv_max: agg(max, series(f, "uv_index", s, e)),
    thunderstorm_hours: agg(stormHours, series(f, "weather_code", s, e)),
    precip_next_24h_mm: agg(total, precip24),
    rain_hours_next_24h: agg(rainHours, precip24),
  };
}
