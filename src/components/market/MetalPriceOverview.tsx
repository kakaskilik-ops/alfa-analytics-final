import { useState } from "react";
import { METALS } from "@/data/metals";
import { useAsyncData } from "@/hooks/useAsyncData";
import { fetchDisplayedPrices } from "@/services/displayedPrices";
import type { Metal } from "@/types/market";

const REGIONS = [
  ["all", "Все металлы"],
  ["Europe", "Европа"],
  ["USA", "США"],
  ["Asia", "Азия"],
  ["global", "Мировые ориентиры"],
] as const;

export default function MetalPriceOverview({
  onSelect,
}: {
  onSelect: (metal: Metal) => void;
}) {
  const [region, setRegion] = useState<string>("all");
  const [unit, setUnit] = useState<"kg" | "ton">("kg");
  const { state, reload } = useAsyncData(
    fetchDisplayedPrices,
    "home-metal-prices",
    true,
  );
  const prices = state.status === "ready" ? state.data : [];
  const visible = prices.filter(
    (p) => region === "all" || p.marketRegion === region,
  );
  const primary = visible.filter((p) => p.category !== "supplier");
  const fmt = (n: number) =>
    new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 }).format(n);
  const label = unit === "kg" ? "USD/кг" : "USD/т";
  return (
    <section
      className="mb-6 rounded-2xl border border-ink-800 bg-ink-900/60 p-4 md:p-6"
      aria-label="Цены на металлы"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Цены на металлы</h2>
          <p className="mt-1 text-xs text-ink-400">
            13 материалов · {new Set(primary.map((p) => p.metalId)).size} с
            ценовым ориентиром · предложения поставщиков отдельно
          </p>
        </div>
        <label className="text-xs text-ink-300">
          Единица цены{" "}
          <select
            aria-label="Единица цены"
            value={unit}
            onChange={(e) => setUnit(e.target.value as "kg" | "ton")}
            className="ml-2 rounded border border-ink-700 bg-ink-950 p-2"
          >
            <option value="kg">USD/кг</option>
            <option value="ton">USD/т</option>
          </select>
        </label>
      </div>
      <div className="my-4 flex flex-wrap gap-2" aria-label="Регион цен">
        {REGIONS.map(([id, title]) => (
          <button
            key={id}
            type="button"
            aria-pressed={region === id}
            onClick={() => setRegion(id)}
            className={`rounded-lg border px-3 py-2 text-xs ${region === id ? "border-brand-500 text-brand-400" : "border-ink-700 text-ink-300"}`}
          >
            {title}
          </button>
        ))}
      </div>
      {state.status === "loading" && (
        <p role="status" className="mb-4 text-sm text-ink-400">
          Загрузка подтверждённых наблюдений…
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="mb-4 text-sm text-amber-300">
          Не удалось загрузить цены.{" "}
          <button type="button" onClick={reload} className="underline">
            Повторить
          </button>
        </p>
      )}
      {region !== "all" && primary.length === 0 && (
        <p className="mb-4 text-sm text-ink-400">
          Подтверждённых рыночных котировок для этого региона нет.{" "}
          <button
            type="button"
            onClick={() => setRegion("global")}
            className="text-brand-400 underline"
          >
            Показать мировые ориентиры
          </button>
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {METALS.map((metal) => {
          const rows = visible.filter((p) => p.metalId === metal.id);
          const quote = rows.find((p) => p.category !== "supplier");
          const offers = rows.filter((p) => p.category === "supplier");
          return (
            <article
              key={metal.id}
              aria-label={`Обзор цены: ${metal.id}`}
              className="min-w-0 rounded-xl border border-ink-800 bg-ink-950/60 p-4"
            >
              <button
                type="button"
                onClick={() => onSelect(metal)}
                className="mb-3 flex w-full items-center justify-between gap-2 text-left font-semibold hover:text-brand-400"
              >
                <span>{metal.nameRu}</span>
                <span className="text-brand-400">{metal.symbol} ↗</span>
              </button>
              {quote ? (
                <div className="space-y-1 text-xs text-ink-400">
                  <p className="text-xl font-semibold text-ink-100">
                    {fmt(unit === "kg" ? quote.pricePerKg : quote.pricePerTon)}{" "}
                    <span className="text-xs">{label}</span>
                  </p>
                  <p>
                    {quote.kind} · {quote.observedOn.slice(0, 7)}
                  </p>
                  <p>{quote.region} · НДС не указан</p>
                  <p>{quote.specification}</p>
                  <a
                    className="inline-block text-brand-400"
                    href={quote.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {quote.sourceName} ↗
                  </a>
                  {quote.stale && (
                    <p className="text-amber-300">Устаревший ориентир</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ink-400">
                  Нет подтверждённой рыночной котировки
                </p>
              )}
              {offers.map((offer) => (
                <div
                  key={offer.sourceUrl + offer.specification}
                  className="mt-3 space-y-1 border-t border-ink-800 pt-3 text-xs text-ink-400"
                >
                  <p className="text-amber-300">
                    Предложение поставщика · не рыночная оценка
                  </p>
                  <p className="text-base font-medium text-ink-200">
                    {offer.lowerBound ? "от " : ""}
                    {fmt(
                      unit === "kg" ? offer.pricePerKg : offer.pricePerTon,
                    )}{" "}
                    {label}
                  </p>
                  <p>
                    {offer.kind} · {offer.dateLabel}
                  </p>
                  <p>{offer.specification}</p>
                  <p>{offer.region}</p>
                  <p>
                    {offer.taxStatus === "excluded"
                      ? "НДС исключён"
                      : "НДС не указан"}
                    {offer.lowerBound
                      ? " · Давность неизвестна"
                      : offer.stale
                        ? " · Архивный прайс"
                        : ""}
                  </p>
                  <a
                    className="inline-block text-brand-400"
                    href={offer.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {offer.sourceName} ↗
                  </a>
                </div>
              ))}
            </article>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-ink-500">
        Месячные ориентиры, закупочные предложения и недатированные нижние
        границы прайсов не являются взаимозаменяемыми котировками. НДС и
        диапазоны по догадке не рассчитываются.
      </p>
    </section>
  );
}
