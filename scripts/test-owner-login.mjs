import assert from "node:assert/strict";
import { createMonitorTestDb } from "./monitor-test-db.mjs";
const db = await createMonitorTestDb();
try {
  await db.exec("SET ROLE service_role");
  assert.equal((await db.query("select site_owner_id() id")).rows[0].id, null);
  for (let i = 0; i < 9; i++)
    assert.equal(
      (await db.query("select claim_owner_login_attempt(repeat('a',64)) ok"))
        .rows[0].ok,
      i < 8,
    );
  assert.equal(
    (await db.query("select claim_owner_login_attempt('invalid') ok")).rows[0]
      .ok,
    false,
  );
  await db.exec("RESET ROLE");
  await db.exec(
    "update analytics_internal.owner_login_attempts set attempts=199 where scope='global'; SET ROLE service_role",
  );
  const racing = await Promise.all(
    ["b", "c"].map((h) =>
      db.query("select claim_owner_login_attempt(repeat($1,64)) ok", [h]),
    ),
  );
  assert.equal(racing.filter((r) => r.rows[0].ok).length, 1);
  await db.exec(
    "RESET ROLE; INSERT INTO auth.users(id) VALUES('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'); INSERT INTO analytics_internal.smm_owner_access(user_id) VALUES('11111111-1111-4111-8111-111111111111'); SET ROLE service_role",
  );
  assert.equal(
    (await db.query("select site_owner_id() id")).rows[0].id,
    "11111111-1111-4111-8111-111111111111",
  );
  await db.exec(
    "RESET ROLE; INSERT INTO analytics_internal.smm_owner_access(user_id) VALUES('22222222-2222-4222-8222-222222222222'); SET ROLE service_role",
  );
  assert.equal((await db.query("select site_owner_id() id")).rows[0].id, null);
  for (const role of ["anon", "authenticated"]) {
    await db.exec("RESET ROLE; SET ROLE " + role);
    for (const sql of [
      "select site_owner_id()",
      "select claim_owner_login_attempt(repeat('d',64))",
      "select * from analytics_internal.owner_login_attempts",
    ])
      await assert.rejects(db.exec(sql));
  }
  console.log(
    "PASS owner login 8/15m network + atomic 200/15m global cap; only one owner; no browser access to identities/counters/RPC",
  );
} finally {
  await db.close();
}
