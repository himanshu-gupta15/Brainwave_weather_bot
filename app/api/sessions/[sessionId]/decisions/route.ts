import { getChatService } from "@/lib/chat/service";

/** Audit trail: which SOP (or failure) each turn of a session resolved to. */
export async function GET(_req: Request, ctx: { params: Promise<{ sessionId: string }> }): Promise<Response> {
  const { sessionId } = await ctx.params;
  return Response.json(await (await getChatService()).history(sessionId));
}
