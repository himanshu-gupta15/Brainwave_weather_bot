import { Eyebrow, Icon } from "@/components/console/primitives";
import { edgeLabel, placeLabel } from "@/lib/ui/view";
import type { ChatResponse } from "@/types/api";

const section = { padding: "16px 20px", borderBottom: "1px solid var(--color-divider)", display: "flex", flexDirection: "column", gap: 8 } as const;

/** Right-hand panel: location, window, intent, graph path, ranked matches and raw JSON for the selected turn. */
export function Inspector({ res, open, onClose }: { res: ChatResponse | null; open: boolean; onClose: () => void }) {
  const intentRows: [string, string[]][] = res
    ? [
        ["activities", res.intent.activities.length ? res.intent.activities : res.intent.other_activity ? [res.intent.other_activity] : ["—"]],
        ["groups", res.intent.groups.length ? res.intent.groups : ["—"]],
        ["day", [res.intent.day]],
        ["part", [res.intent.part_of_day]],
      ]
    : [];

  return (
    <aside className={`inspector${open ? " open" : ""}`} aria-label="Inspector" style={{ borderLeft: "1px solid var(--color-divider)", overflow: "auto", minHeight: 0, flexDirection: "column", background: "var(--color-bg)" }}>
      <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid var(--color-divider)", display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow style={{ marginBottom: 4 }}>Inspector</Eyebrow>
          <h4 style={{ margin: 0 }}>{res ? `Turn ${res.turn} · ${res.sop ? res.sop.id : "no SOP"}` : "No answer selected"}</h4>
        </div>
        <button type="button" className="btn btn-icon btn-secondary only-narrow" onClick={onClose} aria-label="Close inspector">
          <Icon d="M6 6l12 12M18 6L6 18" />
        </button>
      </div>

      {!res ? (
        <p style={{ padding: 20, fontSize: 13, color: "var(--color-neutral-700)", margin: 0 }}>
          Send a question to see the location, time window, extracted intent and graph path behind each answer.
        </p>
      ) : (
        <>
          <section style={section}>
            <Eyebrow>Location</Eyebrow>
            <span style={{ fontSize: 15 }}>{placeLabel(res) ?? "Not resolved"}</span>
            <span className="mono" style={{ fontSize: 12, color: "var(--color-neutral-800)" }}>
              {res.location ? `${res.location.latitude.toFixed(4)}, ${res.location.longitude.toFixed(4)} · ${res.location.timezone ?? "local"}` : "—"}
            </span>
          </section>
          <section style={section}>
            <Eyebrow>Window</Eyebrow>
            <span style={{ fontSize: 15 }}>{res.window?.label ?? "Not resolved"}</span>
            <span className="mono" style={{ fontSize: 12, color: "var(--color-neutral-800)" }}>
              {res.window ? `${res.window.start.replace("T", " ")} → ${res.window.end.slice(11)}` : "—"}
            </span>
          </section>
          <section style={{ ...section, gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <Eyebrow>Intent</Eyebrow>
              <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-neutral-700)" }}>source: {res.intent.source ?? "n/a"}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", fontSize: 13, alignItems: "center" }}>
              {intentRows.map(([k, vals]) => (
                <div key={k} style={{ display: "contents" }}>
                  <span style={{ color: "var(--color-neutral-700)", fontSize: 12 }}>{k}</span>
                  <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {vals.map((v) => (
                      <span key={v} className="tag tag-neutral mono">{v}</span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section style={{ ...section, gap: 10 }}>
            <Eyebrow>Graph path</Eyebrow>
            <ol style={{ display: "flex", flexDirection: "column", margin: 0, padding: 0, listStyle: "none" }}>
              {res.graph_path.map((name, i) => {
                const last = i === res.graph_path.length - 1;
                return (
                  <li key={`${name}-${i}`} style={{ display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--color-hairline)" }}>
                    <span className="mono" style={{ width: 22, height: 22, display: "grid", placeItems: "center", fontSize: 11, background: last ? "var(--color-accent)" : "transparent", color: last ? "var(--color-bg)" : "var(--color-accent-800)", border: "1px solid var(--color-accent)" }}>{i + 1}</span>
                    <span className="mono" style={{ fontSize: 12.5 }}>{name}</span>
                    <span style={{ fontSize: 11, color: "var(--color-neutral-700)" }}>{edgeLabel(res.graph_path, i)}</span>
                  </li>
                );
              })}
            </ol>
          </section>
          <section style={section}>
            <Eyebrow>Matched, ranked</Eyebrow>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(res.matched_sop_ids.length ? res.matched_sop_ids : ["none"]).map((m) => (
                <span key={m} className="tag tag-accent mono">{m}</span>
              ))}
            </div>
          </section>
          <section style={{ ...section, borderBottom: 0 }}>
            <Eyebrow>Raw response</Eyebrow>
            <pre className="mono" style={{ margin: 0, fontSize: 11, lineHeight: 1.5, background: "var(--color-surface)", border: "1px solid var(--color-divider)", padding: "10px 12px", overflow: "auto", maxHeight: 260, whiteSpace: "pre" }}>
              {JSON.stringify(res, null, 2)}
            </pre>
          </section>
        </>
      )}
    </aside>
  );
}
