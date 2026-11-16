import { describe, it, expect } from "vitest";
import {
  classifyNews,
  canonicalUrl,
  parseFeed,
  newsFingerprint,
} from "../../shared/news";
const now = Date.now(),
  date = new Date(now - 1000).toUTCString();
const rss = (body: string) =>
  `<rss version="2.0"><channel>${body}</channel></rss>`;
const item = (
  url = "https://example.com/news?utm_source=mail",
  title = "Copper production increases in China",
) =>
  `<item><title>${title}</title><link>${url.replace(/&/g, "&amp;")}</link><description>Mine exports and supply increase.</description><pubDate>${date}</pubDate></item>`;
describe("News classification", () => {
  it("requires explicit metal names and industrial context", () => {
    expect(classifyNews("Co W Sn Cu", "Supply report")).toBeNull();
    expect(
      classifyNews("Copper hair colour", "New fashion technology"),
    ).toBeNull();
    expect(classifyNews("Copper coin collection", "My hobby")).toBeNull();
    expect(
      classifyNews("Chromium browser technology update", "Software production"),
    ).toBeNull();
    expect(
      classifyNews("Медицинские технологии", "Производство препаратов"),
    ).toBeNull();
  });
  it("recognizes a relevant region and economic category", () =>
    expect(
      classifyNews(
        "China tungsten mine export restrictions",
        "Government regulation limits supply",
      ),
    ).toMatchObject({
      metalIds: ["tungsten"],
      regions: ["Азия"],
      categories: expect.arrayContaining(["mining", "trade", "regulation"]),
    }));
  it.each([
    "tungsten",
    "molybdenum",
    "ferromolybdenum",
    "ferrotungsten",
    "tin",
    "zinc",
    "copper",
    "aluminum",
    "chromium",
    "cobalt",
    "zirconium",
    "niobium",
    "tantalum",
  ])("classifies %s only within scope", (metal) =>
    expect(
      classifyNews(`${metal} production outlook`, "Supply and mining report")
        ?.metalIds,
    ).toContain(metal),
  );
  it("does not import other metals", () =>
    expect(
      classifyNews("Gold production expands", "Mine exports increase"),
    ).toBeNull());
  it("does not assign a region from the source location", () =>
    expect(
      classifyNews("Tungsten production", "Global mine supply")?.regions,
    ).toEqual([]));
});
describe("RSS, Atom and public JSON adapters", () => {
  it("parses RSS and deduplicates canonical URLs", () => {
    const result = parseFeed(
      rss(item() + item("https://example.com/news?utm_campaign=x")),
      "rss",
      now,
    );
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://example.com/news");
  });
  it("parses Atom links and dates", () => {
    const feed = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Zinc supply</title><link rel="self" href="https://example.com/self"/><link rel="alternate" href="https://example.com/article"/><summary>Mining report</summary><published>${new Date(now - 1000).toISOString()}</published></entry></feed>`;
    expect(parseFeed(feed, "atom", now)[0].url).toBe(
      "https://example.com/article",
    );
  });
  it("parses JSON Feed without article bodies", () =>
    expect(
      parseFeed(
        JSON.stringify({
          items: [
            {
              title: "Copper production",
              url: "https://example.com/a",
              summary: "Mine report",
              date_published: new Date(now - 1000).toISOString(),
            },
          ],
        }),
        "json",
        now,
      ),
    ).toHaveLength(1));
  it("rejects malformed XML, DTD and oversized input", () => {
    expect(() => parseFeed("<rss>")).toThrow();
    expect(() =>
      parseFeed("<html><body>Access denied</body></html>"),
    ).toThrow();
    expect(() =>
      parseFeed('<!DOCTYPE x [<!ENTITY a "boom">]><rss/>'),
    ).toThrow();
    expect(() => parseFeed("x".repeat(1048577))).toThrow();
  });
  it("does not fabricate a publication date or accept dangerous links", () => {
    expect(
      parseFeed(
        rss(
          "<item><title>Copper mine</title><link>https://example.com</link></item>",
        ),
      ),
    ).toEqual([]);
    expect(parseFeed(rss(item("javascript:alert(1)")))).toEqual([]);
  });
  it("strips markup from feed metadata", () => {
    const result = parseFeed(
      rss(
        item().replace(
          "Mine exports and supply increase.",
          "<![CDATA[<script>bad()</script><b>Supply</b> increases.]]>",
        ),
      ),
    );
    expect(result[0].excerpt).toBe("Supply increases.");
  });
  it("canonicalizes tracking and fragments but keeps meaningful parameters", () => {
    expect(canonicalUrl("https://example.com/a/?id=2&utm_source=a#x")).toBe(
      "https://example.com/a?id=2",
    );
    expect(() => canonicalUrl("https://user:pass@example.com")).toThrow();
  });
  it("uses a stable title/day fingerprint across syndicated URLs", async () => {
    expect(
      await newsFingerprint(
        "Copper: supply expands!",
        new Date(now).toISOString(),
      ),
    ).toBe(
      await newsFingerprint(
        "Copper supply expands",
        new Date(now).toISOString(),
      ),
    );
  });
});

it("sector news keeps no inferred metal tags", () => {
  const r = classifyNews(
    "EU sustainable raw materials supply partnership",
    "Critical raw materials regulation and trade",
  );
  expect(r?.metalIds).toEqual([]);
  expect(classifyNews("Travel holiday", "Summer vacation")).toBeNull();
});

it("normalizes XML-escaped tracking separators before URL deduplication", () => {
  expect(
    canonicalUrl(
      "https://example.com/article?utm_source=rss&amp;amp;utm_medium=feed&amp;id=123",
    ),
  ).toBe("https://example.com/article?id=123");
});
