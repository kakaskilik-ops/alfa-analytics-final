import { useState } from "react";
import Panel from "@/components/common/Panel";
import PriceChart from "@/components/charts/PriceChart";
import { useAsyncData } from "@/hooks/useAsyncData";
import { fetchReferencePrices } from "@/services/referenceMarkets";
import { downloadCsv, tableCsv } from "@/services/export";
import { REFERENCE_SERIES } from "../../../shared/referenceMarkets";
import {
  resolveAnalysisWindow,
  shiftMonths,
  monthEnd,
} from "../../../shared/analysisWindow";
import { buildPriceSeries } from "../../../shared/marketCalculations";
const f = (n: number | null, digits = 2) =>
  n === null
    ? "Недостаточно данных"
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(
        n,
      );
export default function MonthlyAnalytics() {
  const [period, setPeriod] = useState("1Y"),
    [mode, setMode] = useState("price"),
    [selected, setSelected] = useState(["copper"]);
  const { state, reload } = useAsyncData(
    fetchReferencePrices,
    "world-bank-reference",
    true,
  );
  const rows = state.status === "ready" ? state.data : [];
  const window = resolveAnalysisWindow({
    question: "",
    period: period === "all" ? "5Y" : period,
  });
  if (period === "all" && rows.length) {
    const start = rows[0].period_start,
      end = window.requested.end;
    const months =
      (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
      Number(end.slice(5, 7)) -
      Number(start.slice(5, 7)) +
      1;
    window.requested.start = start;
    window.previous = {
      start: shiftMonths(start, -months),
      end: monthEnd(shiftMonths(start, -1)),
    };
    window.label = "Весь доступный ряд";
  }
  const series = buildPriceSeries(
    rows
      .filter((r) => selected.includes(r.metal_id))
      .map((r) => ({
        ...r,
        source_id: "world-bank-pink-sheet",
        retrieved_at: new Date(r.retrievedAt).toISOString(),
      })),
    window,
  );
  function exportRows() {
    downloadCsv(
      `monthly-${period}.csv`,
      tableCsv(
        [
          "Металл",
          "Месяц",
          "Цена",
          "Валюта",
          "Единица",
          "Спецификация",
          "Регион",
          "MoM USD/т",
          "MoM %",
          "Источник",
          "Получено",
        ],
        series.flatMap((s) =>
          s.current.map((p) => [
            s.metalId,
            p.month,
            p.price,
            "USD",
            "т",
            s.specification,
            s.region,
            p.delta,
            p.pct,
            s.url,
            p.receivedAt,
          ]),
        ),
      ),
    );
  }
  return (
    <Panel className="my-5 p-4 md:p-5">
      <h2 className="font-semibold">Месячная аналитика World Bank</h2>
      <p className="mt-2 text-xs text-ink-400">
        Мировые месячные средние на базе LME, USD/т. Отдельные региональные цены
        здесь не представлены. {window.requested.start} — {window.requested.end}
        . {window.monthlyPolicy}
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <label>
          Период{" "}
          <select
            aria-label="Период месячных ориентиров"
            className="rounded border border-ink-700 bg-ink-950 p-2"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {[
              ["1M", "30 дней"],
              ["3M", "90 дней"],
              ["1Y", "Год"],
              ["5Y", "Пять лет"],
              ["all", "Весь срок"],
            ].map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Показатель{" "}
          <select
            aria-label="Показатель месячного графика"
            className="rounded border border-ink-700 bg-ink-950 p-2"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="price">Цена USD/т</option>
            <option value="percent">Изменение от первой точки, %</option>
          </select>
        </label>
        <button
          onClick={exportRows}
          className="text-brand-400"
          disabled={!series.length}
        >
          Экспорт месячных данных CSV
        </button>
      </div>
      <fieldset className="mt-3 flex flex-wrap gap-3 text-xs">
        <legend className="sr-only">Сравнение месячных рядов</legend>
        {REFERENCE_SERIES.map((m) => (
          <label key={m.id}>
            <input
              type="checkbox"
              checked={selected.includes(m.id)}
              onChange={(e) =>
                setSelected((v) =>
                  e.target.checked
                    ? [...v, m.id]
                    : v.filter((id) => id !== m.id),
                )
              }
            />{" "}
            {m.name}
          </label>
        ))}
      </fieldset>
      {state.status === "error" && (
        <p role="status" className="mt-3 text-sm">
          {state.message}{" "}
          <button onClick={reload} className="text-brand-400">
            Повторить
          </button>
        </p>
      )}
      {state.status === "loading" && (
        <p className="mt-3 text-sm">Загрузка наблюдений…</p>
      )}
      {state.status === "ready" && !series.length && (
        <p className="mt-3 text-sm">
          Нет наблюдений в выбранном периоде или не выбран материал.
        </p>
      )}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {series.map((s) => (
          <section
            className="min-w-0 rounded border border-ink-800 p-3"
            key={s.metalId + s.specification}
          >
            <h3 className="text-sm font-semibold">
              {REFERENCE_SERIES.find((m) => m.id === s.metalId)?.name}
            </h3>
            <p className="mt-1 text-xs text-ink-400">
              {s.specification} · {s.currentMetrics.n} месячных точек
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <span>Изменение: {f(s.currentMetrics.change)} USD/т</span>
              <span>{f(s.currentMetrics.changePct)}%</span>
              <span>Среднее: {f(s.currentMetrics.mean)} USD/т</span>
              <span>
                Мин. / макс.: {f(s.currentMetrics.min)} /{" "}
                {f(s.currentMetrics.max)}
              </span>
              <span>
                Месячная волатильность:{" "}
                {f(s.currentMetrics.monthlyVolatilityPct, 4)}%
              </span>
              <span>
                Среднее прошлого окна: {f(s.previousMetrics.mean)} USD/т
              </span>
            </div>
            <PriceChart
              animate={false}
              data={s.current.map((p) => ({
                date: Date.parse(p.month),
                price:
                  mode === "percent"
                    ? (p.price / s.current[0].price - 1) * 100
                    : p.price,
              }))}
              period={
                period === "all" ? "5Y" : (period as "1M" | "3M" | "1Y" | "5Y")
              }
              positive={(s.currentMetrics.change ?? 0) >= 0}
              valueFormatter={(n) =>
                f(n) + (mode === "percent" ? "%" : " USD/т")
              }
              axisFormatter={(n) =>
                new Date(n).toLocaleDateString("ru-RU", {
                  month: "short",
                  year: "2-digit",
                  timeZone: "UTC",
                })
              }
              height={200}
            />
            <p className="text-xs text-ink-400">
              Волатильность по соседним месячным log-доходностям, минимум шесть.
              Для одного месяца изменение не вычисляется; дневные точки не
              создаются.
            </p>
            {s.limitations.map((t) => (
              <p className="mt-1 text-xs text-ink-400" key={t}>
                {t}
              </p>
            ))}
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs text-brand-400"
            >
              Источник и методология ↗
            </a>
          </section>
        ))}
      </div>
    </Panel>
  );
}
