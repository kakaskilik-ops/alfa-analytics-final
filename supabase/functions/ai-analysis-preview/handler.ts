/** Private test entrypoint: NOT part of the production deploy list, UI or Cron. */
import { serverClient } from "../_shared/jobs.ts";
import { limitedText } from "../_shared/network.ts";
import { parseAiInput } from "../_shared/analysis.ts";
import { buildMarketEvidence } from "../_shared/marketEvidence.ts";
import {
  analyseVerifiedFacts,
  renderVerifiedReport,
  ModelError,
} from "../_shared/marketAnalyst.ts";
import { buildAnalysisPacket } from "../_shared/analysisPacket.ts";
export async function handler(req: Request) {
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return reply({ error: "not_configured" }, 503);
  const db = serverClient(url, key);
  const { data: authorized, error } = await db.rpc("verify_collector_token", {
    p_token: req.headers.get("x-collector-token") ?? "",
  });
  if (error || authorized !== true)
    return reply({ error: "unauthorized" }, 401);
  let body, input;
  try {
    body = JSON.parse(await limitedText(new Response(req.body), 24576));
    input = parseAiInput(body);
  } catch {
    return reply({ error: "invalid_input" }, 400);
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("private-professional-analysis-preview-v3"),
  );
  const guestId = [...new Uint8Array(digest)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const { data: quota, error: quotaError } = await db.rpc(
    "consume_guest_ai_quota",
    {
      p_visitor_hash: guestId,
      p_nonce: crypto.randomUUID().replaceAll("-", ""),
    },
  );
  if (quotaError || !quota)
    return reply({ error: "preview_limit_or_cooldown" }, 429);
  let rejectedDraft: string | undefined, completionMeta: unknown;
  try {
    const evidence = await buildMarketEvidence(db, input);
    const packet = buildAnalysisPacket(evidence.analytics, evidence.facts);
    if (body.dryRun === true)
      return reply({
        analytics: evidence.analytics,
        packetBytes: new TextEncoder().encode(JSON.stringify(packet)).length,
        facts: evidence.facts.length,
      });
    const result = await analyseVerifiedFacts(db, {
      facts: evidence.facts,
      analytics: evidence.analytics,
      question: input.question,
      scope: {
        period: input.period,
        window: evidence.analytics.window,
        metalIds: evidence.metalIds,
        preview: "v3",
      },
      guestId,
      messages: input.messages,
      onModelDraft: (raw, meta) => {
        rejectedDraft = raw;
        completionMeta = meta;
      },
    });
    return reply({
      text: renderVerifiedReport(result.report),
      report: result.report,
      cached: result.cached,
    });
  } catch (e) {
    return reply(
      {
        error: e instanceof ModelError ? e.code : "preview_failed",
        detail: e instanceof ModelError ? e.detail : undefined,
        ...(body.debug === true ? { rejectedDraft, completionMeta } : {}),
      },
      503,
    );
  }
}
