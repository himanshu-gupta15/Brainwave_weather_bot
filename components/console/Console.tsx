"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { AnswerCard } from "@/components/console/AnswerCard";
import { Inspector } from "@/components/console/Inspector";
import { LoadingCard } from "@/components/console/LoadingCard";
import { PoliciesDialog } from "@/components/console/PoliciesDialog";
import { Corners, Icon } from "@/components/console/primitives";
import { Rail, type SessionSummary } from "@/components/console/Rail";
import type { ChatResponse, ChatStreamEvent, SopRef } from "@/types/api";

type Turn =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; res: ChatResponse }
  | { id: number; role: "error"; text: string };

interface Session {
  id: string; // also the server-side LangGraph thread id
  createdAt: number;
  turns: Turn[];
  selectedTurnId: number | null;
}

interface Health {
  status: string;
  llm_mode: string;
  sops_loaded: number | string;
}

const EXAMPLES: [string, string][] = [
  ["Two-wheeler · Bhopal", "Is it safe to cycle in Bhopal today?"],
  ["Children · Delhi", "Should I take my kid to the park in Delhi this afternoon?"],
  ["Leisure · Mumbai", "Is today a good day for a picnic in Mumbai?"],
  ["Travel · Chennai", "Can I travel by bike in Chennai this evening?"],
];
const FOLLOW_UPS = ["What about this evening?", "And with my kids?", "What about tomorrow morning?"];
const EVALS_URL = "https://github.com/himanshu-gupta15/Brainwave_weather_bot/blob/main/evals/RESULTS.md";

// crypto.randomUUID needs a secure context (fine on localhost, not on a LAN IP over http).
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Reads POST /api/chat as NDJSON so the loading strip reflects real graph progress. */
async function streamChat(sessionId: string, message: string, onNode: (node: string) => void): Promise<ChatResponse> {
  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  if (!resp.ok || !resp.body) {
    const body: unknown = await resp.json().catch(() => null);
    const error = body && typeof body === "object" && "error" in body ? String(body.error) : `HTTP ${resp.status}`;
    throw new Error(error);
  }
  const reader = resp.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as ChatStreamEvent;
      if (event.type === "node") onNode(event.node);
      else if (event.type === "result") return event.response;
      else throw new Error(event.error);
    }
    if (done) throw new Error("connection closed before an answer arrived");
  }
}

