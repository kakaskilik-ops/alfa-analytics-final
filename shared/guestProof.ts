/** Modest proof of work deters cheap automated bursts; it is not a CAPTCHA or a DDoS defence. */
export async function proofMatches(
  token: string,
  counter: number,
  difficulty = 16,
): Promise<boolean> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${token}:${counter}`),
    ),
  );
  for (let bit = 0; bit < difficulty; bit++)
    if (digest[Math.floor(bit / 8)] & (128 >> (bit % 8))) return false;
  return true;
}
export async function solveGuestProof(
  token: string,
  difficulty = 16,
  timeoutMs = 25000,
): Promise<number> {
  if (token.length > 2048 || difficulty !== 16)
    throw new Error("Некорректная проверка защиты чата.");
  const deadline = Date.now() + timeoutMs;
  for (let counter = 0; counter < 2000000; counter++) {
    if ((counter & 255) === 0) {
      if (Date.now() > deadline)
        throw new Error(
          "Проверка защиты заняла слишком много времени. Повторите запрос.",
        );
      await new Promise((r) => setTimeout(r, 0));
    }
    if (await proofMatches(token, counter, difficulty)) return counter;
  }
  throw new Error("Не удалось завершить проверку защиты чата.");
}
