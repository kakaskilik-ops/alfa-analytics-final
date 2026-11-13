import { useState } from "react";
import { REGIONS } from "../../../supabase/functions/_shared/universe";
import {
  buildHybridQuote,
  displayQuote,
  type LiveMarketData,
} from "@/services/liveData";
import { METAL_MAP } from "@/data/metals";
import { formatPrice, formatDateTime, formatPercent } from "@/lib/format";
import PriceChart from "@/components/charts/PriceChart";
import type { PeriodKey } from "@/types/market";
export default function RegionalComparison({
  metalId,
  data,
  period,
  at,
}: {
  metalId: string;
  data: LiveMarketData | null;
  period: PeriodKey;
  at: Date;
}) {
  const candidates = (data?.regionalQuotes ?? []).filter(
    (q) => q.metalId === metalId,
  );
  const [selected, setSelected] = useState<Record<string, string>>({});
  const rows = REGIONS.map((region) => {
    const options = candidates.filter((q) => q.region === region);
    const live =
      options.find((q) => q.specificationKey === selected[region]) ??
      (options.length === 1 ? options[0] : null);
    const quote = displayQuote(
      buildHybridQuote(METAL_MAP[metalId], period, at, live),
      data,
    );
    return { region, options, live, quote };
  });
  const base = rows.find((r) => r.region === "Европа");
  function comparable(a: string | undefined, b: string | undefined) {
    if (!a || !b) return false;
    const x = JSON.parse(a),
      y = JSON.parse(b);
    x[3] = null;
    y[3] = null;
    x[9] = null;
    y[9] = null;
    return JSON.stringify(x) === JSON.stringify(y);
  }
  return (
    <section className="rounded-xl border border-ink-800 p-4">
      <h3 className="font-semibold text-sm mb-3">Три мировых рынка</h3>
      <p className="text-xs text-ink-400 mb-4">
        Независимые региональные наблюдения. Цены без спецификации не
        объединяются. Процент относительно Европы доступен только для одинаковых
        коммерческих условий; страна происхождения указана отдельно.
      </p>
      <div className="grid gap-4 xl:grid-cols-3">
        {rows.map((r) => (
          <div className="min-w-0" key={r.region}>
            <h4 className="text-sm font-medium">{r.region}</h4>
            {r.options.length > 1 && (
              <select
                className="w-full bg-ink-900 p-2 text-xs my-2"
                aria-label={`Сравнение ${r.region}: спецификация`}
                value={selected[r.region] ?? ""}
                onChange={(e) =>
                  setSelected((v) => ({ ...v, [r.region]: e.target.value }))
                }
              >
                <option value="">Выберите условия</option>
                {r.options.map((q) => (
                  <option key={q.specificationKey} value={q.specificationKey}>
                    {q.marketLabel} {q.country}
                  </option>
                ))}
              </select>
            )}
            <p className="text-sm mt-2">
              {r.quote.price === null
                ? "Нет подтверждённых данных"
                : formatPrice(r.quote.price, r.quote.metal.currency)}
            </p>
            <p className="text-xs text-ink-400">
              {r.live?.country ?? ""} {formatDateTime(r.quote.publishedAt)}
            </p>
            {r.live && (
              <a
                href={r.live.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand-400"
              >
                {r.live.sourceName}
              </a>
            )}
            <p className="text-xs mt-2 text-ink-400">
              Изменение: {formatPercent(r.quote.changePct)}
            </p>
            {r.region !== "Европа" &&
              base?.quote.price &&
              r.quote.price !== null &&
              comparable(
                base.live?.specificationKey,
                r.live?.specificationKey,
              ) && (
                <p className="text-xs text-ink-400">
                  К Европе:{" "}
                  {formatPercent((r.quote.price / base.quote.price - 1) * 100)}
                </p>
              )}
            <PriceChart
              data={r.quote.series}
              period={period}
              positive={(r.quote.changePct ?? 0) >= 0}
              valueFormatter={(v) => formatPrice(v, r.quote.metal.currency)}
              height={180}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
