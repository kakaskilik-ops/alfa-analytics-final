import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
/** Local test database ONLY. No network or Supabase credentials. */
export async function createMonitorTestDb(path) {
  const db = new PGlite(path);
  if (
    (await db.query("select to_regclass('public.monitor_events') present"))
      .rows[0].present
  )
    return db;
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT null::uuid$$;
CREATE SCHEMA extensions;CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS $$SELECT decode(repeat('ab',n),'hex')$$;
CREATE SCHEMA vault;CREATE TABLE vault.secrets(name text,decrypted_secret text);CREATE VIEW vault.decrypted_secrets AS SELECT * FROM vault.secrets;CREATE FUNCTION vault.create_secret(s text,n text,d text) RETURNS void LANGUAGE sql AS $$INSERT INTO vault.secrets VALUES(n,s)$$;
CREATE SCHEMA cron;CREATE TABLE cron.job(jobname text);CREATE FUNCTION cron.unschedule(n text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;`);
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(
      (await readFile("supabase/migrations/" + file, "utf8")).replace(
        /^CREATE EXTENSION.*;$/gm,
        "",
      ),
    );
  return db;
}
