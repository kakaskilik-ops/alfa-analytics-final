import assert from "node:assert/strict";
import { createMonitorTestDb } from "./monitor-test-db.mjs";
const db = await createMonitorTestDb();
try {
  // Only this isolated test replaces auth.uid; no production Auth/session is forged.
  const owner = "11111111-1111-4111-8111-111111111111",
    other = "22222222-2222-4222-8222-222222222222";
  await db.exec(`INSERT INTO auth.users(id) VALUES('${owner}'),('${other}');
    INSERT INTO analytics_internal.smm_owner_access(user_id) VALUES('${owner}');
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.auth_uid',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA auth TO authenticated;`);
  const setUser = async (id) =>
    db.exec(
      `RESET ROLE; SELECT set_config('test.auth_uid','${id}',false); SET ROLE authenticated;`,
    );
  await setUser(owner);
  assert.equal(
    (await db.query("select public.has_smm_owner_access() ok")).rows[0].ok,
    true,
  );
  const insert = `INSERT INTO private_smm_observations(series_id,metal_id,specification,purity,delivery_form,region,price_type,assessed_at,date_precision,currency,unit,tax_status,minimum,maximum,mean,source_url,rights_attested) VALUES('fixture','copper','cathode','99.99%','cathode','China','physical_spot','2026-11-17','day','USD','ton','excluded',14304.76,14432.46,14368.61,'https://www-old.metal.com/Copper/201102250376',true)`;
  await db.exec(insert);
  assert.equal(
    (await db.query("select * from private_smm_observations")).rows.length,
    1,
  );
  await assert.rejects(db.exec(insert));
  await assert.rejects(
    db.exec(
      insert
        .replace("'excluded'", "'included'")
        .replace("'cathode','99.99%'", "'concentrate','99.99%'"),
    ),
    /specification mismatch/,
  );
  await assert.rejects(
    db.exec(
      insert.replace("'fixture'", "'no-rights'").replace(",true)", ",false)"),
    ),
  );
  await setUser(other);
  assert.equal(
    (await db.query("select public.has_smm_owner_access() ok")).rows[0].ok,
    false,
  );
  assert.equal(
    (await db.query("select * from private_smm_observations")).rows.length,
    0,
  );
  await assert.rejects(db.exec(insert.replace("'fixture'", "'other'")));
  assert.equal(
    (await db.query("update private_smm_observations set mean=1 returning id"))
      .rows.length,
    0,
  );
  assert.equal(
    (await db.query("delete from private_smm_observations returning id")).rows
      .length,
    0,
  );
  await assert.rejects(
    db.exec(
      `insert into analytics_internal.smm_owner_access(user_id) values('${other}')`,
    ),
  );
  await db.exec("RESET ROLE; SET ROLE anon");
  await assert.rejects(db.exec("select * from private_smm_observations"));
  await assert.rejects(db.exec("select public.has_smm_owner_access()"));
  console.log(
    "PASS SMM owner import/read; other user/anon isolation; ACL escalation denied; rights/series/duplicate checks",
  );
} finally {
  await db.close();
}
