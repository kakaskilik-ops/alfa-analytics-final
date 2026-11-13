import RegionalComparison from "@/components/market/RegionalComparison";
import { fetchNews } from "@/services/news";
import { useMemo, useState } from "react";
import PageHeader from "@/components/layout/PageHeader";
import Panel from "@/components/common/Panel";
import PeriodSwitcher from "@/components/common/PeriodSwitcher";
import PriceChart from "@/components/charts/PriceChart";
import { METALS } from "@/data/metals";
import { buildHybridQuotes, type LiveMarketData } from "@/services/liveData";
import { buildQuotesCsv, downloadCsv } from "@/services/export";
import { getVolatility } from "@/services/market";
import { formatPercent, formatPrice } from "@/lib/format";
import type { PeriodKey } from "@/types/market";
import { useAsyncData } from "@/hooks/useAsyncData";
import { fetchQuotationRecords } from "@/services/database";
import { SUPABASE_CONFIGURED } from "@/lib/supabase";
import { comparisonKey } from "@/services/quoteValidation";
import { computeAveragePrice } from "@/services/averagePrice";
export default function AnalyticsPage({
  updatedAt,
  liveData,
}: {
  updatedAt: Date;
  liveData: LiveMarketData | null;
}) {
  const [period, setPeriod] = useState<PeriodKey>("1M");
  const [selected, setSelected] = useState(["tungsten", "molybdenum"]);
  const [material, setMaterial] = useState("copper");
  const quotes = useMemo(
    () =>
      buildHybridQuotes(
        METALS.filter((m) => selected.includes(m.id)),
        period,
        updatedAt,
        liveData,
      ),
    [selected, period, updatedAt, liveData],
  );
  const regional = useAsyncData(
    () => fetchQuotationRecords(material),
    material,
    SUPABASE_CONFIGURED,
  );
  const records = regional.state.status === "ready" ? regional.state.data : [];
  const events = useAsyncData(
    () => fetchNews({ limit: 60 }),
    "analytics-events",
    true,
  );
  const groups = [...new Set(records.map(comparisonKey))];
  return (
    <>
      <PageHeader
        title="Аналитика"
        description="История, динамика и сравнение материалов. Цены отдельных рынков не взаимозаменяемы."
      />
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <PeriodSwitcher value={period} onChange={setPeriod} />
        <button
          className="text-brand-400 text-sm"
          onClick={() =>
            downloadCsv(
              `alfa-analytics-${period}.csv`,
              buildQuotesCsv(quotes, period, updatedAt),
            )
          }
        >
          Экспорт CSV
        </button>
      </div>
      <Panel className="p-5 mb-4">
        <fieldset>
          <legend className="text-sm text-ink-300">
            Материалы для сравнения (до четырёх)
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 max-h-48 overflow-y-auto">
            {METALS.map((m) => (
              <label
                className="flex items-center gap-2 text-sm text-ink-200"
                key={m.id}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(m.id)}
                  disabled={selected.length >= 4 && !selected.includes(m.id)}
                  onChange={(e) =>
                    setSelected((current) =>
                      e.target.checked
                        ? [...current, m.id]
                        : current.filter((id) => id !== m.id),
                    )
                  }
                />
                <span className="truncate">
                  {m.nameRu} ({m.symbol})
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-ink-400 mt-3">
          Выберите материалы для сравнения. Волатильность — стандартное
          отклонение логарифмических изменений наблюдений, без годового
          пересчёта. Динамика — от первого до последнего доступного наблюдения
          внутри периода.
        </p>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        {quotes.map((q) => (
          <Panel className="p-5" key={q.metal.id}>
            <h2 className="text-base font-semibold">{q.metal.nameRu}</h2>
            <div className="text-sm text-ink-300 mt-2 flex flex-wrap gap-4">
              <span>
                Цена: {formatPrice(q.price, q.metal.currency)} /{" "}
                {q.metal.unit === "ozt" ? "тр. унц." : "кг"}
              </span>
              <span>Динамика: {formatPercent(q.changePct)}</span>
              <span>
                Волатильность:{" "}
                {formatPercent(
                  getVolatility(q) === null ? null : getVolatility(q)! * 100,
                )}
              </span>
            </div>
            <PriceChart
              data={q.series}
              period={period}
              positive={(q.changePct ?? 0) >= 0}
              valueFormatter={(v) => formatPrice(v, q.metal.currency)}
              events={
                events.state.status === "ready"
                  ? events.state.data
                      .filter((n) => n.metalIds.includes(q.metal.id))
                      .map((n) => ({
                        date: n.publishedAt,
                        title: n.titleRu ?? n.originalTitle,
                        url: n.url,
                      }))
                  : []
              }
            />
            <p className="text-xs text-ink-400">
              {q.sourceName} · {q.marketLabel || "Нет данных"}
            </p>
          </Panel>
        ))}
      </div>
      <Panel className="p-5 mt-4">
        <RegionalComparison
          metalId={material}
          data={liveData}
          period={period}
          at={updatedAt}
        />
        {events.state.status === "ready" && (
          <div className="my-4 text-xs space-y-2">
            {events.state.data
              .filter((n) => n.metalIds.includes(material))
              .slice(0, 8)
              .map((n) => (
                <p key={n.id}>
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-400"
                  >
                    {new Date(n.publishedAt).toLocaleDateString("ru-RU")} ·{" "}
                    {n.titleRu ?? n.originalTitle}
                  </a>
                </p>
              ))}
          </div>
        )}
        <h2 className="text-base font-semibold mb-3">
          Сравнение регионов и условий рынка
        </h2>
        <select
          aria-label="Материал для сравнения регионов"
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          className="bg-ink-950 rounded p-2 w-full"
        >
          {METALS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nameRu}
            </option>
          ))}
        </select>
        {regional.state.status === "loading" && (
          <p className="mt-4 text-sm">Загрузка…</p>
        )}
        {regional.state.status === "error" && (
          <p role="alert" className="mt-4 text-sm">
            Не удалось загрузить данные.{" "}
            <button onClick={regional.reload} className="text-brand-400">
              Повторить
            </button>
          </p>
        )}
        {!records.length && regional.state.status !== "loading" && (
          <p className="mt-4 text-sm text-ink-400">Недостаточно данных</p>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-[640px] w-full text-sm mt-4 text-left">
            <thead>
              <tr className="text-ink-400">
                <th>Регион</th>
                <th>Рынок / спецификация</th>
                <th>Медиана</th>
                <th>Источников</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((key) => {
                const group = records.filter((r) => comparisonKey(r) === key),
                  r = group[0],
                  result = computeAveragePrice(group);
                return (
                  <tr className="border-t border-ink-800" key={key}>
                    <td className="py-3">{r.region}</td>
                    <td>
                      {r.grade} · {r.productForm}
                    </td>
                    <td>
                      {result.median ?? "Недостаточно данных"} {r.currency}/
                      {r.unit}
                    </td>
                    <td>{result.sourceCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-400 mt-4">
          Медиана считается отдельно для каждой спецификации. Учитывайте условия
          поставки и налогообложения.
        </p>
      </Panel>
    </>
  );
}
