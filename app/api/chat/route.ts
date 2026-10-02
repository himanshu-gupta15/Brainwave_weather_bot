import { getChatService } from "@/lib/chat/service";
import { PolicyError } from "@/lib/sop/schema";
import type { ChatRequest, ChatResponse, ChatStreamEvent, ErrorResponse } from "@/types/api";

const MAX_MESSAGE_LENGTH = 2000;

function parseRequest(body: unknown): ChatRequest | string {
  if (typeof body !== "object" || body === null) return "body must be a JSON object";
  const { session_id, message, session_state } = body as Record<string, unknown>;
  if (typeof session_id !== "string" || !session_id.trim() || session_id.length > 100) {
    return "session_id must be a non-empty string (max 100 chars)";
  }
  if (typeof message !== "string" || !message.trim() || message.length > MAX_MESSAGE_LENGTH) {
    return `message must be a non-empty string (max ${MAX_MESSAGE_LENGTH} chars)`;
  }
  return { session_id, message: message.trim(), session_state };
}

/** Maps a failure to an HTTP status and a user-safe message. */
function describeError(err: unknown): { status: number; error: string } {
  if (err instanceof PolicyError) {
    // Fail closed: never advise from a broken or partial rule set.
    console.error(`[api] policy load failed: ${err.message}`);
    return { status: 503, error: "Policy rules are currently invalid, so no advice can be given." };
  }
  console.error("[api] chat failed", err);
  return { status: 500, error: "Internal error while answering." };
}

/**
 * Plain JSON by default. With `Accept: application/x-ndjson` the response is a
 * stream of ChatStreamEvent lines: one per graph node as it completes, then the
 * result (used by the UI to show real progress through the graph).
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" } satisfies ErrorResponse, { status: 400 });
  }
  const req = parseRequest(body);
  if (typeof req === "string") return Response.json({ error: req } satisfies ErrorResponse, { status: 400 });

  if (request.headers.get("accept")?.includes("application/x-ndjson")) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: ChatStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        try {
          const service = await getChatService();
          const response = await service.chat(req.session_id, req.message, (node) => send({ type: "node", node }), req.session_state);
          send({ type: "result", response });
        } catch (err) {
          send({ type: "error", ...describeError(err) });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
  }

  try {
    const service = await getChatService();
    const result: ChatResponse = await service.chat(req.session_id, req.message, undefined, req.session_state);
    return Response.json(result);
  } catch (err) {
    const { status, error } = describeError(err);
    return Response.json({ error } satisfies ErrorResponse, { status });
  }
}
