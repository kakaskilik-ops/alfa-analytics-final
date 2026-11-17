import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createMonitorTestDb } from "./monitor-test-db.mjs";
import {
  parseRarePrices,
  parseFerroPrices,
  QS_CATALOGUE_PRICES,
  priceUsdKg,
} from "../shared/supplierPrices.ts";
const db = await createMonitorTestDb();
const rare = await readFile("tests/fixtures/prices/rare.html", "utf8"),
  ferro = await readFile("tests/fixtures/prices/metotechnics.html", "utf8");
const observations = [
  ...parseRarePrices(rare),
  ...parseFerroPrices(ferro),
  ...QS_CATALOGUE_PRICES,
];
await db.exec("SET ROLE service_role");
const payloads = {};
for (const source of [...new Set(observations.map((r) => r.source_id))])
  payloads[source] = (
    await db.query(
      "INSERT INTO public.ingestion_payloads(source_id,source_url,content_sha256,raw_text) VALUES($1,$2,repeat('a',64),$3) RETURNING id",
      [
        source,
        observations.find((r) => r.source_id === source).source_url,
        source === "rare-metals-bid"
          ? rare
          : source === "metotechnics-floor"
            ? ferro
            : JSON.stringify(QS_CATALOGUE_PRICES),
      ],
    )
  ).rows[0].id;
const save = async (r) => {
  const data = { ...r, payload_id: payloads[r.source_id] };
  const cols = Object.keys(data);
  return db.query(
    "INSERT INTO public.supplier_price_observations(" +
      cols.join(",") +
      ") VALUES(" +
      cols.map((_, i) => "$" + (i + 1)).join(",") +
      ") ON CONFLICT(source_id,metal_id,specification,observed_on,original_price) DO NOTHING RETURNING id",
    Object.values(data),
  );
};
for (const row of observations) assert.equal((await save(row)).rows.length, 1);
for (const row of observations) assert.equal((await save(row)).rows.length, 0);
const stored = (
  await db.query(
    "SELECT metal_id,source_id,observed_on,original_price,original_unit,usd_per_kg FROM public.supplier_price_observations",
  )
).rows;
assert.equal(stored.length, 12);
assert.equal(new Set(stored.map((r) => r.metal_id)).size, 9);
for (const r of stored)
  assert(
    Math.abs(
      Number(r.usd_per_kg) -
        priceUsdKg(Number(r.original_price), r.original_unit),
    ) < 0.00000001,
  );
await db.exec("RESET ROLE");
await db.exec("SET ROLE anon");
const visible = (
  await db.query(
    "SELECT id,metal_id,source_id,observed_on::text,date_precision,date_basis,original_price,original_currency,original_unit,specification,region,country,price_kind,source_url,notes,retrieved_at,usd_per_kg FROM public.supplier_price_observations ORDER BY observed_on DESC",
  )
).rows;
assert.equal(visible.length, 12);
for (const sql of [
  "SELECT payload_id FROM public.supplier_price_observations",
  "SELECT * FROM public.ingestion_payloads",
  "DELETE FROM public.supplier_price_observations WHERE false",
  "SELECT public.claim_automation_job('collect-price-evidence')",
]) {
  await assert.rejects(() => db.query(sql), /permission denied/);
}
await db.exec("RESET ROLE");
await db.exec("SET ROLE service_role");
await assert.rejects(
  () => save({ ...observations[0], original_unit: "kg" }),
  /supplier_source_unit/,
);
await mkdir("work/prices", { recursive: true });
await writeFile(
  "work/prices/test-public.json",
  JSON.stringify(visible, null, 2),
);
console.log(
  "PASS real supplier evidence: 12 observations, 9 materials, 12 repeat inserts deduplicated; SQL/JS unit conversion, source unit checks, anonymous reads and protected writes/payloads",
);
await db.close();
