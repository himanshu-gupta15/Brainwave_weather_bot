import { getChatService } from "@/lib/chat/service";

/** The live rule set, exactly as loaded (useful when demoing a newly added SOP). */
export async function GET(): Promise<Response> {
  try {
    return Response.json((await getChatService()).deps.policies.get().policies.sops);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
}
