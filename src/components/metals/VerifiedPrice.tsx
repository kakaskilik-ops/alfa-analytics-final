import type { DisplayedPrice } from "@/services/displayedPrices";
export default function VerifiedPrice({
  price,
  unit = "kg",
}: {
  price: DisplayedPrice;
  unit?: "kg" | "ton";
}) {
  const fmt = (v: number) =>
    new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 }).format(v);
  const factor = unit === "kg" ? 1 : 1000;
  const basis =
    price.massBasis === "contained_mo"
      ? " содержащегося Mo"
      : price.massBasis === "alloy"
        ? " сплава"
        : "";
  const unitLabel = `USD/${unit === "kg" ? "кг" : "т"}${basis}`;
  const range =
    price.minimumPerKg !== undefined && price.maximumPerKg !== undefined;
  return (
    <div
      aria-label={
        (price.category === "supplier"
          ? "Закупочное предложение: "
          : "Ценовой ориентир: ") + price.metalId
      }
      className="mt-5 min-w-0 space-y-2"
    >
      {price.category === "supplier" && (
        <div className="border-t border-ink-700 pt-3 text-xs text-amber-300">
          Предложение поставщика · не рыночная оценка
        </div>
      )}
      <p className="text-2xl font-semibold tabular-nums">
        {price.lowerBound ? "от " : ""}
        {range
          ? `${fmt(price.minimumPerKg! * factor)}–${fmt(price.maximumPerKg! * factor)}`
          : fmt(price.pricePerKg * factor)}{" "}
        <span className="text-sm">{unitLabel}</span>
      </p>
      {price.category !== "owner_reference" && (
        <p className="text-sm tabular-nums">
          {price.lowerBound ? "от " : ""}
          {fmt(price.pricePerTon)} USD/т
        </p>
      )}
      <p className="text-xs text-brand-400">{price.kind}</p>
      {price.category === "owner_reference" && (
        <p className="text-xs text-amber-300">
          {price.verificationStatus === "verified"
            ? "Первоисточник и права подтверждены"
            : price.verificationStatus === "source_matched"
              ? "Публикация найдена · полная проверка не завершена"
              : "Предоставлено владельцем · независимая проверка не завершена"}
        </p>
      )}
      <p className="text-xs text-ink-400">
        {price.taxStatus === "excluded"
          ? "НДС исключён"
          : price.taxStatus === "included"
            ? "НДС включён"
            : "НДС не указан"}
      </p>
      <p className="text-xs text-ink-300">
        Период:{" "}
        {price.dateLabel ??
          (price.category === "reference"
            ? price.observedOn.slice(0, 7)
            : price.observedOn)}{" "}
        · {price.sourceName}
      </p>
      <p className="break-words text-xs text-ink-400">{price.specification}</p>
      <p className="text-xs text-ink-400">
        {price.region}
        {price.lowerBound
          ? " · Давность цены неизвестна"
          : price.stale
            ? price.category === "owner_reference"
              ? " · Исторический снимок"
              : " · Устаревший ориентир"
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
      {price.sourcePublishedOn && (
        <p className="text-xs text-ink-400">
          Публикация источника: {price.sourcePublishedOn} (не дата сделки)
        </p>
      )}
      {price.originalPrice !== undefined && (
        <p className="text-xs text-ink-500">
          Независимое подтверждение этой цены по идентичным условиям не
          получено; рыночная оценка не рассчитывается.
        </p>
      )}
      {price.category !== "owner_reference" && (
        <p className="text-xs text-ink-500">
          Проверено: {new Date(price.checkedAt).toLocaleDateString("ru-RU")}
        </p>
      )}
      {price.sourceUrl && (
        <a
          onClick={(event) => event.stopPropagation()}
          href={price.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="relative z-20 inline-block text-xs text-brand-400"
        >
          {price.category === "owner_reference"
            ? "Публикация для сверки"
            : "Источник"}
          : {price.sourceName} ↗
        </a>
      )}
    </div>
  );
}
