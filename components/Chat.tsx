"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { PolicyEvidence } from "@/components/PolicyEvidence";
import type { ChatResponse, ErrorResponse } from "@/types/api";

type Turn =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; res: ChatResponse }
  | { id: number; role: "error"; text: string };

const EXAMPLES = [
  "Is it safe to cycle in Bhopal today?",
  "Should I take my kid to the park in Delhi this afternoon?",
  "Is today a good day for a picnic in Mumbai?",
  "Can I travel by bike in Chennai this evening?",
];

const newSessionId = () => crypto.randomUUID();

export function Chat() {
  // Session id lives only in memory: reloading the page or "New chat" starts a fresh session.
  const sessionId = useRef<string | null>(null);
  const nextId = useRef(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || loading) return;
    sessionId.current ??= newSessionId();
    setTurns((t) => [...t, { id: nextId.current++, role: "user", text: message }]);
    setInput("");
    setLoading(true);
    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId.current, message }),
      });
      const body: ChatResponse | ErrorResponse = await resp.json();
      if (!resp.ok || "error" in body) {
        throw new Error("error" in body ? body.error : `HTTP ${resp.status}`);
      }
      setTurns((t) => [...t, { id: nextId.current++, role: "assistant", res: body }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTurns((t) => [...t, { id: nextId.current++, role: "error", text: `Request failed: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function newChat() {
    sessionId.current = null;
    setTurns([]);
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div>
          <h1 className="text-base font-semibold">Weather-Advisory Support Bot</h1>
          <p className="text-xs text-zinc-500">Answers come only from written policies (SOPs) + live Open-Meteo data.</p>
        </div>
        <button
          type="button"
          onClick={newChat}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          New chat
        </button>
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {turns.length === 0 && (
          <div className="mt-8 space-y-3 text-center">
            <p className="text-sm text-zinc-500">Ask about an outdoor plan. Include a city. Try:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void send(ex)}
                  className="rounded-full border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn) =>
          turn.role === "user" ? (
            <div key={turn.id} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2 text-sm text-white">
                {turn.text}
              </div>
            </div>
          ) : turn.role === "error" ? (
            <div key={turn.id} role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {turn.text}
            </div>
          ) : (
            <div key={turn.id} className="flex justify-start">
              <div className="w-full max-w-[95%] rounded-2xl rounded-bl-sm border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="whitespace-pre-line text-sm leading-relaxed">{turn.res.answer}</p>
                <PolicyEvidence res={turn.res} />
              </div>
            </div>
          ),
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-zinc-500" aria-live="polite">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-zinc-400" />
            Checking live weather and policies…
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Is it safe to cycle in Bhopal this evening?"
          maxLength={2000}
          aria-label="Your question"
          className="flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
