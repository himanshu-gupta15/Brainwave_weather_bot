/** Builds the graph from settings and runs one chat turn per call. */
import { initChatModel } from "langchain/chat_models/universal";

import { type Composer, LLMComposer, TemplateComposer } from "@/lib/compose/composer";
import { loadSettings, type Settings } from "@/lib/config";
import { buildGraph, type WeatherGraph } from "@/lib/graph/builder";
import type { GraphDeps } from "@/lib/graph/nodes";
import { type DecisionLogEntry, turnInput } from "@/lib/graph/state";
import type { IntentExtractor } from "@/lib/intent/intent";
import { KeywordIntentExtractor } from "@/lib/intent/keywordExtractor";
import { LLMIntentExtractor } from "@/lib/intent/llmExtractor";
import { PolicyStore } from "@/lib/sop/schema";
import { OpenMeteoClient, type WeatherClient } from "@/lib/weather/openMeteo";
import type { ChatResponse } from "@/types/api";

export async function buildDeps(settings: Settings, weather?: WeatherClient): Promise<GraphDeps> {
  let extractor: IntentExtractor;
  let composer: Composer;
  if (settings.llmEnabled) {
    const model = await initChatModel(settings.llmModel, { modelProvider: settings.llmProvider, temperature: 0 });
    extractor = new LLMIntentExtractor(model);
    composer = new LLMComposer(model);
    console.info(`[chat] LLM mode: ${settings.llmProvider} / ${settings.llmModel}`);
  } else {
    extractor = new KeywordIntentExtractor();
    composer = new TemplateComposer();
    console.warn(`[chat] no API key for provider "${settings.llmProvider}": deterministic keyword/template mode`);
  }
  return {
    weather: weather ?? new OpenMeteoClient(settings.httpTimeoutMs),
    extractor,
    composer,
    policies: new PolicyStore(settings.sopsPath, settings.taxonomyPath),
  };
}

export class ChatService {
  readonly graph: WeatherGraph;

  constructor(readonly deps: GraphDeps) {
    this.graph = buildGraph(deps);
  }

  /** One turn. The session id is the LangGraph thread id, so the checkpointer restores earlier turns. */
  async chat(sessionId: string, message: string): Promise<ChatResponse> {
    const config = { configurable: { thread_id: sessionId } };
    const path: string[] = [];
    for await (const update of await this.graph.stream(turnInput(message), { ...config, streamMode: "updates" })) {
      path.push(...Object.keys(update));
    }
    const state = (await this.graph.getState(config)).values as {
      result: Omit<ChatResponse, "session_id" | "turn" | "graph_path"> | null;
      decisionLog: DecisionLogEntry[];
    };
    if (!state.result) throw new Error("graph finished without a result");
    return { session_id: sessionId, turn: state.decisionLog.length, ...state.result, graph_path: path };
  }

  async history(sessionId: string): Promise<DecisionLogEntry[]> {
    const state = await this.graph.getState({ configurable: { thread_id: sessionId } });
    return (state.values as { decisionLog?: DecisionLogEntry[] }).decisionLog ?? [];
  }
}

// One service per server process. Kept on globalThis so Next.js dev-mode hot
// reloads don't wipe in-memory sessions on every file save.
const globalForChat = globalThis as unknown as { chatService?: Promise<ChatService> };

export function getChatService(): Promise<ChatService> {
  globalForChat.chatService ??= buildDeps(loadSettings()).then((deps) => new ChatService(deps));
  return globalForChat.chatService;
}
