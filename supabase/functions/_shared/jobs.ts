import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.57.4";
export interface JobResult {
  rows: number;
  status?: "success" | "partial";
  code?: string;
  details?: Record<string, unknown>;
}
export class JobError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function serverClient(url: string, key: string) {
  return createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal ?? AbortSignal.timeout(15000),
        }),
    },
  });
}
export async function scheduledJob(
  req: Request,
  job: string,
  task: (db: SupabaseClient) => Promise<JobResult>,
): Promise<Response> {
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
  let lease: string | null = null,
    runId: string | null = null;
  try {
    const { data: allowed, error: authError } = await db.rpc(
      "verify_collector_token",
      { p_token: req.headers.get("x-collector-token") ?? "" },
    );
    if (authError || allowed !== true)
      return reply({ error: "unauthorized" }, 401);
    const { data: claimed, error: claimError } = await db.rpc(
      "claim_automation_job",
      { p_job: job },
    );
    if (claimError) throw new JobError("job_claim_failed");
    if (!claimed)
      return reply(
        { status: "skipped", reason: "cooldown_disabled_or_running" },
        202,
      );
    lease = claimed;
    const { data: run, error: runError } = await db
      .from("automation_runs")
      .insert({ job, status: "started" })
      .select("id")
      .single();
    if (runError) throw new JobError("job_log_failed");
    runId = run.id;
    const result = await task(db);
    const status = result.status ?? "success";
    const { error: finishError } = await db
      .from("automation_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        rows_written: result.rows,
        error_code: result.code ?? null,
      })
      .eq("id", runId);
    if (finishError) throw new JobError("job_log_failed");
    return reply({
      status,
      rowsWritten: result.rows,
      ...(result.code ? { code: result.code } : {}),
      ...result.details,
    });
  } catch (error) {
    const code = error instanceof JobError ? error.code : "automation_failed";
    console.error(`${job}:${code}`);
    if (runId)
      await db
        .from("automation_runs")
        .update({
          status: "error",
          error_code: code,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
    return reply({ error: code }, 503);
  } finally {
    if (lease) {
      const { error } = await db.rpc("finish_automation_job", {
        p_job: job,
        p_token: lease,
      });
      if (error) console.error(`${job}:lease_release_failed`);
    }
  }
}
export async function storePayload(
  db: SupabaseClient,
  sourceId: string,
  url: string,
  text: string,
): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  const hash = [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const { error } = await db
    .from("ingestion_payloads")
    .upsert(
      {
        source_id: sourceId,
        source_url: url,
        content_sha256: hash,
        raw_text: text,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "source_id,content_sha256", ignoreDuplicates: true },
    );
  if (error) throw new JobError("payload_store_failed");
  const { data, error: readError } = await db
    .from("ingestion_payloads")
    .select("id")
    .eq("source_id", sourceId)
    .eq("content_sha256", hash)
    .single();
  if (readError || !data) throw new JobError("payload_lookup_failed");
  return data.id;
}
