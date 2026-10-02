import type { CSSProperties, ReactNode } from "react";

/** 24×24 stroke icon from a path string. */
export function Icon({ d, size = 16, color = "currentColor" }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

type Corner = "tl" | "tr" | "bl" | "br";

/** The blueprint registration marks drawn at a frame's corners. */
export function Corners({ which = ["tl", "tr", "bl", "br"] }: { which?: Corner[] }) {
  return (
    <>
      {which.map((c) => (
        <i key={c} className={`corner ${c}`} />
      ))}
    </>
  );
}

export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <h6 style={{ color: "var(--color-neutral-700)", margin: 0, ...style }}>{children}</h6>
  );
}
