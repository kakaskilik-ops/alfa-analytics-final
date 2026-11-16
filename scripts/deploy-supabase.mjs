import { spawnSync } from "node:child_process";
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((v) => v.startsWith("--"))
    .map((v) => {
      const [k, ...r] = v.slice(2).split("=");
      return [k, r.join("=") || true];
    }),
);
const project = String(args["project-ref"] ?? "");
if (!/^[a-z0-9]{20}$/.test(project))
  throw new Error("Pass --project-ref=<confirmed project ref>");
const cli = process.env.SUPABASE_CLI ?? "supabase";
function run(argv) {
  const r = spawnSync(cli, argv, { stdio: "inherit", shell: false });
  if (r.error || r.status !== 0)
    throw new Error(`Supabase command failed: ${argv[0]}`);
}
if (!args.apply) {
  console.log(
    "No remote changes performed. Review the project, schema and plan, then run with --apply --confirm-project=" +
      project,
  );
  process.exit(0);
}
if (args["confirm-project"] !== project)
  throw new Error("Project confirmation must match --project-ref");
if (!process.env.SUPABASE_ACCESS_TOKEN)
  throw new Error(
    "Set SUPABASE_ACCESS_TOKEN in your local environment or deployment secrets, never in chat or git",
  );
const version = spawnSync(cli, ["--version"], { encoding: "utf8" });
if (version.status !== 0 || !version.stdout.trim().startsWith("2.81.3"))
  throw new Error(
    "This deployment script is validated with Supabase CLI 2.81.3; review CLI v3 changes before upgrading",
  );
// link changes local CLI metadata only. No password is placed on argv or written to source.
run(["link", "--project-ref", project]);
// Unknown remote history causes CLI to stop. Never use --include-all or migration repair automatically.
run(["db", "push", "--linked", "--dry-run"]);
if (!args["confirm-migrations"]) {
  console.log(
    "Dry run completed. Review its output before adding --confirm-migrations.",
  );
  process.exit(0);
}
run(["db", "push", "--linked"]);
for (const name of [
  "ai-analyze",
  "ai-status",
  "generate-market-report",
  "collect-trade",
  "collect-news",
  "ingest-quotes",
  "ingest-regional-history",
  "collect-fx",
  "collect-quotes",
  "compute-orientations",
  "collect-reference-prices",
  "collect-market-data",
])
  run([
    "functions",
    "deploy",
    name,
    "--project-ref",
    project,
    "--use-api",
    "--import-map",
    "supabase/deno.json",
  ]);
console.log(
  "Functions deployed. Schedules and DNS were not changed. Review ops/activate-automation.sql against the confirmed project before activating schedules.",
);
