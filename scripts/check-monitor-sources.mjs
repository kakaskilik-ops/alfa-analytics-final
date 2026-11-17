import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  monitorRequest,
  MONITOR_SOURCES,
  parseTed,
  parseUsaspending,
  parseContractsFinderRelease,
} from "../shared/monitorSources.ts";
// Explicit network integration check, never part of CI / never writes Supabase.
if (!process.argv.includes("--live"))
  throw Error(
    "Use --live to contact three official public APIs; no database writes.",
  );
await mkdir("work/monitor/live", { recursive: true });
const report = [];
for (const source of MONITOR_SOURCES) {
  const r = monitorRequest(source.id, {});
  const began = Date.now();
  try {
    const response = await fetch(r.url, {
      method: r.method,
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "ALFA-Market-Monitor/1.0",
      },
      ...(r.body === undefined ? {} : { body: JSON.stringify(r.body) }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      report.push({ source: source.id, status: response.status });
      continue;
    }
    const text = await response.text();
    if (text.length > 2000000) throw Error("oversized_source_response");
    const payload = JSON.parse(text);
    const parsed =
      source.id === "ted"
        ? parseTed(payload)
        : source.id === "usaspending"
          ? parseUsaspending(payload)
          : payload.releases.flatMap((x) => parseContractsFinderRelease(x));
    await writeFile(`work/monitor/live/${source.id}.json`, text);
    await writeFile(
      `work/monitor/live/${source.id}-request.json`,
      JSON.stringify(r, null, 2),
    );
    report.push({
      source: source.id,
      status: response.status,
      retrievedAt: new Date().toISOString(),
      durationMs: Date.now() - began,
      sha256: createHash("sha256").update(text).digest("hex"),
      records:
        source.id === "ted"
          ? payload.notices.length
          : source.id === "usaspending"
            ? payload.results.length
            : payload.releases.length,
      candidates: parsed.length,
      publishable: parsed.filter((x) => !x.event.reviewReasons.length).length,
      pending: parsed.filter((x) => x.event.reviewReasons.length).length,
    });
  } catch (e) {
    report.push({ source: source.id, error: e.message });
  }
}
await writeFile(
  "work/monitor/live/report.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (report.some((r) => r.status !== 200)) process.exitCode = 1;
