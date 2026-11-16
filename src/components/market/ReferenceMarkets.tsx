import { useState } from "react";
import Panel from "@/components/common/Panel";
import PriceChart from "@/components/charts/PriceChart";
import { useAsyncData } from "@/hooks/useAsyncData";
import { fetchReferencePrices } from "@/services/referenceMarkets";
import {
  REFERENCE_SERIES,
  WORLD_BANK_URL,
  WORLD_BANK_LICENSE,
} from "../../../shared/referenceMarkets";
import { formatDateTime } from "@/lib/format";
const format = (n: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);
export default function ReferenceMarkets({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [metal, setMetal] = useState<string>(() => {
    try {
      const id = sessionStorage.getItem("reference-metal");
      return REFERENCE_SERIES.some((s) => s.id === id) ? id! : "copper";
    } catch {
      return "copper";
    }
  });
  const { state, reload } = useAsyncData(
    fetchReferencePrices,
    "world-bank-reference",
    true,
  );
  const rows = state.status === "ready" ? state.data : [],
    history = rows.filter((r) => r.metal_id === metal),
    latest = history[history.length - 1],
    previous = history[history.length - 2];
  const change =
    latest && previous ? (latest.price / previous.price - 1) * 100 : null;
  return (
    <Panel className="mt-6 p-5 md:p-6">
      <h2 className="text-lg font-semibold">Месячные ориентиры металлов</h2>
      <p className="mt-1 text-xs text-ink-400">
        World Bank Pink Sheet · мировой ориентир на базе LME · USD за
        метрическую тонну. Месячные средние не являются текущими региональными
        ценами сделки и не включаются в спотовые оценки выше.
      </p>
      {state.status === "loading" && (
        <p className="mt-3 text-sm text-ink-400">Загрузка…</p>
      )}
      {state.status === "error" && (
        <p role="status" className="mt-3 text-sm text-ink-400">
          {state.message}{" "}
          <button type="button" onClick={reload} className="text-brand-400">
            Повторить загрузку ориентиров
          </button>
        </p>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {REFERENCE_SERIES.map((s) => {
          const points = rows.filter((r) => r.metal_id === s.id),
            last = points[points.length - 1];
          return (
            <button
              type="button"
              key={s.id}
              onClick={() => {
                setMetal(s.id);
                if (compact) {
                  try {
                    sessionStorage.setItem("reference-metal", s.id);
                  } catch {
                    /* Storage is optional. */
                  }
                  location.hash = "analytics";
                }
              }}
              aria-pressed={metal === s.id}
              aria-label={`Месячная история: ${s.name}`}
              className={`min-w-0 rounded-lg border p-3 text-left ${metal === s.id ? "border-brand-500/60 bg-brand-500/5" : "border-ink-800"}`}
            >
              <p className="text-sm">
                {s.name} <span className="text-ink-400">{s.symbol}</span>
              </p>
              <p className="mt-1 text-lg font-semibold">
                {last ? `${format(last.price)} USD/т` : "Нет данных"}
              </p>
              <p className="mt-1 text-xs text-ink-400">
                {last
                  ? last.period_start.slice(0, 7)
                  : "Ожидается подтверждённый ряд"}
              </p>
            </button>
          );
        })}
      </div>
      {!compact && latest ? (
        <>
          <p className="mt-4 text-xs text-ink-400">
            {latest.specification}. Период: {latest.period_start.slice(0, 7)}.
            Получено: {formatDateTime(latest.retrievedAt)}.
            {Date.now() - Date.parse(latest.period_start) > 75 * 86400000
              ? " Данные давно не обновлялись."
              : ""}{" "}
            {change === null
              ? ""
              : `Изменение к предыдущему доступному месяцу: ${change >= 0 ? "+" : ""}${format(change)}%.`}
          </p>
          <div
            role="img"
            aria-label={`Месячный график ${metal}, ${history.length} наблюдений`}
          >
            <PriceChart
              animate={false}
              data={history.map((r) => ({
                date: Date.parse(r.period_start),
                price: r.price,
              }))}
              period="5Y"
              axisFormatter={(v) =>
                new Date(v).toLocaleDateString("ru-RU", {
                  month: "short",
                  year: "2-digit",
                  timeZone: "UTC",
                })
              }
              positive={(change ?? 0) >= 0}
              valueFormatter={(n) => `${format(n)} USD/т`}
              height={230}
            />
          </div>
        </>
      ) : (
        !compact &&
        state.status === "ready" && (
          <p className="mt-4 text-sm text-ink-400">
            Нет подтверждённых месячных наблюдений. Региональные котировки для
            остальных материалов требуют отдельного источника.
          </p>
        )
      )}
      <p className="mt-3 text-xs text-ink-500">
        The World Bank: Commodity Price Data (Pink Sheet): LME-based monthly
        averages. ALFA ANALYTICS не связана с Всемирным банком и не представляет
        его.
      </p>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-brand-400">
        <a href={WORLD_BANK_URL} target="_blank" rel="noreferrer">
          Данные и описание рядов ↗
        </a>
        <a href={WORLD_BANK_LICENSE} target="_blank" rel="noreferrer">
          CC BY 4.0 и условия использования ↗
        </a>
      </div>
    </Panel>
  );
}
