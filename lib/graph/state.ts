/**
 * LangGraph state.
 *
 * Persisted across turns (by the checkpointer, keyed by session id):
 *   messages     - chat transcript
 *   context      - structured facts carried between turns (SessionContext)
 *   decisionLog  - one audit record per turn (which SOP / failure / reason)
 *
 * Per-turn fields are reset by `turnInput()` at the start of every request.
 */
import { type BaseMessage, HumanMessage } from "@langchain/core/messages";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";

import { EMPTY_CONTEXT, type Intent, type SessionContext } from "@/lib/intent/intent";
import type { Match } from "@/lib/sop/engine";
import type { Metrics, Window } from "@/lib/sop/metrics";
import type { Forecast, Location, WeatherFailureKind } from "@/lib/weather/openMeteo";
import type { ChatResponse } from "@/types/api";

export interface DecisionLogEntry {
  userMessage: string;
  status: ChatResponse["status"];
  reason: string | null;
  sopId: string | null;
  matchedSopIds: string[];
  window: string | null;
  location: string | null;
}

export type TurnResult = Omit<ChatResponse, "session_id" | "turn" | "graph_path" | "session_state" | "resumed">;

/** Routes set by deciding nodes and read by the conditional edges. */
export type Route =
  | "resolve"
  | "need_location"
  | "off_topic"
  | "ok"
  | "failed"
  | "matched"
  | "no_match"
  | "window_past";

const lastValue = <T>(initial: T) => Annotation<T>({ reducer: (_prev: T, next: T) => next, default: () => initial });

export const GraphStateAnnotation = Annotation.Root({
  // persisted
  messages: Annotation<BaseMessage[]>({ reducer: messagesStateReducer, default: () => [] }),
  context: lastValue<SessionContext>(EMPTY_CONTEXT),
  decisionLog: Annotation<DecisionLogEntry[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  // per turn
  userMessage: lastValue<string>(""),
  intent: lastValue<Intent | null>(null),
  intentSource: lastValue<string | null>(null),
  route: lastValue<Route | null>(null),
  location: lastValue<Location | null>(null),
  forecast: lastValue<Forecast | null>(null),
  failure: lastValue<{ kind: WeatherFailureKind; detail: string } | null>(null),
  window: lastValue<Window | null>(null),
  metrics: lastValue<Metrics | null>(null),
  matches: lastValue<Match[] | null>(null),
  primary: lastValue<Match | null>(null),
  secondary: lastValue<Match[] | null>(null),
  result: lastValue<TurnResult | null>(null),
});

export type GraphState = typeof GraphStateAnnotation.State;
export type GraphUpdate = typeof GraphStateAnnotation.Update;

export function turnInput(message: string): GraphUpdate {
  return {
    messages: [new HumanMessage(message)],
    userMessage: message,
    intent: null,
    intentSource: null,
    route: null,
    location: null,
    forecast: null,
    failure: null,
    window: null,
    metrics: null,
    matches: null,
    primary: null,
    secondary: null,
    result: null,
  };
}
