import { serverClient } from "../_shared/jobs.ts";
import { limitedText } from "../_shared/network.ts";
import {
  MONITOR_SOURCES,
  monitorRequest,
  parseTed,
  parseUsaspending,
  parseContractsFinderRelease,
  mergeOcds,
  record,
  array,
  type MonitorSourceId,
} from "../../../shared/monitorSources.ts";
import { monitorStory } from "../../../shared/monitor.ts";
export class MonitorSourceError extends Error {
  constructor(
    readonly code: string,
    readonly retryAfter: string | null = null,
  ) {
    super(code);
  }
}
export async function fetchMonitorSource(
  url: string,
  host: string,
  method: string,
  body: unknown,
  fetcher: typeof fetch = fetch,
) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    u.hostname !== host ||
    u.username ||
    u.password ||
    u.port
  )
    throw new MonitorSourceError("monitor_host_rejected");
  const response = await fetcher(u, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "ALFA-Market-Monitor/1.0",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const retry = response.headers.get("retry-after");
    await response.body?.cancel();
    let retryAfter = null;
    if (retry) {
      const n = /^\d+$/.test(retry)
        ? Date.now() + Number(retry) * 1000
        : Date.parse(retry);
      if (Number.isFinite(n) && n > Date.now())
        retryAfter = new Date(n).toISOString();
    }
    throw new MonitorSourceError(
      response.status === 429
        ? "monitor_rate_limited"
        : "monitor_source_http_error",
      retryAfter,
    );
  }
  try {
    return JSON.parse(await limitedText(response, 2000000));
  } catch {
    throw new MonitorSourceError("monitor_invalid_or_oversized_json");
  }
}
export async function handler(req: Request) {
  const reply = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
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
  const auth = await db.rpc("verify_collector_token", {
    p_token: req.headers.get("x-collector-token") ?? "",
  });
  if (auth.error || auth.data !== true)
    return reply({ error: "unauthorized" }, 401);
  let selected: MonitorSourceId | undefined;
  try {
    if (req.body) {
      const body = JSON.parse(await limitedText(new Response(req.body), 1024));
      if (body.source !== undefined) {
        if (!MONITOR_SOURCES.some((s) => s.id === body.source)) throw Error();
        selected = body.source;
      }
    }
  } catch {
    return reply({ error: "invalid_monitor_request" }, 400);
  }
  const started = Date.now(),
    results = [];
  for (const source of MONITOR_SOURCES.filter(
    (s) => !selected || s.id === selected,
  )) {
    if (Date.now() - started > 55000) break;
    const claim = await db.rpc("monitor_begin", { p_source: source.id });
    if (claim.error) {
      results.push({ source: source.id, error: "monitor_claim_failed" });
      continue;
    }
    if (!claim.data) {
      results.push({ source: source.id, status: "skipped" });
      continue;
    }
    const state = record(claim.data);
    let cursor = record(state.cursor),
      seen = 0,
      changed = 0,
      status = "success",
      error: string | null = null,
      retryAfter: string | null = null;
    try {
      // Always refresh the newest page while a historical backfill is in progress.
      // At most two API calls per leased source/run; this does not bypass cadence.
      const backfillPage = Number(cursor.page ?? 1);
      const request = monitorRequest(
          source.id,
          source.id === "contracts-finder" ? cursor : {},
        ),
        payload = await fetchMonitorSource(
          request.url,
          source.host,
          request.method,
          request.body,
        );
      let older: unknown = null;
      if (source.id !== "contracts-finder" && backfillPage > 1) {
        if (source.id === "ted" && backfillPage > 250)
          throw new MonitorSourceError(
            "monitor_ted_page_limit_requires_partition",
          );
        const next = monitorRequest(source.id, cursor);
        older = await fetchMonitorSource(
          next.url,
          source.host,
          next.method,
          next.body,
        );
      }
      let records: unknown[] = [],
        parsed = [];
      if (source.id === "ted") {
        const data = record(payload);
        records = [
          ...array(data.notices),
          ...(older ? array(record(older).notices) : []),
        ];
        parsed = [...parseTed(payload), ...(older ? parseTed(older) : [])];
        const total = Number(data.totalNoticeCount);
        const page = backfillPage;
        cursor =
          array(record(older ?? payload).notices).length === 20 &&
          (!Number.isFinite(total) || total > page * 20)
            ? { page: page + 1 }
            : { page: 1 };
        if (cursor.page !== 1) status = "partial";
      } else if (source.id === "usaspending") {
        const data = record(payload);
        records = [
          ...array(data.results),
          ...(older ? array(record(older).results) : []),
        ];
        parsed = [
          ...parseUsaspending(payload),
          ...(older ? parseUsaspending(older) : []),
        ];
        const page = backfillPage;
        cursor =
          array(record(older ?? payload).results).length === 20
            ? { page: page + 1 }
            : { page: 1 };
        if (cursor.page !== 1) status = "partial";
      } else {
        const data = record(payload);
        if (!Array.isArray(data.releases))
          throw new MonitorSourceError("monitor_invalid_ocds_package");
        records = data.releases;
        // Do not advance a potentially capped window: halve it and retry later.
        if (records.length >= 90) {
          const w = request.window!;
          const a = Date.parse(w.from),
            b = Date.parse(w.to);
          if (b - a < 60000)
            throw new MonitorSourceError("monitor_window_overflow");
          cursor = {
            from: w.from,
            to: new Date(a + (b - a) / 2).toISOString(),
            windowMs: (b - a) / 2,
          };
          status = "partial";
          records = [];
        } else {
          const compiledByProcess = new Map<string, unknown>();
          for (const release of [...records].sort((a, b) =>
            String(record(a).date).localeCompare(String(record(b).date)),
          )) {
            const r = record(release);
            if (typeof r.ocid !== "string")
              throw new MonitorSourceError("monitor_invalid_ocds_release");
            if (!compiledByProcess.has(r.ocid)) {
              const previous = await db.rpc("monitor_previous_process", {
                p_source: source.id,
                p_process: r.ocid,
              });
              if (previous.error)
                throw new MonitorSourceError("monitor_snapshot_read_failed");
              compiledByProcess.set(r.ocid, previous.data ?? {});
            }
            const compiled = mergeOcds(compiledByProcess.get(r.ocid), release);
            compiledByProcess.set(r.ocid, compiled);
            for (const item of parseContractsFinderRelease(compiled))
              parsed.push({ ...item, raw: { release, compiled } });
          }
          const to = Date.parse(request.window!.to),
            width = to - Date.parse(request.window!.from),
            overlap = Math.min(300000, width / 10);
          cursor = {
            from: new Date(to - overlap).toISOString(),
            windowMs: Math.max(width, 60000),
          };
          if (to < Date.now() - 60000) status = "partial";
        }
      }
      seen = records.length;
      for (const item of parsed) {
        if (Date.now() - started > 75000)
          throw new MonitorSourceError("monitor_time_budget");
        const story = monitorStory(item.event);
        const saved = await db.rpc("monitor_store_event", {
          p_source: source.id,
          p_event: item.event,
          p_document: item.raw,
          p_story: story,
        });
        if (saved.error)
          throw new MonitorSourceError("monitor_storage_or_validation_failed");
        if (
          record(saved.data).action !== "duplicate" &&
          record(saved.data).action !== "older_release_ignored"
        )
          changed++;
      }
    } catch (e) {
      status = "error";
      error =
        e instanceof MonitorSourceError ? e.code : "monitor_collection_failed";
      retryAfter = e instanceof MonitorSourceError ? e.retryAfter : null;
    }
    const finish = await db.rpc("monitor_finish", {
      p_source: source.id,
      p_lease: state.lease,
      p_run: state.runId,
      p_cursor: cursor,
      p_status: status,
      p_seen: seen,
      p_changed: changed,
      p_error: error,
      p_retry_after: retryAfter,
    });
    results.push({
      source: source.id,
      status: finish.error ? "error" : status,
      seen,
      changed,
      error: finish.error ? "monitor_finish_failed" : error,
    });
  }
  return reply(
    { results },
    results.some((r) => r.status === "error" || r.error) ? 207 : 200,
  );
}
