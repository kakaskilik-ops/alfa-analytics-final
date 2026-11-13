import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dirname, "..");
const flags = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((v) => v.startsWith("--"))
    .map((v) => {
      const [k, ...r] = v.slice(2).split("=");
      return [k, r.join("=") || true];
    }),
);
const project = String(flags["project-ref"] ?? "");
if (project && !/^[a-z0-9]{20}$/.test(project))
  throw new Error("Invalid project reference");
const out = resolve(root, String(flags.output ?? "work/deployment-plan.json"));
if (!out.startsWith(root + "/work/"))
  throw new Error("Deployment bundles must remain in ignored work/");
const config = await readFile(join(root, "supabase/config.toml"), "utf8");
const functions = [
  ...config.matchAll(
    /\[functions\.([a-z0-9-]+)\]\s*verify_jwt\s*=\s*(true|false)\s*entrypoint\s*=\s*"\.\/(.*?)"/g,
  ),
].map((m) => ({
  name: m[1],
  verify_jwt: m[2] === "true",
  entrypoint_path: "supabase/" + m[3],
}));
async function files(dir) {
  const result = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith("_test.ts"))
      result.push({
        name: path,
        content: await readFile(join(root, path), "utf8"),
      });
  }
  return result;
}
const sourceFiles = [
  ...(await files("supabase/functions")),
  ...(await files("shared")),
  {
    name: "src/types/market.ts",
    content: await readFile(join(root, "src/types/market.ts"), "utf8"),
  },
  {
    name: "supabase/deno.json",
    content: await readFile(join(root, "supabase/deno.json"), "utf8"),
  },
];
const migrations = [];
for (const file of (await readdir(join(root, "supabase/migrations")))
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  const sql = await readFile(join(root, "supabase/migrations", file), "utf8");
  migrations.push({
    version: file.split("_")[0],
    name: file.replace(/^\d+_|\.sql$/g, ""),
    file: "supabase/migrations/" + file,
    sha256: createHash("sha256").update(sql).digest("hex"),
    sql,
  });
}
const plan = {
  project_ref: project || null,
  confirmation_required: !project,
  generated_at: new Date().toISOString(),
  warning:
    "Plan only. Do not apply historical migrations to an unknown or populated schema. Verify remote migration history and target first.",
  migrations,
  functions: functions.map((f) => ({
    ...f,
    import_map_path: "supabase/deno.json",
    files: sourceFiles,
  })),
};
await mkdir(resolve(out, ".."), { recursive: true });
await writeFile(out, JSON.stringify(plan, null, 2) + "\n", { mode: 0o600 });
console.log(
  JSON.stringify({
    plan: relative(root, out),
    project_ref: plan.project_ref,
    migrations: migrations.length,
    functions: functions.map((f) => f.name),
    applied: false,
  }),
);
