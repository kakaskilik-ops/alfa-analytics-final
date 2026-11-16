// Validate only public browser settings. Never print key values.
const url = process.env.VITE_SUPABASE_URL,
  key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key)
  throw new Error(
    "Set VITE_SUPABASE_URL and the public VITE_SUPABASE_ANON_KEY in GitHub Actions variables/secrets before publishing. Never use service_role.",
  );
const parsed = new URL(url);
if (
  parsed.protocol !== "https:" ||
  parsed.username ||
  parsed.password ||
  parsed.search ||
  parsed.hash ||
  !["", "/"].includes(parsed.pathname)
)
  throw new Error("Invalid public Supabase URL");
let valid = key.startsWith("sb_publishable_");
if (!valid && key.split(".").length === 3) {
  try {
    valid =
      JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
        .role === "anon";
  } catch {
    valid = false;
  }
}
if (!valid)
  throw new Error(
    "Only a Supabase publishable/anon key is allowed in the browser configuration",
  );
console.log("Public Supabase configuration validated; no credentials printed.");
