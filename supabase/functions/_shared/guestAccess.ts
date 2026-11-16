import { proofMatches } from "../../../shared/guestProof.ts";
const bytes = (s: string) => new TextEncoder().encode(s);
async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    bytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export async function visitorHash(req: Request, secret: string) {
  // Best-effort network fairness only. Forwarded headers are NOT authentication;
  // shared networks can share a quota. Global provider budgets remain authoritative.
  const address =
    req.headers.get("x-forwarded-for")?.split(",").at(0)?.trim() ||
    "shared-unknown-network";
  return hex(
    await crypto.subtle.sign(
      "HMAC",
      await signingKey(secret),
      bytes("guest-ip-v1:" + address),
    ),
  );
}
async function bodyHash(raw: string) {
  return hex(await crypto.subtle.digest("SHA-256", bytes(raw)));
}
export async function issueGuestChallenge(
  req: Request,
  secret: string,
  raw: string,
  now = Date.now(),
) {
  const payload = {
    nonce: crypto.randomUUID().replaceAll("-", ""),
    expires: now + 300000,
    hash: await bodyHash(raw),
    difficulty: 16,
  };
  const encoded = btoa(JSON.stringify(payload))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  const signature = hex(
    await crypto.subtle.sign(
      "HMAC",
      await signingKey(secret),
      bytes("guest-proof-v2:" + encoded),
    ),
  );
  return { token: encoded + "." + signature, difficulty: 16 };
}
export async function verifyGuestChallenge(
  req: Request,
  secret: string,
  raw: string,
  now = Date.now(),
): Promise<{ visitor: string; nonce: string } | null> {
  try {
    const token = req.headers.get("x-ai-challenge") || "",
      counter = Number(req.headers.get("x-ai-proof") ?? "invalid");
    if (
      token.length > 2048 ||
      !Number.isSafeInteger(counter) ||
      counter < 0 ||
      counter >= 2000000
    )
      return null;
    const [encoded, sig, ...extra] = token.split(".");
    if (extra.length || !encoded || !/^[a-f0-9]{64}$/.test(sig)) return null;
    const payload = JSON.parse(
      atob(encoded.replaceAll("-", "+").replaceAll("_", "/")),
    );
    if (
      payload.difficulty !== 16 ||
      !Number.isFinite(payload.expires) ||
      payload.expires < now ||
      payload.expires > now + 330000 ||
      !/^[a-f0-9]{32}$/.test(payload.nonce) ||
      payload.hash !== (await bodyHash(raw))
    )
      return null;
    const visitor = await visitorHash(req, secret),
      signature = new Uint8Array(sig.match(/../g)!.map((x) => parseInt(x, 16)));
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        await signingKey(secret),
        signature,
        bytes("guest-proof-v2:" + encoded),
      ))
    )
      return null;
    if (!(await proofMatches(token, counter))) return null;
    return { visitor, nonce: payload.nonce };
  } catch {
    return null;
  }
}
