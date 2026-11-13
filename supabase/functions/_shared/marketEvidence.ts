import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import type { EvidenceFact } from "../../../shared/aiReport.ts";
import { WORLD_BANK_URL } from "../../../shared/referenceMarkets.ts";
import { type AiInput, PERIOD_DAYS, chooseMetalIds } from "./analysis.ts";
import { METAL_IDS } from "./universe.ts";
function publicUrl(value: unknown): string | null {
  try {
    const u = new URL(String(value));
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      ![...u.searchParams.keys()].some((k) =>
        /api.?key|token|secret|password|signature/i.test(k),
      )
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export async function buildMarketEvidence(
  db: SupabaseClient,
  input: AiInput,
  now = Date.now(),
) {
  const end = new Date(now),
    start = new Date(now - PERIOD_DAYS[input.period] * 86400000);
  const { data: catalog, error: catalogError } = await db
    .from("metals")
    .select("id,name_ru,symbol,aliases")
    .in("id", [...METAL_IDS]);
  if (catalogError) throw new Error("evidence_unavailable");
  const ids = chooseMetalIds(input, catalog ?? []);
  const name = (id: string) => catalog?.find((m) => m.id === id)?.name_ru ?? id;
  let newsQuery = db
    .from("news_articles")
    .select(
      "id,original_title,title_ru,metal_ids,published_at,retrieved_at,canonical_url,source_id",
    )
    .eq("is_public", true)
    .lte("published_at", end.toISOString());
  newsQuery = input.newsId
    ? newsQuery.eq("id", input.newsId)
    : newsQuery
        .or(`scope.eq.sector,metal_ids.ov.{${ids.join(",")}}`)
        .gte("published_at", start.toISOString());
  const results = await Promise.all([
    db
      .from("reference_price_observations")
      .select(
        "metal_id,period_start,price,currency,unit,region,specification,retrieved_at",
      )
      .in("metal_id", ids)
      .eq("source_id", "world-bank-pink-sheet")
      .order("period_start", { ascending: false })
      .order("retrieved_at", { ascending: false })
      .limit(160),
    db
      .from("fx_observations")
      .select("base_currency,quote_currency,rate,rate_date,retrieved_at")
      .eq("source_id", "frankfurter-v2")
      .gte("rate_date", new Date(now - 4 * 86400000).toISOString())
      .lte("rate_date", end.toISOString())
      .order("rate_date", { ascending: false })
      .limit(60),
    db
      .from("market_statistics")
      .select(
        "metal_id,metric,value,unit,period_year,country,country_code,region,commodity_code,product_description,estimated,source_url,retrieved_at,source_id",
      )
      .in("metal_id", ids)
      .order("period_year", { ascending: false })
      .order("retrieved_at", { ascending: false })
      .limit(220),
    newsQuery.order("published_at", { ascending: false }).limit(8),
    db
      .from("price_quotations")
      .select(
        "metal_id,normalized_price,normalized_currency,normalized_unit,region,country,grade,product_form,purity,element_content,delivery_terms,source_id,source_url,quoted_at,retrieved_at,price_type",
      )
      .in("metal_id", ids)
      .eq("validation_status", "valid")
      .eq("data_status", "live")
      .gte("quality_score", 0.7)
      .gte(
        "quoted_at",
        new Date(Math.max(start.getTime(), now - 4 * 86400000)).toISOString(),
      )
      .lte("quoted_at", end.toISOString())
      .order("quoted_at", { ascending: false })
      .limit(26),
  ]);
  if (results.some((r) => r.error)) throw new Error("evidence_unavailable");
  const monthly = results[0].data ?? [],
    fx = results[1].data ?? [],
    stats = results[2].data ?? [],
    news = results[3].data ?? [],
    quotes = results[4].data ?? [];
  const facts: EvidenceFact[] = [];
  const add = (fact: Omit<EvidenceFact, "id" | "withinPeriod">) => {
    if (
      !Number.isFinite(Date.parse(fact.periodStart)) ||
      !Number.isFinite(Date.parse(fact.periodEnd)) ||
      Date.parse(fact.periodEnd) > now ||
      !Number.isFinite(Date.parse(fact.receivedAt)) ||
      (typeof fact.value === "number" && !Number.isFinite(fact.value)) ||
      !publicUrl(fact.url)
    )
      return;
    facts.push({
      ...fact,
      id: "",
      withinPeriod:
        Date.parse(fact.periodStart) >= start.getTime() &&
        Date.parse(fact.periodEnd) <= now,
    });
  };
  const seenMonths = new Set<string>(),
    byMetal = new Map<string, typeof monthly>();
  for (const r of monthly) {
    if (
      r.currency !== "USD" ||
      r.unit !== "ton" ||
      r.region !== "Мировой ориентир (LME)" ||
      !/^\d{4}-\d{2}-01$/.test(r.period_start) ||
      !(Number(r.price) > 0)
    )
      continue;
    const key = r.metal_id + r.period_start;
    if (seenMonths.has(key)) continue;
    seenMonths.add(key);
    byMetal.set(r.metal_id, [...(byMetal.get(r.metal_id) ?? []), r]);
  }
  for (const [metalId, points] of byMetal) {
    const selected = points.filter(
      (r) => Date.parse(r.period_start) >= start.getTime(),
    );
    if (!selected.length && points.length) selected.push(points[0]);
    const sampled = [
      ...new Set([
        selected[0],
        selected[Math.floor(selected.length / 2)],
        selected[selected.length - 1],
      ]),
    ].filter(Boolean);
    for (const r of sampled) {
      const date = new Date(r.period_start);
      const last = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      )
        .toISOString()
        .slice(0, 10);
      add({
        metalId,
        kind: "monthly_price",
        label: `${name(metalId)} — месячное среднее World Bank`,
        value: Number(r.price),
        unit: "USD/т",
        periodStart: r.period_start,
        periodEnd: last,
        receivedAt: r.retrieved_at,
        region: r.region,
        specification: r.specification,
        source: "World Bank Pink Sheet",
        url: WORLD_BANK_URL,
      });
    }
    if (selected.length >= 2) {
      const last = selected[0],
        first = selected[selected.length - 1];
      add({
        metalId,
        kind: "monthly_price",
        label: `${name(metalId)} — изменение между доступными месячными средними`,
        value: (Number(last.price) / Number(first.price) - 1) * 100,
        unit: "%",
        periodStart: first.period_start,
        periodEnd: last.period_start,
        receivedAt: last.retrieved_at,
        region: last.region,
        specification:
          "Расчёт сервера по одинаковому ряду, USD/т. Не дневная динамика и не спотовая цена.",
        source: "World Bank Pink Sheet",
        url: WORLD_BANK_URL,
      });
    }
  }
  const pairs = new Set<string>();
  for (const r of fx) {
    const pair = r.base_currency + "/" + r.quote_currency;
    if (
      !["USD/RUB", "EUR/RUB", "CNY/RUB", "USD/CNY", "EUR/USD"].includes(pair) ||
      pairs.has(pair) ||
      !(Number(r.rate) > 0)
    )
      continue;
    pairs.add(pair);
    add({
      metalId: null,
      kind: "fx",
      label: `Справочный курс ${pair}`,
      value: Number(r.rate),
      unit: r.quote_currency + " за " + r.base_currency,
      periodStart: r.rate_date,
      periodEnd: r.rate_date,
      receivedAt: r.retrieved_at,
      region: "Международный справочный курс",
      specification:
        "Frankfurter blended reference. Не текущая биржевая цена и не официальный курс Банка России.",
      source: "Frankfurter v2",
      url: "https://frankfurter.dev/",
    });
  }
  const statsCount = new Map<string, number>();
  for (const r of stats) {
    if (
      (statsCount.get(r.metal_id) ?? 0) >= 6 ||
      (input.region && r.region !== input.region) ||
      !["import_value", "export_value", "mine_production", "reserves"].includes(
        r.metric,
      ) ||
      !(Number(r.value) >= 0) ||
      r.period_year >= end.getUTCFullYear()
    )
      continue;
    statsCount.set(r.metal_id, (statsCount.get(r.metal_id) ?? 0) + 1);
    const labels: Record<string, string> = {
      import_value: "стоимость импорта (CIF)",
      export_value: "стоимость экспорта (FOB)",
      mine_production: "добыча",
      reserves: "запасы",
    };
    add({
      metalId: r.metal_id,
      kind:
        r.metric === "mine_production"
          ? "production"
          : r.metric === "reserves"
            ? "reserves"
            : "trade",
      label: `${name(r.metal_id)} — ${labels[r.metric]}: ${r.country}`,
      value: Number(r.value),
      unit: r.unit,
      periodStart: r.period_year + "-01-01",
      periodEnd: r.period_year + "-12-31",
      receivedAt: r.retrieved_at,
      region: r.country,
      specification: `${r.product_description}; ${r.commodity_code}${r.estimated ? "; оценка источника" : ""}. Торговая стоимость не является рыночной ценой.`,
      source: r.source_id,
      url: r.source_url,
    });
  }
  for (const n of news) {
    if (input.newsId && n.id !== input.newsId) continue;
    add({
      metalId: n.metal_ids?.[0] ?? null,
      kind: "news",
      label: "Полученная новость — только заголовок",
      value: String(n.title_ru ?? n.original_title).slice(0, 400),
      unit: "",
      periodStart: n.published_at,
      periodEnd: n.published_at,
      receivedAt: n.retrieved_at,
      region: "Регион не определён по заголовку",
      specification:
        "Полный текст статьи не загружен; заголовок не доказывает влияние на цену.",
      source: n.source_id,
      url: n.canonical_url,
    });
  }
  const quoteKeys = new Set<string>();
  for (const q of quotes) {
    if (
      (input.region && q.region !== input.region) ||
      q.normalized_currency !== "USD" ||
      q.normalized_unit !== "kg" ||
      !q.delivery_terms ||
      (q.purity == null && q.element_content == null) ||
      (q.region === "Азия" && !q.country) ||
      !(Number(q.normalized_price) > 0)
    )
      continue;
    const key = [
      q.metal_id,
      q.region,
      q.grade,
      q.product_form,
      q.purity,
      q.element_content,
      q.delivery_terms,
      q.price_type,
    ].join("|");
    if (quoteKeys.has(key)) continue;
    quoteKeys.add(key);
    add({
      metalId: q.metal_id,
      kind: "regional_quote",
      label: `${name(q.metal_id)} — отдельное наблюдение поставщика`,
      value: Number(q.normalized_price),
      unit: "USD/кг",
      periodStart: q.quoted_at,
      periodEnd: q.quoted_at,
      receivedAt: q.retrieved_at,
      region: q.region,
      specification: JSON.stringify({
        grade: q.grade,
        form: q.product_form,
        purity: q.purity,
        content: q.element_content,
        delivery: q.delivery_terms,
        priceType: q.price_type,
        country: q.country,
      }),
      source: q.source_id,
      url: q.source_url,
    });
  }
  const sorted = facts.sort(
    (a, b) =>
      (a.metalId ?? "").localeCompare(b.metalId ?? "") ||
      a.kind.localeCompare(b.kind) ||
      b.periodStart.localeCompare(a.periodStart) ||
      a.label.localeCompare(b.label) ||
      String(a.value).localeCompare(String(b.value)),
  );
  const first = ids.flatMap((id) => {
    const fact = sorted.find((f) => f.metalId === id);
    return fact ? [fact] : [];
  });
  const bounded = [...first, ...sorted.filter((f) => !first.includes(f))]
    .slice(0, 60)
    .map((f, i) => ({ ...f, id: "F" + (i + 1) }));
  return {
    facts: bounded,
    metalIds: ids,
    start: start.toISOString(),
    end: end.toISOString(),
    coverage: ids.map((id) => ({
      id,
      name: name(id),
      kinds: [
        ...new Set(bounded.filter((f) => f.metalId === id).map((f) => f.kind)),
      ],
    })),
  };
}
export async function evidenceFingerprint(
  facts: EvidenceFact[],
  extra: unknown = [],
): Promise<string> {
  const value = JSON.stringify([
    "verified-evidence-v1",
    facts.map(({ receivedAt: _, ...f }) => f),
    extra,
  ]);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
