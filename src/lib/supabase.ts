import { solveGuestProof } from "../../shared/guestProof";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
function validConfig(): boolean {
  if (!url || !key) return false;
  try {
    const u = new URL(url);
    if (
      !(
        u.protocol === "https:" ||
        (u.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(u.hostname))
      ) ||
      Boolean(u.username || u.password)
    )
      return false;
    // Never accept a privileged JWT in the browser configuration.
    if (key.startsWith("sb_secret_")) return false;
    if (key.split(".").length === 3) {
      const payload = JSON.parse(
        atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload.role !== "anon") return false;
    }
    return true;
  } catch {
    return false;
  }
}
export const SUPABASE_CONFIGURED = validConfig();
export const OWNER_SESSION_STORAGE_KEY = "alfa-owner-auth-v1";
const memorySession = new Map<string, string>();
const ownerSessionStorage = {
  getItem(name: string) {
    try {
      return sessionStorage.getItem(name) ?? memorySession.get(name) ?? null;
    } catch {
      return memorySession.get(name) ?? null;
    }
  },
  setItem(name: string, value: string) {
    try {
      sessionStorage.setItem(name, value);
    } catch {
      memorySession.set(name, value);
    }
  },
  removeItem(name: string) {
    try {
      sessionStorage.removeItem(name);
    } catch {
      /* memory fallback */
    }
    memorySession.delete(name);
  },
};
// Retire only this project's old persistent browser session; private data is not stored here.
if (SUPABASE_CONFIGURED) {
  try {
    localStorage.removeItem(
      "sb-" + new URL(url!).hostname.split(".")[0] + "-auth-token",
    );
  } catch {
    /* storage may be unavailable */
  }
}
export const supabase: SupabaseClient | null = SUPABASE_CONFIGURED
  ? createClient(url!, key!, {
      auth: {
        storage: ownerSessionStorage,
        storageKey: OWNER_SESSION_STORAGE_KEY,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: init?.signal ?? AbortSignal.timeout(15000),
          }),
      },
    })
  : null;
export async function signOutOwner() {
  try {
    await supabase?.auth.signOut({ scope: "local" });
  } finally {
    for (const name of [
      OWNER_SESSION_STORAGE_KEY,
      OWNER_SESSION_STORAGE_KEY + "-user",
      OWNER_SESSION_STORAGE_KEY + "-code-verifier",
    ])
      ownerSessionStorage.removeItem(name);
  }
}
/** Edge analysis needs a longer deadline than small database reads. Credentials stay scoped to the configured Supabase URL. */
export async function invokeAnalysis(
  body: unknown,
  accessToken?: string,
): Promise<unknown> {
  if (!SUPABASE_CONFIGURED) throw new Error("Сервер ИИ не настроен.");
  const raw = JSON.stringify(body);
  let proofHeaders: Record<string, string> = {};
  if (!accessToken) {
    const challenge = await fetch(
      `${url!.replace(/\/$/, "")}/functions/v1/ai-challenge`,
      {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", apikey: key! },
        body: raw,
      },
    );
    const data = await challenge.json();
    if (!challenge.ok || typeof data.token !== "string")
      throw new Error(
        typeof data.error === "string"
          ? data.error
          : "Не удалось проверить защиту чата.",
      );
    const counter = await solveGuestProof(data.token, data.difficulty);
    proofHeaders = {
      "x-ai-challenge": data.token,
      "x-ai-proof": String(counter),
    };
  }
  const response = await fetch(
    `${url!.replace(/\/$/, "")}/functions/v1/ai-analyze`,
    {
      method: "POST",
      signal: AbortSignal.timeout(90000),
      headers: {
        "Content-Type": "application/json",
        apikey: key!,
        ...proofHeaders,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: raw,
    },
  );
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("Некорректный ответ сервера ИИ.");
  }
  if (!response.ok) {
    const error =
      data && typeof data === "object" && "error" in data
        ? (data as { error: unknown }).error
        : null;
    throw new Error(
      typeof error === "string" ? error : "Сервис ИИ недоступен.",
    );
  }
  return data;
}
