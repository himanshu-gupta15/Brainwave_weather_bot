/**
 * `fetch` doubles for tests and evals. All of them plug into the real
 * `OpenMeteoClient(timeout, fetchFn)`, so the production request / parse /
 * validate code runs unchanged; only the network is swapped out.
 */
import fs from "node:fs";
import path from "node:path";

import { HOURLY_FIELDS } from "@/lib/weather/openMeteo";

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
type Json = Record<string, unknown>;

export const FIXTURES = path.join(process.cwd(), "evals", "fixtures");

const geocodePayload = (name: string, lat: number, lon: number): Json => ({
  results: [{ name, latitude: lat, longitude: lon, country: "Testland", admin1: "Test State", timezone: "UTC" }],
});

export const DEFAULT_HOUR: Record<(typeof HOURLY_FIELDS)[number], number> = {
  temperature_2m: 24,
  apparent_temperature: 25,
  precipitation: 0,
  precipitation_probability: 5,
  wind_speed_10m: 8,
  wind_gusts_10m: 15,
  uv_index: 2,
  weather_code: 1,
};

/**
 * A forecast payload with constant `base` values, optionally overridden for
 * specific hours: { "2026-09-03T14:00": { uv_index: 9 } }.
 */
export function syntheticForecast(opts: {
  currentTime?: string;
  base?: Partial<typeof DEFAULT_HOUR>;
  hours?: Record<string, Partial<Record<keyof typeof DEFAULT_HOUR, number | null>>>;
} = {}): Json {
  const values = { ...DEFAULT_HOUR, ...opts.base };
  const days = ["2026-09-03", "2026-09-04", "2026-09-05"];
  const times = days.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, "0")}:00`));
  const hourly: Record<string, unknown[]> = { time: times };
  for (const field of HOURLY_FIELDS) {
    hourly[field] = times.map((t) => {
      const o = opts.hours?.[t];
      return o && field in o ? o[field] : values[field];
    });
  }
  return { timezone: "UTC", current: { time: opts.currentTime ?? "2026-09-03T08:00" }, hourly };
}

/** Helper: the same override for a range of hours on one day. */
export function hoursOf(day: string, hours: number[], values: Partial<Record<keyof typeof DEFAULT_HOUR, number | null>>) {
  return Object.fromEntries(hours.map((h) => [`${day}T${String(h).padStart(2, "0")}:00`, values]));
}

/** Serves fixed geocoding + forecast JSON. Place names starting with "Nowhere" return no results. */
export function servingFetch(forecast: Json, geocode?: Json): FetchFn {
  return async (input) => {
    const url = new URL(input);
    if (url.hostname.startsWith("geocoding")) {
      if ((url.searchParams.get("name") ?? "").toLowerCase().startsWith("nowhere")) {
        return Response.json({ generationtime_ms: 0.1 }); // Open-Meteo's "no results" shape
      }
      return Response.json(geocode ?? geocodePayload("Testville", 10, 20));
    }
    return Response.json(forecast);
  };
}

/**
 * Replays Open-Meteo's *archived* forecast for Bhopal, 2-6 Sep 2026 (the
 * IMD-flagged low-pressure event), with "now" pinned to `currentTime`.
 */
export function archivedEventFetch(currentTime: string): FetchFn {
  const archive = JSON.parse(fs.readFileSync(path.join(FIXTURES, "bhopal_2026-09-02_to_06_archived_forecast.json"), "utf8"));
  const geocode = JSON.parse(fs.readFileSync(path.join(FIXTURES, "bhopal_geocode.json"), "utf8"));
  return servingFetch({ ...archive, current: { time: currentTime } }, geocode);
}

export type FailureMode = "connect" | "timeout" | "http500" | "malformed";

/** Geocoding works (unless `failGeocoding`); the forecast endpoint fails as `mode`. */
export function failingFetch(mode: FailureMode, failGeocoding = false): FetchFn {
  return async (input) => {
    const url = new URL(input);
    if (url.hostname.startsWith("geocoding") && !failGeocoding) return Response.json(geocodePayload("Testville", 10, 20));
    switch (mode) {
      case "connect":
        throw new TypeError("fetch failed (simulated ECONNREFUSED)");
      case "timeout":
        throw new DOMException("The operation was aborted due to timeout (simulated)", "TimeoutError");
      case "http500":
        return new Response("Internal Server Error", { status: 500 });
      case "malformed":
        return Response.json({ latitude: 10, longitude: 20, generationtime_ms: 0.1 });
    }
  };
}

/** Real network calls, keeping every JSON body so a check can compare the reply against exactly what the API returned. */
export class RecordingFetch {
  readonly responses: { url: string; body: Json }[] = [];

  readonly fetch: FetchFn = async (input, init) => {
    const resp = await fetch(input, init);
    const text = await resp.text();
    try {
      this.responses.push({ url: input, body: JSON.parse(text) });
    } catch {
      /* non-JSON body: nothing to record */
    }
    return new Response(text, { status: resp.status, headers: resp.headers });
  };

  lastForecast(): Json | null {
    return [...this.responses].reverse().find((r) => r.url.includes("/v1/forecast"))?.body ?? null;
  }
}
