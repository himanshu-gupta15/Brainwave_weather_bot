/** What the user is asking about, and how it carries across turns. */
import { z } from "zod";

import type { Day, Part } from "@/lib/sop/metrics";
import type { Taxonomy } from "@/lib/sop/schema";
import type { Location } from "@/lib/weather/openMeteo";

/**
 * Facts extracted from the *current* message only. Empty/null fields mean "not
 * mentioned in this message" and are inherited from the session by `merge`.
 */
export const IntentSchema = z.object({
  relevant: z
    .boolean()
    .describe(
      "True if the message asks (or follows up) about weather/safety for an outdoor plan, or supplies a " +
        "location/time for an earlier question. False for unrelated chit-chat or other topics.",
    ),
  location: z.string().nullable().describe("Place name exactly as the user wrote it, or null."),
  activities: z.array(z.string()).describe("Activity ids from the allowed list."),
  other_activity: z
    .string()
    .nullable()
    .describe("Short name of an outdoor activity that is NOT in the allowed list, else null."),
  groups: z.array(z.string()).describe("Group ids from the allowed list."),
  day: z.enum(["today", "tomorrow"]).nullable(),
  part_of_day: z.enum(["now", "morning", "afternoon", "evening", "night", "all_day"]).nullable(),
});
export type Intent = z.infer<typeof IntentSchema>;

export interface LastDecision {
  windowLabel: string;
  sopId: string | null;
  sopTitle: string | null;
  locationLabel: string | null;
}

/** Structured facts carried between turns of one chat session. */
export interface SessionContext {
  locationQuery: string | null;
  resolvedLocation: Location | null; // cached geocode for locationQuery
  activities: string[];
  otherActivity: string | null;
  groups: string[];
  day: Day;
  partOfDay: Part;
  lastDecision: LastDecision | null;
}

export const EMPTY_CONTEXT: SessionContext = {
  locationQuery: null,
  resolvedLocation: null,
  activities: [],
  otherActivity: null,
  groups: [],
  day: "today",
  partOfDay: "now",
  lastDecision: null,
};

export interface IntentExtractor {
  /** Returns the intent and which extractor produced it (for the audit trail). */
  extract(message: string, context: SessionContext, taxonomy: Taxonomy): Promise<{ intent: Intent; source: string }>;
}

/**
 * Drop any id the taxonomy doesn't define, so an extractor (or a prompt
 * injection steering it) can never invent a category. Free text that will be
 * echoed back (other_activity) is length- and charset-limited.
 */
export function sanitize(intent: Intent, taxonomy: Taxonomy): Intent {
  let activities = [...new Set(intent.activities)].filter((a) => a in taxonomy.activities);
  const groups = [...new Set(intent.groups)].filter((g) => g in taxonomy.groups);
  if (activities.length > 1) activities = activities.filter((a) => a !== "general_outdoor");
  const other = intent.other_activity?.replace(/[^\p{L}\p{N} '-]/gu, "").trim().slice(0, 40) || null;
  return { ...intent, activities, groups, other_activity: other };
}

/**
 * Deterministic follow-up handling.
 * - location: a new one replaces the old (and drops the cached geocode).
 * - activity: a newly named activity starts a new topic; otherwise inherited.
 * - groups: inherited only when the message doesn't start a new activity topic
 *   ("what about with my kids?" keeps cycling and adds children).
 * - time: if the message mentions any time, use it (default day=today,
 *   part=all_day); otherwise inherit ("what about Pune?" keeps "this evening").
 */
export function merge(prev: SessionContext, intent: Intent): SessionContext {
  const newTopic = intent.activities.length > 0 || intent.other_activity !== null;
  const locationChanged =
    intent.location !== null &&
    (prev.locationQuery === null || intent.location.trim().toLowerCase() !== prev.locationQuery.trim().toLowerCase());
  const mentionsTime = intent.day !== null || intent.part_of_day !== null;
  return {
    locationQuery: locationChanged ? intent.location : prev.locationQuery,
    resolvedLocation: locationChanged ? null : prev.resolvedLocation,
    activities: newTopic ? intent.activities : prev.activities,
    otherActivity: newTopic ? intent.other_activity : prev.otherActivity,
    groups: intent.groups.length ? intent.groups : newTopic ? [] : prev.groups,
    day: mentionsTime ? (intent.day ?? "today") : prev.day,
    partOfDay: mentionsTime ? (intent.part_of_day ?? "all_day") : prev.partOfDay,
    lastDecision: prev.lastDecision,
  };
}
