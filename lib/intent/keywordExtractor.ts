/**
 * No-LLM fallback extractor: word-boundary keyword lookup from taxonomy.yaml.
 *
 * This *is* string matching. It handles synonyms listed in the taxonomy but not
 * genuine paraphrases ("take the Activa out"), and it cannot name outdoor
 * activities outside the taxonomy. It exists so the bot still works, and fails
 * safe, without an API key or when the LLM call errors.
 */
import type { Intent, IntentExtractor, SessionContext } from "@/lib/intent/intent";
import type { Day, Part } from "@/lib/sop/metrics";
import type { Taxonomy } from "@/lib/sop/schema";

const LOCATION_RE =
  /\b(?:in|at|near|around)\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,2}?)(?=\s+(?:today|tomorrow|tonight|this|now|right|later|on|with|in|at|for|during|after|before)\b|[?.!,]|$)/g;
const WHAT_ABOUT_RE = /\b(?:what|how)\s+about\s+(?:in\s+)?([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,2})/g;
const NOT_PLACES = new Set(
  (
    "the a an my our your this that it general rain sun heat morning afternoon evening night today tomorrow " +
    "tonight now work home office school park advance case time kids me us"
  ).split(" "),
);
const TIME_WORDS: [RegExp, Day | null, Part | null][] = [
  [/\btonight\b/i, "today", "night"],
  [/\btomorrow\b/i, "tomorrow", null],
  [/\bmorning\b/i, null, "morning"],
  [/\bafternoon\b/i, null, "afternoon"],
  [/\bevening\b/i, null, "evening"],
  [/\bnight\b/i, null, "night"],
  [/\b(?:right now|now|currently|at the moment)\b/i, null, "now"],
  [/\btoday\b/i, "today", null],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasKeyword = (text: string, keywords: string[]) =>
  keywords.some((kw) => new RegExp(`\\b${escapeRe(kw)}\\b`, "i").test(text));

function findLocation(message: string): string | null {
  for (const re of [WHAT_ABOUT_RE, LOCATION_RE]) {
    for (const m of message.matchAll(re)) {
      const candidate = m[1].replace(/^[\s.'-]+|[\s.'-]+$/g, "");
      if (candidate && !NOT_PLACES.has(candidate.split(/\s+/)[0].toLowerCase())) return candidate;
    }
  }
  return null;
}

export class KeywordIntentExtractor implements IntentExtractor {
  async extract(message: string, context: SessionContext, taxonomy: Taxonomy) {
    const activities = Object.entries(taxonomy.activities)
      .filter(([, e]) => hasKeyword(message, e.keywords))
      .map(([id]) => id);
    const groups = Object.entries(taxonomy.groups)
      .filter(([, e]) => hasKeyword(message, e.keywords))
      .map(([id]) => id);
    let location = findLocation(message);
    let day: Day | null = null;
    let part: Part | null = null;
    for (const [re, d, p] of TIME_WORDS) {
      if (re.test(message)) {
        day = day ?? d;
        part = part ?? p;
      }
    }

    // A bare reply like "Bhopal" to our "which city?" question.
    const words = message.trim().replace(/[?.!]+$/, "").split(/\s+/);
    if (
      location === null &&
      !activities.length &&
      !groups.length &&
      !day &&
      !part &&
      context.activities.length + (context.otherActivity ? 1 : 0) > 0 &&
      words.length >= 1 &&
      words.length <= 3 &&
      words.every((w) => /^[A-Za-z-]+$/.test(w)) &&
      !NOT_PLACES.has(words[0].toLowerCase())
    ) {
      location = words.join(" ");
    }

    const intent: Intent = {
      relevant: Boolean(activities.length || groups.length || location || day || part),
      location,
      activities,
      other_activity: null,
      groups,
      day,
      part_of_day: part,
    };
    return { intent, source: "keywords" };
  }
}