export function Console() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null); // null = new, empty session
  const [loading, setLoading] = useState<{ sessionId: string; done: string[] } | null>(null);
  const [input, setInput] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [policiesOpen, setPoliciesOpen] = useState(false);
  const [sops, setSops] = useState<SopRef[] | null>(null);
  const [health, setHealth] = useState<{ code: number; body: Health | null } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const nextTurnId = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/sops")
      .then((r) => (r.ok ? (r.json() as Promise<SopRef[]>) : null))
      .then(setSops)
      .catch(() => setSops(null));
    fetch("/api/health")
      .then(async (r) => setHealth({ code: r.status, body: (await r.json()) as Health }))
      .catch(() => setHealth({ code: 0, body: null }));
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const active = sessions.find((s) => s.id === activeId) ?? null;
  const turns = active?.turns ?? [];
  const isLoadingHere = loading !== null && loading.sessionId === activeId;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }));
  }, [turns.length, isLoadingHere, activeId]);

  const closePolicies = useCallback(() => setPoliciesOpen(false), []);
  const closeInspector = useCallback(() => setInspectorOpen(false), []);

  const updateSession = useCallback((id: string, fn: (s: Session) => Session) => {
    setSessions((all) => all.map((s) => (s.id === id ? fn(s) : s)));
  }, []);

  async function send(text: string) {
    const message = text.trim();
    if (!message || loading) return;
    const sessionId = activeId ?? newId();
    const userTurn: Turn = { id: nextTurnId.current++, role: "user", text: message };
    if (activeId) {
      updateSession(sessionId, (s) => ({ ...s, turns: [...s.turns, userTurn] }));
    } else {
      setSessions((all) => [{ id: sessionId, createdAt: Date.now(), turns: [userTurn], selectedTurnId: null }, ...all]);
      setActiveId(sessionId);
    }
    setInput("");
    setLoading({ sessionId, done: [] });
    let turn: Turn;
    try {
      const res = await streamChat(sessionId, message, (node) =>
        setLoading((l) => (l && l.sessionId === sessionId ? { ...l, done: [...l.done, node] } : l)),
      );
      turn = { id: nextTurnId.current++, role: "assistant", res };
    } catch (err) {
      turn = { id: nextTurnId.current++, role: "error", text: `Request failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    updateSession(sessionId, (s) => ({
      ...s,
      turns: [...s.turns, turn],
      selectedTurnId: turn.role === "assistant" ? turn.id : s.selectedTurnId,
    }));
    setLoading(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function newSession() {
    if (loading) return;
    setActiveId(null);
    setInput("");
  }

  const selectedTurn = turns.find((t): t is Extract<Turn, { role: "assistant" }> => t.role === "assistant" && t.id === active?.selectedTurnId);
  const answerCount = turns.filter((t) => t.role === "assistant").length;
  const summaries: SessionSummary[] = sessions
    .filter((s) => s.turns.length > 0)
    .map((s) => {
      const answers = s.turns.filter((t): t is Extract<Turn, { role: "assistant" }> => t.role === "assistant");
      const last = answers.at(-1)?.res;
      const first = s.turns.find((t) => t.role === "user");
      return {
        id: s.id,
        title: first && first.role === "user" ? first.text : "New session",
        city: last?.location?.name ?? null,
        createdAt: s.createdAt,
        lastSop: last?.sop?.id ?? null,
      };
    });
  const healthOk = health?.code === 200;

  return (
    <div className="console">
      <header className="header" style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--color-divider)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginRight: "auto", minWidth: 0 }}>
          <div className="blueprint" style={{ width: 32, height: 32, flex: "none", display: "grid", placeItems: "center", fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 15, color: "var(--color-accent-700)" }}>
            BW
            <Corners which={["tl", "br"]} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1, minWidth: 0 }}>
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 19, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Brainwave Weather Advisory</span>
            <span className="eyebrow hide-sm" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Policy-grounded outdoor safety console</span>
          </div>
        </div>
        <nav className="nav-links" style={{ gap: 20, alignItems: "center", whiteSpace: "nowrap", fontSize: 14 }}>
          <a href="#" aria-current="page" style={{ color: "var(--color-accent)", textDecoration: "none" }}>Console</a>
          <button type="button" onClick={() => setPoliciesOpen(true)} style={{ all: "unset", cursor: "pointer" }}>
            Policies <span style={{ fontSize: 11, color: "var(--color-neutral-700)" }}>{sops?.length ?? "…"}</span>
          </button>
          <a href={EVALS_URL} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>Evaluations</a>
          <a href="/api/health" target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>API</a>
        </nav>
        <div className="only-wide" style={{ alignItems: "center", gap: 8, fontSize: 12, color: "var(--color-neutral-800)", paddingLeft: 20, borderLeft: "1px solid var(--color-divider)", whiteSpace: "nowrap" }} title={health?.body ? `LLM: ${health.body.llm_mode}` : undefined}>
          <span style={{ width: 7, height: 7, display: "inline-block", background: health === null ? "var(--color-neutral-500)" : healthOk ? "var(--color-accent)" : "var(--color-accent-900)" }} />
          {health === null ? "Checking API…" : healthOk ? `Open-Meteo live · /api/health ${health.code}` : `/api/health ${health.code || "unreachable"}`}
        </div>
        <button type="button" className="btn btn-secondary only-narrow" onClick={() => setInspectorOpen((o) => !o)}>Inspector</button>
        <button type="button" className="btn btn-secondary" onClick={newSession} disabled={loading !== null} aria-label="New session">
          <Icon d="M12 5v14M5 12h14" size={15} />
          <span className="hide-sm">New session</span>
        </button>
      </header>

      <div className="console-body">
        <Rail sessions={summaries} activeId={activeId ?? ""} onOpen={(id) => !loading && setActiveId(id)} sops={sops} now={now} />

        <main style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
          <div className="pad-x" style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 10, paddingBottom: 10, borderBottom: "1px solid var(--color-divider)", fontSize: 12, color: "var(--color-neutral-700)", flexWrap: "wrap" }}>
            <span className="mono">session {activeId ? activeId.slice(0, 8) : "new"}</span>
            <span>·</span>
            <span>{answerCount} {answerCount === 1 ? "answer" : "answers"}</span>
            <span className="hide-sm" style={{ marginLeft: "auto" }}>Answers come only from written SOPs + live Open-Meteo data</span>
          </div>

          <div ref={scrollRef} className="pad-x" style={{ flex: 1, overflow: "auto", paddingTop: 28, paddingBottom: 40, display: "flex", flexDirection: "column", gap: 28 }}>
            {turns.length === 0 && !isLoadingHere && (
              <div style={{ maxWidth: 720, margin: "48px auto 0", width: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <h6 style={{ color: "var(--color-accent-700)", marginBottom: 8 }}>New session</h6>
                  <h1 style={{ fontSize: 44, margin: "0 0 8px", textWrap: "balance" }}>Ask about an outdoor plan. Include a city.</h1>
                  <p style={{ color: "var(--color-neutral-800)", maxWidth: 560, textWrap: "pretty" }}>
                    The bot reads the forecast for the window you mean, checks it against {sops?.length ?? "the"} written policies, and shows exactly which rule and which numbers drove the answer.
                  </p>
                </div>
                <div className="examples">
                  {EXAMPLES.map(([kicker, text]) => (
                    <button key={text} type="button" className="blueprint hover-accent" onClick={() => void send(text)} style={{ cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit", background: "transparent", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6.8 }}>
                      <Corners />
                      <span className="card-kicker">{kicker}</span>
                      <span style={{ fontSize: 15, lineHeight: 1.4 }}>{text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((t) => (
              <div key={t.id} style={{ maxWidth: 880, width: "100%", margin: "0 auto" }}>
                {t.role === "user" && (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ maxWidth: "85%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <span className="eyebrow">You</span>
                      <div style={{ background: "var(--color-accent-100)", color: "var(--color-accent-900)", padding: "10px 14px", fontSize: 15, lineHeight: 1.45, whiteSpace: "pre-wrap", border: "1px solid var(--color-accent-200)" }}>{t.text}</div>
                    </div>
                  </div>
                )}
                {t.role === "error" && (
                  <div role="alert" className="blueprint" style={{ padding: "12px 16px", fontSize: 14, color: "var(--color-accent-900)" }}>
                    <Corners which={["tl", "br"]} />
                    {t.text}
                  </div>
                )}
                {t.role === "assistant" && (
                  <AnswerCard
                    res={t.res}
                    selected={active?.selectedTurnId === t.id}
                    onInspect={() => {
                      if (active) updateSession(active.id, (s) => ({ ...s, selectedTurnId: t.id }));
                      setInspectorOpen(true);
                    }}
                  />
                )}
              </div>
            ))}

            {isLoadingHere && loading && (
              <div style={{ maxWidth: 880, width: "100%", margin: "0 auto" }}>
                <LoadingCard done={loading.done} />
              </div>
            )}
          </div>

          <form onSubmit={onSubmit} className="pad-x" style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 14, paddingBottom: 18 }}>
            <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
              {turns.length > 0 && !loading && (
                <div style={{ display: "flex", gap: 8, overflowX: "auto", whiteSpace: "nowrap", paddingBottom: 2 }}>
                  {FOLLOW_UPS.map((text) => (
                    <button key={text} type="button" className="tag tag-outline" onClick={() => void send(text)}>{text}</button>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Is it safe to cycle in Bhopal this evening?" maxLength={2000} aria-label="Your question" />
                <button type="submit" className="btn btn-primary blueprint" disabled={loading !== null || !input.trim()} style={{ minWidth: 110, fontSize: 15 }}>
                  <Corners />
                  Send
                  <Icon d="M5 12h14M13 6l6 6-6 6" />
                </button>
              </div>
            </div>
          </form>
        </main>

        <Inspector res={selectedTurn?.res ?? null} open={inspectorOpen} onClose={closeInspector} />
      </div>

      {policiesOpen && <PoliciesDialog sops={sops} onClose={closePolicies} />}
    </div>
  );
}
