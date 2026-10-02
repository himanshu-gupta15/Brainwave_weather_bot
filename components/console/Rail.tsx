import { Eyebrow } from "@/components/console/primitives";
import { categoryLabel, relativeTime } from "@/lib/ui/view";
import type { SopRef } from "@/types/api";

export interface SessionSummary {
  id: string;
  title: string;
  city: string | null;
  createdAt: number;
  lastSop: string | null;
}

/** Left rail: this tab's sessions, and the live policy library grouped by category. */
export function Rail({
  sessions,
  activeId,
  onOpen,
  sops,
  now,
}: {
  sessions: SessionSummary[];
  activeId: string;
  onOpen: (id: string) => void;
  sops: SopRef[] | null;
  now: number;
}) {
  const categories = new Map<string, number>();
  for (const s of sops ?? []) categories.set(s.category, (categories.get(s.category) ?? 0) + 1);

  return (
    <aside className="rail" style={{ borderRight: "1px solid var(--color-divider)", flexDirection: "column", minHeight: 0, overflow: "auto" }}>
      <div style={{ padding: "18px 16px 8px" }}>
        <Eyebrow>Sessions</Eyebrow>
      </div>
      {sessions.length === 0 ? (
        <p style={{ padding: "0 16px", fontSize: 12, color: "var(--color-neutral-700)" }}>No questions yet in this tab. Sessions reset when the page reloads.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpen(s.id)}
              className="hover-tint"
              aria-current={s.id === activeId ? "true" : undefined}
              style={{ all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", gap: 2, padding: "10px 16px", borderTop: "1px solid var(--color-hairline)", background: s.id === activeId ? "var(--color-accent-100)" : undefined }}
            >
              <span style={{ fontSize: 13, lineHeight: 1.35, color: "var(--color-text)", textWrap: "pretty" }}>{s.title}</span>
              <span style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--color-neutral-700)" }}>
                <span>{s.city ?? "—"}</span>
                <span>·</span>
                <span>{relativeTime(s.createdAt, now)}</span>
                <span className="mono" style={{ marginLeft: "auto" }}>{s.lastSop ?? "no SOP"}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: "24px 16px 8px", marginTop: 8 }}>
        <Eyebrow>Policy library</Eyebrow>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid var(--color-divider)" }}>
        {[...categories.entries()].map(([category, count]) => (
          <div key={category} style={{ padding: "10px 16px", borderBottom: "1px solid var(--color-divider)", borderRight: "1px solid var(--color-divider)", display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 22, lineHeight: 1 }}>{count}</span>
            <span style={{ fontSize: 11, color: "var(--color-neutral-800)", lineHeight: 1.3 }}>{categoryLabel(category)}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: "var(--color-neutral-700)", padding: "12px 16px", margin: 0, lineHeight: 1.5 }}>
        Rules in <span className="mono">data/sops.yaml</span>. Conflicts resolve by severity, then priority, then id. Missing data fails closed.
      </p>
    </aside>
  );
}
