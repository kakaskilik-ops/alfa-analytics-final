// Isolated PostgreSQL-compatible tests. Supabase Auth/Vault/cron are test-only stubs. No remote database is contacted.
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT null::uuid$$;
CREATE SCHEMA extensions;CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS $$SELECT decode(repeat('ab',n),'hex')$$;
CREATE SCHEMA vault;CREATE TABLE vault.secrets(name text,decrypted_secret text);CREATE VIEW vault.decrypted_secrets AS SELECT * FROM vault.secrets;CREATE FUNCTION vault.create_secret(s text,n text,d text) RETURNS void LANGUAGE sql AS $$INSERT INTO vault.secrets VALUES(n,s)$$;
CREATE SCHEMA cron;CREATE TABLE cron.job(jobname text);CREATE FUNCTION cron.unschedule(n text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;`);
const path = "supabase/migrations";
const results = [];
for (const f of (await readdir(path)).sort()) {
  const sql = (await readFile(`${path}/${f}`, "utf8")).replace(
    /^CREATE EXTENSION.*;$/gm,
    "",
  );
  await db.exec(sql);
  results.push(`PASS ${f}`);
}
assert.equal(
  (await db.query("SELECT count(*)::int n FROM metals")).rows[0].n,
  130,
);
assert.equal(
  (await db.query("SELECT count(*)::int n FROM active_metals")).rows[0].n,
  13,
);
assert.equal(
  (await db.query("SELECT count(*)::int n FROM regional_markets")).rows[0].n,
  3,
);
results.push(
  "PASS legacy 129 materials preserved plus chromium; exactly 13 active; 3 regional markets",
);
for (let i = 0; i < 3; i++)
  assert.equal(
    (await db.query("SELECT reserve_ai_tokens(10,20) allowed")).rows[0].allowed,
    i < 2,
  );
results.push("PASS atomic shared token budget blocks third reservation");
assert.equal(
  (await db.query("SELECT claim_news_source('usgs-minerals') allowed")).rows[0]
    .allowed,
  true,
);
assert.equal(
  (await db.query("SELECT claim_news_source('usgs-minerals') allowed")).rows[0]
    .allowed,
  false,
);
await db.exec(
  "UPDATE news_sources SET last_attempt_at=now()-interval '2 hours',retry_after_at=now()+interval '1 hour' WHERE id='usgs-minerals'",
);
assert.equal(
  (await db.query("SELECT claim_news_source('usgs-minerals') allowed")).rows[0]
    .allowed,
  false,
);
results.push(
  "PASS atomic feed frequency claim, repeated call and future Retry-After denied",
);
await db.exec(
  `INSERT INTO price_quotations(metal_id,source_id,original_price,original_currency,original_unit,normalized_price,normalized_currency,normalized_unit,region,market_type,quality_score,data_status,validation_status,quoted_at,purity,delivery_terms,country) VALUES ('tungsten','lme',10,'USD','kg',10,'USD','kg','Европа','spot',.9,'live','valid',now(),99.9,'FCA',NULL),('tungsten','shfe',20,'USD','kg',20,'USD','kg','Азия','spot',.9,'live','valid',now(),99.9,'FCA','Китай'),('gold','lme',100,'USD','kg',100,'USD','kg','Европа','spot',.9,'live','valid',now(),99.9,'FCA',NULL);`,
);
await db.exec(
  `INSERT INTO news_articles(source_id,canonical_url,fingerprint,original_title,excerpt,metal_ids,published_at) VALUES('usgs-minerals','https://example.com/news','fixture1','Tungsten production','TEST',ARRAY['tungsten'],now());`,
);
await db.exec("SET ROLE anon");
assert.equal(
  (await db.query("SELECT count(*)::int n FROM price_quotations")).rows[0].n,
  2,
);
assert.equal(
  (await db.query("SELECT count(*)::int n FROM news_articles")).rows[0].n,
  1,
);
assert.equal(
  (await db.query("SELECT count(*)::int n FROM active_metals")).rows[0].n,
  13,
);
for (const sql of [
  "SELECT * FROM ai_daily_budget",
  "SELECT feed_url FROM news_sources",
  "SELECT * FROM news_ingestion_runs",
  "INSERT INTO active_metals VALUES('gold')",
]) {
  let denied = false;
  try {
    await db.exec(sql);
  } catch {
    denied = true;
  }
  assert.ok(denied, sql);
}
results.push(
  "PASS public reads scoped quotes and news, internal budget/feed settings/logs/writes denied",
);
await db.exec("RESET ROLE");
let invalid = false;
try {
  await db.exec(
    `INSERT INTO news_articles(source_id,canonical_url,fingerprint,original_title,excerpt,metal_ids,published_at) VALUES('usgs-minerals','https://example.com/gold','fixture2','Gold','TEST',ARRAY['gold'],now())`,
  );
} catch {
  invalid = true;
}
assert.ok(invalid);
results.push("PASS database rejects out-of-scope news");
await db.exec("SET ROLE service_role");
const lease = (
  await db.query("SELECT claim_automation_job('collect-fx') token")
).rows[0].token;
assert.ok(lease);
assert.equal(
  (await db.query("SELECT claim_automation_job('collect-fx') token")).rows[0]
    .token,
  null,
);
await db.query("SELECT finish_automation_job('collect-fx',$1::uuid)", [lease]);
assert.equal(
  (await db.query("SELECT claim_automation_job('collect-fx') token")).rows[0]
    .token,
  null,
);
assert.equal(
  (await db.query("SELECT count(*)::int n FROM get_quote_adapters()")).rows[0]
    .n,
  0,
);
await db.exec(
  `INSERT INTO fx_observations(source_id,base_currency,quote_currency,rate,rate_date,source_url,origin,data_status) VALUES('frankfurter-v2','USD','EUR',2,now(),'https://example.com','TEST','live')`,
);
await db.exec("SET ROLE anon");
assert.equal(
  (
    await db.query(
      "SELECT count(*)::int n FROM app_exchange_rates WHERE origin='TEST'",
    )
  ).rows[0].n,
  1,
);
for (const sql of [
  "SELECT * FROM ingestion_payloads",
  "SELECT * FROM analytics_internal.reference_benchmarks",
  "SELECT claim_automation_job('collect-fx')",
  "SELECT * FROM get_quote_adapters()",
  "INSERT INTO fx_observations DEFAULT VALUES",
]) {
  let denied = false;
  try {
    await db.exec(sql);
  } catch {
    denied = true;
  }
  assert.ok(denied, sql);
}
await db.exec("RESET ROLE");
for (const rate of ["NaN", "Infinity", "-1", "0"]) {
  let denied = false;
  try {
    await db.query(
      `INSERT INTO fx_observations(source_id,base_currency,quote_currency,rate,rate_date,source_url,origin,data_status) VALUES('frankfurter-v2','USD','RUB',$1,now(),'https://example.com','TEST','live')`,
      [rate],
    );
  } catch {
    denied = true;
  }
  assert.ok(denied, rate);
}
results.push(
  "PASS automation lease/cooldown, FX invoker view, private provenance/benchmarks and finite positive rates",
);
console.log(results.join("\n"));
await db.close();
