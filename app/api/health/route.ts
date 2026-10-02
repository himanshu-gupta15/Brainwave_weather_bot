import { getChatService } from "@/lib/chat/service";
import { loadSettings } from "@/lib/config";

export async function GET(): Promise<Response> {
  const settings = loadSettings();
  let sops: number | string;
  try {
    sops = (await getChatService()).deps.policies.get().policies.sops.length;
  } catch (err) {
    sops = `invalid: ${err instanceof Error ? err.message : String(err)}`;
  }
  return Response.json({
    status: "ok",
    llm_mode: settings.llmEnabled ? `${settings.llmProvider}/${settings.llmModel}` : "disabled (keyword/template)",
    sops_loaded: sops,
  });
}
