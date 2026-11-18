import assert from "node:assert/strict";
import { createMonitorTestDb } from "./monitor-test-db.mjs";
const db = await createMonitorTestDb();
try {
  const owner = "11111111-1111-4111-8111-111111111111",
    other = "22222222-2222-4222-8222-222222222222";
  await db.exec(
    `INSERT INTO auth.users(id) VALUES('${owner}'),('${other}'); INSERT INTO analytics_internal.smm_owner_access(user_id) VALUES('${owner}'); CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.auth_uid',true),'')::uuid$$; GRANT USAGE ON SCHEMA auth TO authenticated;`,
  );
  const insert = `INSERT INTO private_market_references(owner_id,metal_id,snapshot_id,point_usd_kg,mass_basis,specification,basis_description,claimed_publisher,verification_note) VALUES('${owner}','ferromolybdenum','TEST_ONLY',10,'contained_mo','TEST_ONLY','TEST_ONLY','TEST_ONLY','TEST_ONLY')`;
  await db.exec(insert);
  await assert.rejects(db.exec(insert));
  await assert.rejects(
    db.exec(
      insert.replace("'TEST_ONLY',10,'contained_mo'", "'BAD_UNIT',10,'metal'"),
    ),
  );
  await assert.rejects(
    db.exec(
      "UPDATE private_market_references SET verification_status='verified'",
    ),
  );
  await db.exec(
    insert
      .replace("snapshot_id,", "snapshot_id,series_key,")
      .replace("'TEST_ONLY',10,", "'TEST_ONLY','TEST_SECOND_SERIES',10,"),
  );
  const parent = (
    await db.query(
      "SELECT id FROM private_market_references ORDER BY id LIMIT 1",
    )
  ).rows[0].id;
  await db.exec(
    `UPDATE private_market_references SET observed_on='2026-01-01' WHERE id=${parent}`,
  );
  const view = `INSERT INTO private_reference_tax_views(reference_id,assessed_on,tax_status,vat_rate,point_usd_kg,evidence_url,source_published_on,usage_permission_confirmed) VALUES(${parent},'2026-01-01','included',0.13,10,'https://example.test/evidence','2026-01-01',true)`;
  await assert.rejects(db.exec(view.replace("2026-01-01", "2026-01-02")));
  await db.exec(view);
  await assert.rejects(
    db.exec(
      `UPDATE private_market_references SET observed_on=null WHERE id=${parent}`,
    ),
  );
  await assert.rejects(db.exec(view));
  await assert.rejects(
    db.exec(
      view.replace("'included'", "'excluded'").replace(",true)", ",false)"),
    ),
  );
  await assert.rejects(
    db.exec(
      "UPDATE private_market_references SET vat_rate=0.13 WHERE tax_status='unknown'",
    ),
  );
  await db.exec(
    `SELECT set_config('test.auth_uid','${owner}',false); SET ROLE authenticated`,
  );
  assert.equal(
    (await db.query("SELECT * FROM private_market_references")).rows.length,
    2,
  );
  assert.equal(
    (await db.query("SELECT * FROM private_reference_tax_views")).rows.length,
    1,
  );
  await assert.rejects(db.exec(view));
  for (const sql of [
    insert,
    "UPDATE private_market_references SET point_usd_kg=999",
    "DELETE FROM private_market_references",
  ])
    await assert.rejects(db.exec(sql));
  await db.exec(
    `RESET ROLE; SELECT set_config('test.auth_uid','${other}',false); SET ROLE authenticated`,
  );
  assert.equal(
    (await db.query("SELECT * FROM private_market_references")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("SELECT * FROM private_reference_tax_views")).rows.length,
    0,
  );
  await db.exec("RESET ROLE; SET ROLE anon");
  await assert.rejects(db.exec("SELECT * FROM private_reference_tax_views"));
  await assert.rejects(db.exec("SELECT * FROM private_market_references"));
  console.log(
    "PASS private references: owner-only reads, no client writes, no anonymous data, correct alloy basis, duplicate and verification guards",
  );
} finally {
  await db.close();
}
