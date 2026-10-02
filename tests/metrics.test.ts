import { describe, expect, it } from "vitest";

import { computeMetrics, resolveWindow } from "@/lib/sop/metrics";
import { OpenMeteoClient } from "@/lib/weather/openMeteo";
import { servingFetch, syntheticForecast } from "@/evals/fakes";

async function forecast(opts: Parameters<typeof syntheticForecast>[0]) {
  const client = new OpenMeteoClient(5000, servingFetch(syntheticForecast(opts)));
  return client.forecast(await client.geocode("Testville"));
}

describe("windows and metrics", () => {
  it("resolves windows in local time", async () => {
    const f = await forecast({ currentTime: "2026-09-03T08:15" });
    expect(resolveWindow(f, "today", "now")).toMatchObject({ start: "2026-09-03T08:00", end: "2026-09-03T10:00" });
    expect(resolveWindow(f, "today", "evening")).toMatchObject({ start: "2026-09-03T17:00", end: "2026-09-03T20:00" });
    expect(resolveWindow(f, "today", "all_day")?.end).toBe("2026-09-03T23:00");
    expect(resolveWindow(f, "tomorrow", "morning")?.start).toBe("2026-09-04T06:00");
  });

  it("returns null for a window already in the past", async () => {
    expect(resolveWindow(await forecast({ currentTime: "2026-09-03T15:00" }), "today", "morning")).toBeNull();
  });

  it("metrics are window aggregates of the API's own values", async () => {
    const f = await forecast({
      hours: {
        "2026-09-03T18:00": { wind_gusts_10m: 61.3, precipitation: 1.2 },
        "2026-09-03T19:00": { precipitation: 0.4, weather_code: 95 },
      },
    });
    const m = computeMetrics(f, resolveWindow(f, "today", "evening")!);
    expect(m).toMatchObject({ gust_max_kmh: 61.3, precip_total_mm: 1.6, rain_hours: 1, thunderstorm_hours: 1 });
    expect(computeMetrics(f, resolveWindow(f, "today", "now")!).gust_max_kmh).toBe(15);
  });

  it("a null inside the window makes that metric unknown, not smaller", async () => {
    const f = await forecast({ hours: { "2026-09-03T09:00": { uv_index: null } } });
    const m = computeMetrics(f, resolveWindow(f, "today", "now")!);
    expect(m.uv_max).toBeNull();
    expect(m.temp_max_c).toBe(24);
  });
});
