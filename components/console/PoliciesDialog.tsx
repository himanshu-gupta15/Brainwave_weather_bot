"use client";

import { useEffect, useRef } from "react";

import { Corners, Icon } from "@/components/console/primitives";
import { categoryLabel, SEVERITY_STYLE } from "@/lib/ui/view";
import type { SopRef } from "@/types/api";

/** The live rule set from GET /api/sops. */
export function PoliciesDialog({ sops, onClose }: { sops: SopRef[] | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog blueprint" role="dialog" aria-modal="true" aria-labelledby="policies-title" onClick={(e) => e.stopPropagation()}>
        <Corners />
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--color-divider)" }}>
          <div style={{ flex: 1 }}>
            <h6 style={{ color: "var(--color-neutral-700)", margin: 0 }}>Policies · data/sops.yaml</h6>
            <h4 id="policies-title" style={{ margin: 0 }}>{sops ? `${sops.length} standard operating procedures` : "Loading…"}</h4>
          </div>
          <button ref={closeRef} type="button" className="btn btn-icon btn-secondary" onClick={onClose} aria-label="Close policies">
            <Icon d="M6 6l12 12M18 6L6 18" />
          </button>
        </div>
        <div style={{ overflow: "auto" }}>
          {(sops ?? []).map((s) => {
            const [bg, fg] = SEVERITY_STYLE[s.severity];
            return (
              <div key={s.id} style={{ padding: "12px 18px", borderBottom: "1px solid var(--color-hairline)", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontSize: 12, color: "var(--color-accent-700)" }}>{s.id}</span>
                  <span style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 17 }}>{s.title}</span>
                  <span className="tag" style={{ background: bg, color: fg, border: "1px solid var(--color-accent-700)", textTransform: "uppercase", fontSize: 10 }}>{s.severity}</span>
                  <span style={{ fontSize: 11, color: "var(--color-neutral-700)", marginLeft: "auto" }}>
                    {categoryLabel(s.category)} · priority {s.priority}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--color-neutral-800)" }}>{s.advice}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
