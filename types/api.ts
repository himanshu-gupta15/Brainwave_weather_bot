/** REST contract for POST /api/chat, shared by the route handler and the UI. */

export type ChatStatus = "answered" | "no_guidance" | "data_unavailable" | "needs_clarification";

export interface ChatRequest {
  session_id: string;
  message: string;
}

export interface SopRef {
  id: string;
  title: string;
  category: string;
  severity: "low" | "moderate" | "high" | "critical";
  priority: number;
  advice: string;
}

export interface EvidenceItem {
  sop_id: string;
  metric: string;
  label: string;
  value: number;
  unit: string;
  condition: string;
  signals: string[];
}

export interface WeatherValue {
  metric: string;
  label: string;
  value: number;
  unit: string;
}

export interface LocationInfo {
  name: string;
  latitude: number;
  longitude: number;
  country: string | null;
  admin1: string | null;
  timezone: string | null;
}

export interface WindowInfo {
  label: string;
  day: string;
  part: string;
  start: string;
  end: string;
}

export interface IntentInfo {
  location_query: string | null;
  activities: string[];
  other_activity: string | null;
  groups: string[];
  day: string;
  part_of_day: string;
  source: string | null;
}

export interface ChatResponse {
  session_id: string;
  turn: number;
  status: ChatStatus;
  answer: string;
  /** Machine-readable reason for non-answers, e.g. "weather_unavailable", "no_matching_policy". */
  reason: string | null;
  /** The SOP the answer is grounded in (null when no SOP applies). */
  sop: SopRef | null;
  additional_sops: SopRef[];
  /** Every SOP whose conditions matched, in rank order (audit trail). */
  matched_sop_ids: string[];
  evidence: EvidenceItem[];
  /** Window metrics computed from the Open-Meteo response for this request. */
  weather: WeatherValue[] | null;
  location: LocationInfo | null;
  window: WindowInfo | null;
  intent: IntentInfo;
  /** "template", "llm", or "template (llm reply rejected: ...)". */
  composer: string;
  graph_path: string[];
}

export interface ErrorResponse {
  error: string;
}
