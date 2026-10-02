import { ChartLegend, HourlyChart } from "@/components/console/HourlyChart";
import { Corners, Eyebrow, Icon } from "@/components/console/primitives";
import {
  fmt,
  I_CLOCK,
  I_PIN,
  METRIC_ICON,
  placeLabel,
  prettyCondition,
  SEVERITY_LEVEL,
  SEVERITY_STYLE,
  STATUS_TEXT,
  thresholdBar,
} from "@/lib/ui/view";
import type { ChatResponse } from "@/types/api";

const NON_ANSWER_LABEL: Record<Exclude<ChatResponse["status"], "answered">, string> = {
  no_guidance: "None",
  data_unavailable: "No data",
  needs_clarification: "Clarify",
};

const cell = { padding: "7px 14px 7px 0", borderBottom: "1px solid var(--color-hairline)" } as const;
const headCell = { ...cell, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-neutral-700)", borderBottom: "1px solid var(--color-divider)" } as const;

/** One assistant reply: severity, policy, answer, evidence, hourly chart, window metrics, trace. */
export function AnswerCard({ res, selected, onInspect }: { res: ChatResponse; selected: boolean; onInspect: () => void }) {
  const sev = res.sop?.severity ?? null;
  const [sevBg, sevFg] = sev ? SEVERITY_STYLE[sev] : ["transparent", "var(--color-neutral-800)"];
  const level = sev ? SEVERITY_LEVEL[sev] : 0;
  const flagged = new Set(res.evidence.map((e) => e.metric));
  const place = placeLabel(res) ?? "No location";
  const windowText = res.window
    ? `${res.window.label}, ${res.window.start.slice(11)}–${res.window.end.slice(11)} local`
    : "No time window";

  return (
    <article className="blueprint" style={{ display: "flex", flexDirection: "column", borderColor: selected ? "var(--color-accent)" : undefined }}>
      <Corners />
      <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderBottom: "1px solid var(--color-divider)", flexWrap: "wrap" }}>
        <span>Turn {res.turn}</span>
        <span>·</span>
        <span style={{ color: "var(--color-accent-700)" }}>{STATUS_TEXT[res.status]}</span>
        <span className="mono" style={{ marginLeft: "auto", letterSpacing: 0, textTransform: "none", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={res.composer}>
          composer: {res.composer}
        </span>
      </div>

      <div className="sev-grid" style={{ borderBottom: "1px solid var(--color-divider)" }}>
        <div style={{ background: sevBg, color: sevFg, padding: "14px 16px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 12, borderRight: "1px solid var(--color-divider)" }}>
          <span style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", opacity: 0.85 }}>Severity</span>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 28, lineHeight: 1, textTransform: "uppercase", letterSpacing: ".02em" }}>
            {sev ?? NON_ANSWER_LABEL[res.status as keyof typeof NON_ANSWER_LABEL]}
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 3 }} aria-label={`severity ${level} of 4`}>
            {[1, 2, 3, 4].map((i) => (
              <span key={i} style={{ height: 4, background: i <= level ? sevFg : "transparent", border: `1px solid ${sevFg}` }} />
            ))}
          </div>
        </div>
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 4, minWidth: 0 }}>
          <span className="mono" style={{ fontSize: 12, color: "var(--color-accent-700)" }}>
            {res.sop ? res.sop.id : `SOP: none · ${(res.reason ?? "").replaceAll("_", " ")}`}
          </span>
          <h3 style={{ margin: 0, fontSize: 28, textWrap: "balance" }}>{res.sop ? res.sop.title : STATUS_TEXT[res.status]}</h3>
          <span style={{ fontSize: 13, color: "var(--color-neutral-800)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Icon d={I_PIN} size={14} color="var(--color-accent-700)" />
              {place}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Icon d={I_CLOCK} size={14} color="var(--color-accent-700)" />
              {windowText}
            </span>
          </span>
        </div>
      </div>

      <div style={{ padding: "16px 18px 6px" }}>
        <p style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-line", margin: 0, maxWidth: "68ch", textWrap: "pretty" }}>{res.answer}</p>
      </div>

      {res.additional_sops.length > 0 && (
        <div style={{ padding: "10px 18px 0", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span className="eyebrow">Also applies</span>
          {res.additional_sops.map((a) => (
            <span key={a.id} className="tag tag-accent">
              <span className="mono">{a.id}</span>
              {a.title}
              <span style={{ opacity: 0.7, textTransform: "uppercase", fontSize: 10 }}>{a.severity}</span>
            </span>
          ))}
        </div>
      )}

      {res.evidence.length > 0 && (
        <div style={{ padding: "18px 18px 4px" }}>
          <Eyebrow style={{ marginBottom: 4 }}>Why it matched</Eyebrow>
          <div style={{ overflowX: "auto" }}>
            <div role="table" style={{ display: "grid", gridTemplateColumns: "auto minmax(140px,1fr) auto auto 120px", fontSize: 13, minWidth: 520 }}>
              <div role="row" style={{ display: "contents" }}>
                <div role="columnheader" style={headCell}>Rule</div>
                <div role="columnheader" style={headCell}>Metric</div>
                <div role="columnheader" style={{ ...headCell, textAlign: "right" }}>Observed</div>
                <div role="columnheader" style={headCell}>Condition</div>
                <div role="columnheader" style={{ ...headCell, paddingRight: 0 }}>vs. threshold</div>
              </div>
              {res.evidence.map((e) => {
                const { barPct, markPct } = thresholdBar(e);
                return (
                  <div role="row" key={`${e.sop_id}-${e.metric}`} style={{ display: "contents" }}>
                    <span role="cell" className="mono" style={{ ...cell, fontSize: 12, color: "var(--color-accent-700)", whiteSpace: "nowrap" }}>{e.sop_id}</span>
                    <span role="cell" style={cell}>
                      {e.label}
                      {e.signals.length > 0 && <span style={{ color: "var(--color-neutral-700)", fontSize: 12 }}> — {e.signals.join(", ")}</span>}
                    </span>
                    <span role="cell" className="mono" style={{ ...cell, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>{fmt(e.value, e.unit)}</span>
                    <span role="cell" className="mono" style={{ ...cell, fontSize: 12, color: "var(--color-neutral-800)", whiteSpace: "nowrap" }}>{prettyCondition(e.condition)}</span>
                    <span role="cell" style={{ ...cell, paddingRight: 0, display: "flex", alignItems: "center" }}>
                      <span style={{ position: "relative", width: "100%", height: 10, border: "1px solid var(--color-divider)" }}>
                        <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${barPct}%`, background: "var(--color-accent-700)" }} />
                        {markPct !== null && (
                          <span style={{ position: "absolute", top: -4, bottom: -4, left: `${markPct}%`, width: 0, borderLeft: "1.5px solid var(--color-accent-900)" }} />
                        )}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {res.weather && (
        <>
          {res.hourly && res.hourly.length > 0 && (
            <>
              <div style={{ padding: "18px 18px 0", display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
                <Eyebrow>Hourly forecast · Open-Meteo</Eyebrow>
                <ChartLegend />
              </div>
              <HourlyChart hourly={res.hourly} evidence={res.evidence} />
            </>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", borderTop: "1px solid var(--color-divider)" }}>
            {res.weather.map((w) => {
              const hot = flagged.has(w.metric);
              return (
                <div key={w.metric} style={{ padding: "10px 14px 12px 18px", borderRight: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)", display: "flex", flexDirection: "column", gap: 4, background: hot ? "var(--color-accent-100)" : "transparent" }}>
                  <Icon d={METRIC_ICON[w.metric] ?? I_CLOCK} size={18} color={hot ? "var(--color-accent-800)" : "var(--color-accent)"} />
                  <span style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 24, lineHeight: 1.05, color: hot ? "var(--color-accent-800)" : "var(--color-text)" }}>
                    {w.value}
                    <span style={{ fontSize: 13, marginLeft: 2, color: "var(--color-neutral-700)" }}>{w.unit}</span>
                  </span>
                  <span style={{ fontSize: 11, color: "var(--color-neutral-800)", lineHeight: 1.3 }}>{w.label}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", fontSize: 12, color: "var(--color-neutral-700)" }}>
        <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{res.graph_path.join(" → ")}</span>
        <button type="button" className="btn btn-ghost" onClick={onInspect} style={{ marginLeft: "auto", fontSize: 13, flex: "none" }}>
          {selected ? "Inspecting" : "Inspect trace"}
        </button>
      </div>
    </article>
  );
}
