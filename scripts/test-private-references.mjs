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
    `SELECT set_config('test.auth_uid','${owner}',false); SET ROLE authenticated`,
  );
  assert.equal(
    (await db.query("SELECT * FROM private_market_references")).rows.length,
    1,
  );
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
  await db.exec("RESET ROLE; SET ROLE anon");
  await assert.rejects(db.exec("SELECT * FROM private_market_references"));
  console.log(
    "PASS private references: owner-only reads, no client writes, no anonymous data, correct alloy basis, duplicate and verification guards",
  );
} finally {
  await db.close();
}
