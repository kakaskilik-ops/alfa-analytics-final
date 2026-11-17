import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createMonitorTestDb } from "./monitor-test-db.mjs";
import {
  parseTed,
  parseUsaspending,
  parseContractsFinderRelease,
} from "../shared/monitorSources.ts";
import {
  monitorStory,
  finishMonitorEvent,
  unitPrice,
} from "../shared/monitor.ts";
// All data stays in an isolated, ephemeral Postgres-compatible test database.
const db = await createMonitorTestDb();
const load = async (name) =>
  JSON.parse(await readFile(`tests/fixtures/monitor/${name}.json`, "utf8"));
for (const f of (await load("manifest")).fixtures) {
  const bytes = await readFile("tests/fixtures/monitor/" + f.file);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), f.sha256);
}
const batches = {
  ted: parseTed(await load("ted")),
  usaspending: parseUsaspending(await load("usaspending")),
  "contracts-finder": (await load("contracts-finder")).releases.flatMap((r) =>
    parseContractsFinderRelease(r),
  ),
};
await db.exec("UPDATE public.monitor_sources SET enabled=true");
await db.exec("SET ROLE service_role");
const save = async (event, raw) =>
  (
    await db.query(
      "SELECT public.monitor_store_event($1,$2::jsonb,$3::jsonb,$4::jsonb) result",
      [
        event.sourceId,
        JSON.stringify(event),
        JSON.stringify(raw),
        JSON.stringify(monitorStory(event)),
      ],
    )
  ).rows[0].result;
const counts = {};
for (const [source, items] of Object.entries(batches)) {
  counts[source] = {
    detected: items.length,
    published: 0,
    pending: 0,
    duplicates: 0,
  };
  for (const { event, raw } of items) {
    const r = await save(event, raw);
    counts[source][r.action]++;
  }
}
const before = (
  await db.query(
    "select (select count(*) from public.monitor_publications)::int publications,(select count(*) from analytics_internal.monitor_event_revisions)::int revisions,(select count(*) from public.monitor_public_updates)::int updates",
  )
).rows[0];
for (const [source, items] of Object.entries(batches))
  for (const { event, raw } of items) {
    assert.equal((await save(event, raw)).action, "duplicate");
    counts[source].duplicates++;
  }
