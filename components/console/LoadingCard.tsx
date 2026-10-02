import { Corners } from "@/components/console/primitives";
import { MAIN_PATH } from "@/lib/ui/view";

/**
 * Shows real progress: `done` is the list of graph nodes the server has
 * reported as completed (streamed). Remaining main-path steps stay grey; the
 * next one pulses. Nothing here is simulated.
 */
export function LoadingCard({ done }: { done: string[] }) {
  const cells = [...done, ...MAIN_PATH.slice(done.length)].slice(0, Math.max(MAIN_PATH.length, done.length));
  return (
    <div className="blueprint" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }} aria-live="polite">
      <Corners />
      <span className="pulse" style={{ fontSize: 13, color: "var(--color-neutral-800)" }}>Checking live weather and policies…</span>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cells.length}, minmax(0,1fr))`, border: "1px solid var(--color-divider)" }}>
        {cells.map((name, i) => {
          const isDone = i < done.length;
          const isActive = i === done.length;
          return (
            <div
              key={`${name}-${i}`}
              className={`mono${isActive ? " pulse" : ""}`}
              title={name}
              style={{
                padding: "8px 10px",
                fontSize: 11,
                borderRight: i < cells.length - 1 ? "1px solid var(--color-divider)" : undefined,
                background: isDone ? "var(--color-accent-700)" : isActive ? "var(--color-accent-200)" : "transparent",
                color: isDone ? "var(--color-bg)" : isActive ? "var(--color-accent-900)" : "var(--color-neutral-500)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </div>
          );
        })}
      </div>
    </div>
  );
}
