/**
 * Graph wiring. All branching lives here as explicit conditional edges.
 *
 *   START -> parseQuery
 *   parseQuery       --resolve-->       resolveLocation
 *                    --need_location--> askClarification
 *                    --off_topic-->     noGuidance
 *   resolveLocation  --ok-->            fetchWeather
 *                    --failed-->        dataUnavailable
 *   fetchWeather     --ok-->            evaluatePolicies
 *                    --failed-->        dataUnavailable
 *   evaluatePolicies --matched-->       selectSop -> composeResponse
 *                    --no_match-->      noGuidance
 *                    --window_past-->   askClarification
 *   composeResponse | noGuidance | dataUnavailable | askClarification -> END
 */
import { type BaseCheckpointSaver, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";

import { type GraphDeps, Nodes } from "@/lib/graph/nodes";
import { type GraphState, GraphStateAnnotation, type Route } from "@/lib/graph/state";

function route(state: GraphState): Route {
  if (!state.route) throw new Error("deciding node did not set a route");
  return state.route;
}

export function buildGraph(deps: GraphDeps, checkpointer: BaseCheckpointSaver = new MemorySaver()) {
  const n = new Nodes(deps);
  return new StateGraph(GraphStateAnnotation)
    .addNode("parseQuery", n.parseQuery)
    .addNode("resolveLocation", n.resolveLocation)
    .addNode("fetchWeather", n.fetchWeather)
    .addNode("evaluatePolicies", n.evaluatePolicies)
    .addNode("selectSop", n.selectSop)
    .addNode("composeResponse", n.composeResponse)
    .addNode("noGuidance", n.noGuidance)
    .addNode("dataUnavailable", n.dataUnavailable)
    .addNode("askClarification", n.askClarification)
    .addEdge(START, "parseQuery")
    .addConditionalEdges("parseQuery", route, {
      resolve: "resolveLocation",
      need_location: "askClarification",
      off_topic: "noGuidance",
    })
    .addConditionalEdges("resolveLocation", route, { ok: "fetchWeather", failed: "dataUnavailable" })
    .addConditionalEdges("fetchWeather", route, { ok: "evaluatePolicies", failed: "dataUnavailable" })
    .addConditionalEdges("evaluatePolicies", route, {
      matched: "selectSop",
      no_match: "noGuidance",
      window_past: "askClarification",
    })
    .addEdge("selectSop", "composeResponse")
    .addEdge("composeResponse", END)
    .addEdge("noGuidance", END)
    .addEdge("dataUnavailable", END)
    .addEdge("askClarification", END)
    .compile({ checkpointer });
}

export type WeatherGraph = ReturnType<typeof buildGraph>;
