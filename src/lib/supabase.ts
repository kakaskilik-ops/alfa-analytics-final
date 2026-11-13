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
export const supabase: SupabaseClient | null = SUPABASE_CONFIGURED
  ? createClient(url!, key!, {
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: init?.signal ?? AbortSignal.timeout(15000),
          }),
      },
    })
  : null;
/** Edge analysis needs a longer deadline than small database reads. Credentials stay scoped to the configured Supabase URL. */
export async function invokeAnalysis(
  body: unknown,
  accessToken: string,
): Promise<unknown> {
  if (!SUPABASE_CONFIGURED) throw new Error("Сервер ИИ не настроен.");
  const response = await fetch(
    `${url!.replace(/\/$/, "")}/functions/v1/ai-analyze`,
    {
      method: "POST",
      signal: AbortSignal.timeout(90000),
      headers: {
        "Content-Type": "application/json",
        apikey: key!,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
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
