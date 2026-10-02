import type { ChatResponse, SopRef } from "@/types/api";

const SEVERITY_STYLES: Record<SopRef["severity"], string> = {
  low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  moderate: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const STATUS_TEXT: Record<ChatResponse["status"], string> = {
  answered: "Grounded in policy",
  no_guidance: "No policy applies",
  data_unavailable: "Weather data unavailable",
  needs_clarification: "Needs more information",
};

function fmt(value: number, unit: string): string {
  if (!unit) return String(value);
  return unit === "%" || unit === "°C" ? `${value}${unit}` : `${value} ${unit}`;
}

function SopLine({ sop }: { sop: SopRef }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-xs font-semibold">{sop.id}</span>
      <span>{sop.title}</span>
      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium uppercase ${SEVERITY_STYLES[sop.severity]}`}>
        {sop.severity}
      </span>
    </div>
  );
}

/** The audit panel under each assistant reply: which policy, which numbers, from where. */
export function PolicyEvidence({ res }: { res: ChatResponse }) {
  const place = res.location
    ? [res.location.name, res.location.admin1, res.location.country].filter(Boolean).join(", ")
    : null;

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{STATUS_TEXT[res.status]}</div>

      <section>
        <h4 className="mb-1 text-xs font-semibold text-zinc-500">Policy used</h4>
        {res.sop ? (
          <div className="space-y-1">
            <SopLine sop={res.sop} />
            {res.additional_sops.map((s) => (
              <div key={s.id} className="pl-3 text-zinc-600 dark:text-zinc-400">
                <span className="mr-1 text-xs">also:</span>
                <SopLine sop={s} />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-zinc-600 dark:text-zinc-400">
            SOP: none{res.reason ? ` (reason: ${res.reason.replaceAll("_", " ")})` : ""}
          </div>
        )}
      </section>

      {res.evidence.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold text-zinc-500">Why it matched</h4>
          <ul className="space-y-0.5">
            {res.evidence.map((e) => (
              <li key={`${e.sop_id}-${e.metric}`} className="font-mono text-xs">
                <span className="text-zinc-500">{e.sop_id}</span> {e.label}: <b>{fmt(e.value, e.unit)}</b>{" "}
                <span className="text-zinc-500">(rule {e.condition})</span>
                {e.signals.length > 0 && <span className="text-zinc-500">: {e.signals.join(", ")}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {res.weather && (
        <section>
          <h4 className="mb-1 text-xs font-semibold text-zinc-500">
            Live weather (Open-Meteo){place ? `: ${place}` : ""}
            {res.window ? `, ${res.window.label} (${res.window.start.slice(11)} to ${res.window.end.slice(11)} local)` : ""}
          </h4>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {res.weather.map((w) => (
              <div key={w.metric} className="flex justify-between gap-2 text-xs">
                <dt className="text-zinc-500">{w.label}</dt>
                <dd className="font-mono">{fmt(w.value, w.unit)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <details className="text-xs text-zinc-500">
        <summary className="cursor-pointer select-none">Trace</summary>
        <div className="mt-1 space-y-0.5 font-mono">
          <div>graph: {res.graph_path.join(" → ")}</div>
          <div>matched (ranked): {res.matched_sop_ids.join(", ") || "none"}</div>
          <div>intent ({res.intent.source ?? "n/a"}): {JSON.stringify({ ...res.intent, source: undefined })}</div>
          <div>composer: {res.composer}</div>
        </div>
      </details>
    </div>
  );
}
