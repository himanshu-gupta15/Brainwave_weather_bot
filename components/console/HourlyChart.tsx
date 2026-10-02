import { prettyCondition } from "@/lib/ui/view";
import type { EvidenceItem, HourlyPoint } from "@/types/api";

const MM_FULL_SCALE = 3; // mm/h that fills a whole probability bar

/** Bars = rain probability (light) with rain mm inside (dark); line = feels-like °C. Raw Open-Meteo hours. */
export function HourlyChart({ hourly, evidence }: { hourly: HourlyPoint[]; evidence: EvidenceItem[] }) {
  const n = hourly.length;
  const feels = hourly.map((h) => h.feels_like_c).filter((v): v is number => v !== null);
  const lo = Math.min(...feels) - 2;
  const hi = Math.max(...feels) + 2;
  const line = hourly
    .flatMap((h, i) =>
      h.feels_like_c === null ? [] : [`${((i + 0.5) / n) * 100},${100 - ((h.feels_like_c - lo) / (hi - lo)) * 100}`],
    )
    .join(" ");
  const rule = evidence.find((e) => e.metric === "precip_prob_max_pct");
  const ruleThreshold = rule ? Number(rule.condition.match(/\d+(?:\.\d+)?/)?.[0]) : null;
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };

  return (
    <div style={{ padding: "12px 18px 16px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr)", gap: 8 }}>
        <div className="mono" style={{ position: "relative", height: 150, fontSize: 10, color: "var(--color-neutral-700)", textAlign: "right" }}>
          <span style={{ position: "absolute", right: 0, top: -6 }}>100%</span>
          <span style={{ position: "absolute", right: 0, top: 69 }}>50%</span>
          <span style={{ position: "absolute", right: 0, bottom: -6 }}>0</span>
        </div>
        <div
          role="img"
          aria-label={`Hourly forecast for ${n} hours: rain probability, rain amount and feels-like temperature`}
          style={{
            position: "relative",
            height: 150,
            borderLeft: "1px solid var(--color-divider)",
            borderBottom: "1px solid var(--color-text)",
            backgroundImage: "linear-gradient(to bottom, var(--color-hairline) 1px, transparent 1px)",
            backgroundSize: "100% 25%",
          }}
        >
          <div style={{ position: "absolute", inset: 0, display: "grid", ...cols, gap: 4, padding: "0 4px", alignItems: "end" }}>
            {hourly.map((h) => {
              const p = Math.max(h.precip_prob_pct ?? 0, 2);
              const mm = Math.min(p, ((h.precip_mm ?? 0) / MM_FULL_SCALE) * 100);
              return (
                <div
                  key={h.time}
                  title={`${h.time.slice(11)}: ${h.precip_prob_pct ?? "?"}% rain, ${h.precip_mm ?? "?"} mm, feels ${h.feels_like_c ?? "?"}°C`}
                  style={{ position: "relative", height: `${p}%`, background: "var(--color-accent-200)", border: "1px solid var(--color-accent-400)", borderBottom: 0, display: "flex", alignItems: "flex-end" }}
                >
                  <div style={{ width: "100%", height: `${(mm / p) * 100}%`, background: "var(--color-accent-700)" }} />
                </div>
              );
            })}
          </div>
          {feels.length > 1 && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }} aria-hidden="true">
              <polyline points={line} fill="none" stroke="var(--color-accent-900)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
          )}
          {rule && ruleThreshold !== null && !Number.isNaN(ruleThreshold) && (
            <div style={{ position: "absolute", left: 0, right: 0, bottom: `${ruleThreshold}%`, borderTop: "1px dashed var(--color-accent-900)" }}>
              <span className="mono" style={{ position: "absolute", right: 0, top: -17, fontSize: 10, color: "var(--color-accent-900)", background: "var(--color-bg)", padding: "0 4px" }}>
                {rule.sop_id} {prettyCondition(rule.condition)}%
              </span>
            </div>
          )}
        </div>
        <span />
        <div className="mono" style={{ display: "grid", ...cols, gap: 4, padding: "4px 4px 0", fontSize: 10, color: "var(--color-neutral-700)", textAlign: "center" }}>
          {hourly.map((h) => (
            <div key={h.time} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span>{h.time.slice(11, 13)}</span>
              <span style={{ color: "var(--color-accent-900)" }}>{h.feels_like_c === null ? "–" : `${Math.round(h.feels_like_c)}°`}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChartLegend() {
  return (
    <span style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--color-neutral-800)", marginLeft: "auto", flexWrap: "wrap" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 10, height: 10, background: "var(--color-accent-200)", border: "1px solid var(--color-accent-400)" }} />
        Rain probability
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 10, height: 10, background: "var(--color-accent-700)" }} />
        Rain, mm
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 14, height: 0, borderTop: "1.5px solid var(--color-accent-900)" }} />
        Feels-like °C
      </span>
    </span>
  );
}
