import { scheduledJob, storePayload, JobError } from "../_shared/jobs.ts";
import { CanonicalJsonProvider } from "../_shared/quoteAdapters.ts";
import { normalizeProviderQuote } from "../_shared/providers.ts";
export async function handler(req: Request): Promise<Response> {
  return scheduledJob(req, "collect-quotes", async (db) => {
    const { data: configs, error } = await db.rpc("get_quote_adapters");
    if (error) throw new JobError("quote_adapter_registry_unavailable");
    if (!Array.isArray(configs) || !configs.length)
      return {
        rows: 0,
        status: "partial",
        code: "quote_sources_not_configured",
      };
    let rows = 0,
      failed = 0,
      blocked = 0;
    for (const config of configs.slice(0, 5)) {
      if (
        config.billing_mode === "licensed" &&
        Deno.env.get("ALLOW_LICENSED_QUOTE_REQUESTS") !== "true"
      ) {
        blocked++;
        continue;
      }
      const headers: Record<string, string> = { Accept: "application/json" };
      if (config.api_key_env) {
        if (!/^QUOTE_[A-Z0-9_]+_API_KEY$/.test(config.api_key_env)) {
          failed++;
          continue;
        }
        const key = Deno.env.get(config.api_key_env);
        if (!key) {
          blocked++;
          continue;
        }
        headers.Authorization = `Bearer ${key}`;
      }
      try {
        const provider = new CanonicalJsonProvider(
          config.source_id,
          config.endpoint,
          config.allowed_hosts,
          headers,
        );
        const payload = await provider.fetchQuotes(AbortSignal.timeout(15000));
        const quotes = provider.parse(payload);
        await storePayload(
          db,
          config.source_id,
          config.endpoint,
          JSON.stringify(payload),
        );
        const { data: source, error: sourceError } = await db
          .from("data_sources")
          .select("quality_score")
          .eq("id", config.source_id)
          .single();
        if (sourceError) throw new JobError("source_not_found");
        const { data: written, error: writeError } = await db
          .from("price_quotations")
          .upsert(
            quotes.map((q) =>
              normalizeProviderQuote(q, Number(source.quality_score)),
            ),
            {
              onConflict:
                "metal_id,source_id,quoted_at,region,market_type,grade,product_form,composition,price_type,country,purity,element_content,delivery_terms",
              ignoreDuplicates: true,
            },
          )
          .select("id");
        if (writeError) throw new JobError("quote_write_failed");
        const { error: statusError } = await db
          .from("data_sources")
          .update({
            status: "connected",
            last_success_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", config.source_id);
        if (statusError) throw new JobError("source_status_failed");
        rows += written?.length ?? 0;
      } catch {
        failed++;
        await db
          .from("data_sources")
          .update({ status: "error", last_error: "source_collection_failed" })
          .eq("id", config.source_id);
      }
    }
    return {
      rows,
      status: failed || blocked ? "partial" : "success",
      ...(failed
        ? { code: "quote_sources_failed" }
        : blocked
          ? { code: "quote_sources_require_access" }
          : {}),
      details: { failedSources: failed, blockedSources: blocked },
    };
  });
}