assert.deepEqual(
  (
    await db.query(
      "select (select count(*) from public.monitor_publications)::int publications,(select count(*) from analytics_internal.monitor_event_revisions)::int revisions,(select count(*) from public.monitor_public_updates)::int updates",
    )
  ).rows[0],
  before,
);
assert.equal(
  (await db.query("select count(*)::int n from public.monitor_contract_prices"))
    .rows[0].n,
  0,
);
await db.exec("SET ROLE anon");
const publicRows = (
  await db.query(
    "select id,source_id,data,revision,last_checked_at from public.monitor_events order by published_on desc,id",
  )
).rows;
assert.equal(
  publicRows.length,
  Object.values(counts).reduce((n, c) => n + c.published, 0),
);
assert(publicRows.every((r) => r.data.reviewReasons.length === 0));
const publications = (
  await db.query("select * from public.monitor_publications")
).rows;
assert.equal(publications.length, publicRows.length);
for (const sql of [
  "select * from analytics_internal.monitor_documents",
  "select * from analytics_internal.monitor_review_queue",
  "select document_id from public.monitor_events",
  "update public.monitor_sources set enabled=false",
  "select public.monitor_begin('ted')",
  "select public.monitor_review('x',1,'approve','Unauthorized test approval')",
]) {
  await assert.rejects(() => db.query(sql), /permission denied/);
}
const sources = (
  await db.query("select * from public.monitor_sources order by id")
).rows;
await db.exec("RESET ROLE");
await db.exec("SET ROLE authenticated");
assert.equal(
  (await db.query("select count(id)::int n from public.monitor_events")).rows[0]
    .n,
  publicRows.length,
);
await assert.rejects(
  () => db.query("select * from analytics_internal.monitor_documents"),
  /permission denied/,
);
await db.exec("RESET ROLE");
await db.exec("SET ROLE service_role");
// Snapshot real corpus before separate, explicitly synthetic transition tests.
await mkdir("work/monitor", { recursive: true });
await writeFile(
  "work/monitor/test-public.json",
  JSON.stringify(
    {
      monitor_events: publicRows,
      monitor_publications: publications,
      monitor_sources: sources,
      monitor_public_updates: [],
    },
    null,
    2,
  ),
);
// Synthetic math cases: server independently verifies TS division and refuses forged values.
const seed = batches.usaspending.find(
  (x) => !x.event.reviewReasons.length,
).event;
const test = finishMonitorEvent({
  ...seed,
  entityId: "TEST-only-unit-price",
  processId: "TEST-process",
  sourceVersion: "TEST-1",
  metalIds: ["tungsten"],
  amount: "12345.67",
  quantity: "2.5",
  unit: "t",
  currency: "USD",
  amountBasis: "single_material_line",
  singleMaterialLine: true,
  includesServices: false,
  priceKind: "award",
  stage: "award",
  reviewReasons: [],
  specification: "TEST grade",
  deliveryTerms: "TEST FCA",
  taxIncluded: false,
  logisticsIncluded: false,
  additionalCharges: "none",
});
assert.equal(unitPrice(test).value, "4.938268000000");
assert.equal(
  (
    await db.query("select public.monitor_price($1::jsonb)::text value", [
      JSON.stringify(test),
    ])
  ).rows[0].value,
  "4.938268000000",
);
await assert.rejects(
  () => save({ ...test, pricePerKg: "999" }, { TEST: true }),
  /monitor_price_mismatch/,
);
await save(test, { TEST: true, version: 1 });
const modified = {
  ...test,
  sourceVersion: "TEST-2",
  amount: "15000",
  pricePerKg: "6.000000000000",
};
assert.equal((await save(modified, { TEST: true, version: 2 })).revision, 2);
await save(
  {
    ...modified,
    entityId: "TEST-procedure-cancel",
    sourceVersion: "TEST-3",
    stage: "cancelled",
    cancellationScope: "procedure",
    pricePerKg: null,
  },
  { TEST: true, version: 3 },
);
assert.equal(
  (
    await db.query(
      "select publication_status from public.monitor_events where id='usaspending:TEST-only-unit-price'",
    )
  ).rows[0].publication_status,
  "withdrawn",
);
// A later recheck of an older entity must not select an obsolete OCDS snapshot.
await db.query(
  "update public.monitor_events set last_checked_at=now()+interval '1 day' where id='usaspending:TEST-only-unit-price'",
);
assert.equal(
  (
    await db.query(
      "select public.monitor_previous_process('usaspending','TEST-process') value",
    )
  ).rows[0].value.version,
  3,
);
const pending = batches.usaspending.find(
  (x) => x.event.reviewReasons.length,
).event;
const eid = "usaspending:" + pending.entityId;
assert.equal(
  (
    await db.query(
      "select public.monitor_review($1,999,'approve','TEST documented approval') ok",
      [eid],
    )
  ).rows[0].ok,
  false,
);
assert.equal(
  (
    await db.query(
      "select public.monitor_review($1,1,'approve','TEST original reviewed; not market price') ok",
      [eid],
    )
  ).rows[0].ok,
  true,
);
assert.equal(
  (await save(pending, { TEST: true, original: pending.entityId })).action,
  "duplicate",
);
assert.equal(
  (
    await db.query(
      "select publication_status from public.monitor_events where id=$1",
      [eid],
    )
  ).rows[0].publication_status,
  "published",
);
const claim = (await db.query("select public.monitor_begin('ted') value"))
  .rows[0].value;
assert(claim.lease);
assert.equal(
  (await db.query("select public.monitor_begin('ted') value")).rows[0].value,
  null,
);
assert.equal(
  (
    await db.query(
      "select public.monitor_finish('ted',$1,$2,'{\"page\":2}','error',20,0,'test_error',now()+interval '3 hours') ok",
      [claim.lease, claim.runId],
    )
  ).rows[0].ok,
  true,
);
const state = (
  await db.query(
    "select cursor,failures,next_allowed_at>now()+interval '2 hours' backed_off from analytics_internal.monitor_source_state where source_id='ted'",
  )
).rows[0];
assert.deepEqual(state.cursor, {});
assert.equal(state.failures, 1);
assert.equal(state.backed_off, true);
await writeFile(
  "work/monitor/real-check.json",
  JSON.stringify(
    {
      counts,
      publicEvents: publicRows.length,
      contractPrices: 0,
      deduplication: true,
      revisionAndCancellation: true,
      rls: true,
      moderation: true,
      leaseAndBackoff: true,
    },
    null,
    2,
  ),
);
console.log(
  "PASS real source corpus → test Postgres → Russian publications",
  JSON.stringify(counts),
);
console.log(
  "PASS duplicates, independent decimal calculation, forged price rejection, revisions, procedure cancellation, moderation, anon RLS and collector lease/backoff",
);
await db.close();
