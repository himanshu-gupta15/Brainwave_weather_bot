import path from "node:path";

import { ChatService } from "@/lib/chat/service";
import { type Composer, TemplateComposer } from "@/lib/compose/composer";
import type { IntentExtractor } from "@/lib/intent/intent";
import { KeywordIntentExtractor } from "@/lib/intent/keywordExtractor";
import { type Metrics } from "@/lib/sop/metrics";
import { PolicyStore } from "@/lib/sop/schema";
import { OpenMeteoClient } from "@/lib/weather/openMeteo";
import type { FetchFn } from "@/evals/fakes";

export const SOPS = path.join(process.cwd(), "data", "sops.yaml");
export const TAXONOMY = path.join(process.cwd(), "data", "taxonomy.yaml");

export function makeService(
  fetchFn: FetchFn,
  opts: { extractor?: IntentExtractor; composer?: Composer; sopsPath?: string } = {},
): ChatService {
  return new ChatService({
    weather: new OpenMeteoClient(5000, fetchFn),
    extractor: opts.extractor ?? new KeywordIntentExtractor(),
    composer: opts.composer ?? new TemplateComposer(),
    policies: new PolicyStore(opts.sopsPath ?? SOPS, TAXONOMY),
  });
}

export const CALM: Metrics = {
  temp_max_c: 24,
  temp_min_c: 20,
  feels_like_max_c: 25,
  feels_like_min_c: 21,
  wind_max_kmh: 8,
  gust_max_kmh: 15,
  precip_total_mm: 0,
  precip_prob_max_pct: 5,
  rain_hours: 0,
  uv_max: 2,
  thunderstorm_hours: 0,
  precip_next_24h_mm: 0,
  rain_hours_next_24h: 0,
};
