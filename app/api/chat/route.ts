import { getChatService } from "@/lib/chat/service";
import { PolicyError } from "@/lib/sop/schema";
import type { ChatRequest, ChatResponse, ErrorResponse } from "@/types/api";

const MAX_MESSAGE_LENGTH = 2000;

function parseRequest(body: unknown): ChatRequest | string {
  if (typeof body !== "object" || body === null) return "body must be a JSON object";
  const { session_id, message } = body as Record<string, unknown>;
  if (typeof session_id !== "string" || !session_id.trim() || session_id.length > 100) {
    return "session_id must be a non-empty string (max 100 chars)";
  }
  if (typeof message !== "string" || !message.trim() || message.length > MAX_MESSAGE_LENGTH) {
    return `message must be a non-empty string (max ${MAX_MESSAGE_LENGTH} chars)`;
  }
  return { session_id, message: message.trim() };
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" } satisfies ErrorResponse, { status: 400 });
  }
  const req = parseRequest(body);
  if (typeof req === "string") return Response.json({ error: req } satisfies ErrorResponse, { status: 400 });

  try {
    const service = await getChatService();
    const result: ChatResponse = await service.chat(req.session_id, req.message);
    return Response.json(result);
  } catch (err) {
    if (err instanceof PolicyError) {
      // Fail closed: never advise from a broken or partial rule set.
      console.error(`[api] policy load failed: ${err.message}`);
      return Response.json(
        { error: "Policy rules are currently invalid, so no advice can be given." } satisfies ErrorResponse,
        { status: 503 },
      );
    }
    console.error("[api] chat failed", err);
    return Response.json({ error: "Internal error while answering." } satisfies ErrorResponse, { status: 500 });
  }
}
