import type { DisplayedPrice } from "@/services/displayedPrices";
export default function VerifiedPrice({ price }: { price: DisplayedPrice }) {
  const fmt = (v: number) =>
    new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 }).format(v);
  return (
    <div
      aria-label={"Подтверждённая цена: " + price.metalId}
      className="mt-5 min-w-0 space-y-2"
    >
      {price.category === "supplier" && (
        <div className="border-t border-ink-700 pt-3 text-xs text-amber-300">
          Предложение поставщика · не рыночная оценка
        </div>
      )}
      <p className="text-2xl font-semibold tabular-nums">
        {price.lowerBound ? "от " : ""}
        {fmt(price.pricePerKg)} <span className="text-sm">USD/кг</span>
      </p>
      <p className="text-sm tabular-nums">
        {price.lowerBound ? "от " : ""}
        {fmt(price.pricePerTon)} USD/т
      </p>
      <p className="text-xs text-brand-400">{price.kind}</p>
      <p className="text-xs text-ink-400">
        {price.taxStatus === "excluded"
          ? "НДС исключён"
          : price.taxStatus === "included"
            ? "НДС включён"
            : "НДС не указан"}
      </p>
      <p className="text-xs text-ink-300">
        Период: {price.dateLabel ?? price.observedOn.slice(0, 7)} ·{" "}
        {price.sourceName}
      </p>
      <p className="break-words text-xs text-ink-400">{price.specification}</p>
      <p className="text-xs text-ink-400">
        {price.region}
        {price.lowerBound
          ? " · Давность цены неизвестна"
          : price.stale
            ? " · Устаревший ориентир"
            : ""}
      </p>
      {price.originalPrice !== undefined && (
        <p className="text-xs text-ink-400">
          Оригинал: {price.lowerBound ? "от " : ""}
          {fmt(price.originalPrice)} {price.originalUnit}.
          {price.originalUnit === "USD/lb" ? " 1 lb = 0,45359237 кг." : ""}
        </p>
      )}
      {price.notes && <p className="text-xs text-ink-400">{price.notes}</p>}
      {price.originalPrice !== undefined && (
        <p className="text-xs text-ink-500">
          Независимое подтверждение этой цены по идентичным условиям не
          получено; рыночная оценка не рассчитывается.
        </p>
      )}
      <p className="text-xs text-ink-500">
        Проверено: {new Date(price.checkedAt).toLocaleDateString("ru-RU")}
      </p>
      <a
        href={price.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="relative z-20 inline-block text-xs text-brand-400"
      >
        Источник: {price.sourceName} ↗
      </a>
    </div>
  );
}
