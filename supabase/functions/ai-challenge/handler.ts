import { guard, json } from "../_shared/http.ts";
import { limitedText } from "../_shared/network.ts";
import { parseAiInput } from "../_shared/analysis.ts";
import { issueGuestChallenge } from "../_shared/guestAccess.ts";
export async function handler(req: Request) {
  const rejected = guard(req, 24576);
  if (rejected) return rejected;
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) return json(req, { error: "Сервис пока не настроен." }, 503);
  try {
    const raw = await limitedText(new Response(req.body), 24576),
      body = JSON.parse(raw);
    if (body.website)
      return json(req, { error: "Запрос отклонён защитой от спама." }, 403);
    parseAiInput(body);
    return json(req, await issueGuestChallenge(req, secret, raw));
  } catch {
    return json(req, { error: "Некорректный запрос." }, 400);
  }
}
