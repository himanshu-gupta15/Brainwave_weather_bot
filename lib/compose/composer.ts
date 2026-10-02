/** Reply composers. Both take `AnswerFacts` and return the text plus which composer produced it. */
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import type { AnswerFacts } from "@/lib/compose/facts";
import { checkGrounding } from "@/lib/compose/guard";
import { renderTemplate } from "@/lib/compose/template";

const SYSTEM_PROMPT = `You write the reply for a weather-safety assistant. The safety decision has
already been made by company policy; your only job is clear, friendly wording.

Rules (all mandatory):
1. Use ONLY the JSON facts you are given. The advice must come from the "advice" text of the listed
   policies. You may shorten or rephrase it, but do not add recommendations, and do not make it
   sound safer or more dangerous than written.
2. Start with the primary policy. If its severity is "critical", lead with the weather situation itself.
3. Cite the primary policy id (e.g. "SOP-003") and the id of any additional policy you mention.
   Never mention any other policy id.
4. Mention the observed values in "evidence" that triggered the policy. Every number you write must
   appear in the facts (rounding to whole numbers is fine). Do not state dates or convert units.
5. If "previous" is present and refers to the same place, you may briefly contrast with it.
6. Plain text, at most 120 words, no headings or bullet lists.`;

export interface Composer {
  compose(facts: AnswerFacts): Promise<{ text: string; composer: string }>;
}

export class TemplateComposer implements Composer {
  async compose(facts: AnswerFacts) {
    return { text: renderTemplate(facts), composer: "template" };
  }
}

export class LLMComposer implements Composer {
  constructor(private readonly model: BaseChatModel) {}

  async compose(facts: AnswerFacts) {
    let text: string;
    try {
      const msg = await this.model.invoke([new SystemMessage(SYSTEM_PROMPT), new HumanMessage(JSON.stringify(facts, null, 2))]);
      text = msg.text.trim();
    } catch (err) {
      console.warn(`[compose] LLM failed, using template: ${err instanceof Error ? err.message : err}`);
      return { text: renderTemplate(facts), composer: "template (llm error)" };
    }
    const problems = checkGrounding(text, facts);
    if (problems.length) {
      console.warn(`[compose] LLM reply rejected by grounding guard: ${problems.join("; ")} | reply=${JSON.stringify(text)}`);
      return { text: renderTemplate(facts), composer: `template (llm reply rejected: ${problems.join("; ")})` };
    }
    return { text, composer: "llm" };
  }
}
