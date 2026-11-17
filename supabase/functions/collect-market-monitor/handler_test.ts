import { fetchMonitorSource, MonitorSourceError, handler } from "./handler.ts";
function assert(value: unknown): asserts value {
  if (!value) throw Error("assertion_failed");
}
Deno.test(
  "monitor network rejects non-allowlisted URLs before fetch",
  async () => {
    for (const url of [
      "http://api.ted.europa.eu/x",
      "https://api.ted.europa.eu.evil.test/x",
      "https://user:pass@api.ted.europa.eu/x",
      "https://api.ted.europa.eu:444/x",
    ]) {
      let calls = 0;
      try {
        await fetchMonitorSource(url, "api.ted.europa.eu", "POST", {}, (() => {
          calls++;
          return Promise.resolve(new Response("{}"));
        }) as typeof fetch);
        throw Error("accepted");
      } catch (e) {
        assert(
          e instanceof MonitorSourceError && e.code === "monitor_host_rejected",
        );
      }
      assert(calls === 0);
    }
  },
);
Deno.test(
  "monitor propagates Retry-After without response text or secrets",
  async () => {
    try {
      await fetchMonitorSource(
        "https://api.ted.europa.eu/x",
        "api.ted.europa.eu",
        "POST",
        {},
        (() =>
          Promise.resolve(
            new Response("PRIVATE", {
              status: 429,
              headers: { "Retry-After": "3600" },
            }),
          )) as typeof fetch,
      );
      throw Error("accepted");
    } catch (e) {
      assert(e instanceof MonitorSourceError);
      assert(e.code === "monitor_rate_limited");
      assert(
        e.retryAfter !== null &&
          Date.parse(e.retryAfter) > Date.now() + 3500000,
      );
      assert(!e.message.includes("PRIVATE"));
    }
  },
);
Deno.test(
  "monitor rejects invalid JSON and enforces no redirects / timeouts",
  async () => {
    let checked = false;
    try {
      await fetchMonitorSource(
        "https://api.ted.europa.eu/x",
        "api.ted.europa.eu",
        "POST",
        {},
        ((_u, init) => {
          assert(init?.redirect === "error");
          assert(init.signal instanceof AbortSignal);
          checked = true;
          return Promise.resolve(new Response("<html>not JSON</html>"));
        }) as typeof fetch,
      );
      throw Error("accepted");
    } catch (e) {
      assert(
        e instanceof MonitorSourceError &&
          e.code === "monitor_invalid_or_oversized_json",
      );
    }
    assert(checked);
  },
);
Deno.test("monitor collector is not a public GET endpoint", async () => {
  assert(
    (await handler(new Request("https://example.test", { method: "GET" })))
      .status === 405,
  );
});
