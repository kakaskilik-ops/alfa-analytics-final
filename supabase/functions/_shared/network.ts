export async function limitedText(
  response: Response,
  max: number,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let total = 0,
    result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new Error("body_too_large");
    }
    result += decoder.decode(value, { stream: true });
  }
  return result + decoder.decode();
}
export async function fetchFeed(
  url: string,
  hosts: string[],
  headers: Record<string, string>,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<Response> {
  let current = new URL(url);
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (
      current.protocol !== "https:" ||
      current.username ||
      current.password ||
      (current.port && current.port !== "443") ||
      !hosts.includes(current.hostname)
    )
      throw new Error("feed_host_not_allowed");
    const response = await fetcher(current, {
      headers,
      redirect: "manual",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const target = response.headers.get("location");
      await response.body?.cancel();
      if (!target) throw new Error("invalid_redirect");
      current = new URL(target, current);
      continue;
    }
    return response;
  }
  throw new Error("too_many_redirects");
}
