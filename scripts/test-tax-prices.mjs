import assert from "node:assert/strict";
import { createMonitorTestDb } from "./monitor-test-db.mjs";
const db = await createMonitorTestDb();
try {
  await db.exec(`INSERT INTO market_price_series(id,metal_id,source_id,specification,delivery_form,region,price_type,source_url) VALUES
    ('test-only','copper','world-bank-pink-sheet','TEST 99.99%','cathode','Asia','physical_spot','https://example.com/fixture');
    INSERT INTO market_price_observations(series_id,assessed_at,date_precision,original_currency,original_unit,tax_status,minimum,maximum,mean) VALUES
    ('test-only','2026-11-17','day','USD','ton','excluded',14304.76,14432.46,14368.61),
    ('test-only','2026-11-17','day','USD','ton','included',null,null,16236.53);
    SET ROLE anon;`);
  assert.equal(
    (await db.query("select * from market_price_observations")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from market_price_series")).rows.length,
    0,
  );
  for (const sql of [
    "update market_price_series set redistribution_authorized=true",
    "delete from market_price_observations",
    "insert into market_price_observations(series_id) values('test-only')",
  ]) {
    await assert.rejects(db.exec(sql));
  }
  await db.exec(
    "RESET ROLE; UPDATE market_price_series SET redistribution_authorized=true; SET ROLE anon",
  );
  assert.equal(
    (await db.query("select * from market_price_observations")).rows.length,
    2,
  );
  assert.equal(
    (
      await db.query(
        "select count(distinct (series_id,assessed_at))::integer n from market_price_observations",
      )
    ).rows[0].n,
    1,
  );
  await db.exec("RESET ROLE");
  for (const tail of [
    "'unknown',.13,1,2,1.5",
    "'excluded',null,3,2,2.5",
    "'excluded',null,1,null,2",
    "'included',null,1,2,3",
    "'excluded',null,null,null,'NaN'::numeric",
  ]) {
    await assert.rejects(
      db.exec(
        `INSERT INTO market_price_observations(series_id,assessed_at,date_precision,original_currency,original_unit,tax_status,vat_rate,minimum,maximum,mean) VALUES ('test-only','2026-11-18','day','USD','kg',${tail})`,
      ),
    );
  }
  await assert.rejects(
    db.exec(
      "INSERT INTO market_price_observations(series_id,assessed_at,date_precision,original_currency,original_unit,tax_status,mean) VALUES ('test-only','2026-11-17','day','USD','ton','included',16236.53)",
    ),
  );
  console.log(
    "PASS tax representations share observation; unauthorized sources hidden; anon writes denied; duplicate/range/NaN/unknown VAT constraints",
  );
} finally {
  await db.close();
}
