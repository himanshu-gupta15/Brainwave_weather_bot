/**
 * Open-Meteo geocoding + forecast client.
 *
 * Every failure mode (network error, timeout, HTTP error, empty geocoding
 * result, malformed payload) is thrown as `WeatherDataError`, so the graph has
 * exactly one honest-failure branch. Nothing here ever substitutes a default.
 * `fetchFn` is injectable so tests/evals can simulate outages without touching
 * this code.
 */

export const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
export const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

// Fields must be listed explicitly or Open-Meteo omits them.
export const HOURLY_FIELDS = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation",
  "precipitation_probability",
  "wind_speed_10m",
  "wind_gusts_10m",
  "uv_index",
  "weather_code",
] as const;
export type HourlyField = (typeof HOURLY_FIELDS)[number];

export type WeatherFailureKind = "location_not_found" | "weather_unavailable";

export class WeatherDataError extends Error {
  constructor(
    public readonly kind: WeatherFailureKind,
    public readonly detail: string,
  ) {
    super(detail);
    this.name = "WeatherDataError";
  }
}

export interface Location {
  name: string;
  latitude: number;
  longitude: number;
  country: string | null;
  admin1: string | null;
  timezone: string | null;
}

/** Raw hourly forecast exactly as returned by the API (local time). */
export interface Forecast {
  timezone: string;
  currentTime: string; // local ISO time of "now" according to the API
  hourlyTimes: string[];
  hourly: Record<HourlyField, (number | null)[]>;
}

export interface WeatherClient {
  geocode(query: string): Promise<Location>;
  forecast(location: Location): Promise<Forecast>;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export class OpenMeteoClient implements WeatherClient {
  constructor(
    private readonly timeoutMs = 10_000,
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
  ) {}

  private async getJson(
    url: string,
    params: Record<string, string | number>,
    kind: WeatherFailureKind,
  ): Promise<Record<string, unknown>> {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    let data: unknown;
    try {
      const resp = await this.fetchFn(`${url}?${qs}`, {
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      data = await resp.json();
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.warn(`[open-meteo] request failed (${url}): ${msg}`);
      throw new WeatherDataError(kind, msg);
    }
    if (!isRecord(data)) throw new WeatherDataError(kind, "response was not a JSON object");
    return data;
  }

  /** Resolve a place name. Picks the first (most relevant) result. */
  async geocode(query: string): Promise<Location> {
    const data = await this.getJson(
      GEOCODING_URL,
      { name: query, count: 5, language: "en", format: "json" },
      "location_not_found",
    );
    const results = Array.isArray(data.results) ? data.results : [];
    if (results.length === 0) {
      throw new WeatherDataError("location_not_found", `no geocoding results for "${query}"`);
    }
    const top: unknown = results[0];
    if (!isRecord(top) || typeof top.latitude !== "number" || typeof top.longitude !== "number") {
      throw new WeatherDataError("location_not_found", "malformed geocoding result");
    }
    const str = (v: unknown) => (typeof v === "string" ? v : null);
    if (results.length > 1) {
      console.info(`[open-meteo] "${query}": ${results.length} candidates, using ${top.name}, ${top.country}`);
    }
    return {
      name: String(top.name),
      latitude: top.latitude,
      longitude: top.longitude,
      country: str(top.country),
      admin1: str(top.admin1),
      timezone: str(top.timezone),
    };
  }

  async forecast(location: Location): Promise<Forecast> {
    const data = await this.getJson(
      FORECAST_URL,
      {
        latitude: location.latitude,
        longitude: location.longitude,
        current: "temperature_2m",
        hourly: HOURLY_FIELDS.join(","),
        timezone: "auto",
        forecast_days: 3,
      },
      "weather_unavailable",
    );
    const hourlyRaw = data.hourly;
    const current = data.current;
    if (!isRecord(hourlyRaw) || !isRecord(current) || typeof current.time !== "string") {
      throw new WeatherDataError("weather_unavailable", "forecast response missing hourly/current data");
    }
    const times = hourlyRaw.time;
    if (!Array.isArray(times) || times.length === 0) {
      throw new WeatherDataError("weather_unavailable", "forecast hourly times are empty");
    }
    const hourly = {} as Record<HourlyField, (number | null)[]>;
    for (const field of HOURLY_FIELDS) {
      const series = hourlyRaw[field];
      if (!Array.isArray(series) || series.length !== times.length) {
        throw new WeatherDataError("weather_unavailable", `forecast field ${field} missing or inconsistent`);
      }
      hourly[field] = series.map((v) => (typeof v === "number" ? v : null));
    }
    return {
      timezone: typeof data.timezone === "string" ? data.timezone : "local",
      currentTime: current.time,
      hourlyTimes: times.map(String),
      hourly,
    };
  }
}
