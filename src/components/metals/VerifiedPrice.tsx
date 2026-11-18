import { useState } from "react";
import type { DisplayedPrice } from "@/services/displayedPrices";
export default function VerifiedPrice({
  price: basePrice,
  secondary = false,
  unit = "kg",
}: {
  price: DisplayedPrice;
  secondary?: boolean;
  unit?: "kg" | "ton";
}) {
  const [taxSelection, setTaxSelection] = useState(
    basePrice.taxStatus !== "excluded" &&
      basePrice.taxViews?.some((v) => v.taxStatus === "excluded")
      ? "excluded"
      : "primary",
  );
  const view = basePrice.taxViews?.find((v) => v.taxStatus === taxSelection);
  const price: DisplayedPrice = view
    ? {
        ...basePrice,
        taxStatus: view.taxStatus,
        vatRate: view.vatRate,
        taxStatusVerified: true,
        pricePerKg: view.point ?? view.minimum!,
        pricePerTon: (view.point ?? view.minimum!) * 1000,
        minimumPerKg: view.minimum,
        maximumPerKg: view.maximum,
        sourceUrl: view.sourceUrl,
        sourcePublishedOn: view.sourcePublishedOn,
      }
    : basePrice;
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
        (secondary
          ? "Дополнительное наблюдение: "
          : price.category === "supplier"
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
      {!!price.taxViews?.length && (
        <label
          className="relative z-20 block text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          Налоговое представление{" "}
          <select
            aria-label={"Налоговое представление: " + price.metalId}
            value={taxSelection}
            onChange={(e) => setTaxSelection(e.target.value)}
            className="max-w-full rounded border border-ink-700 bg-ink-950 p-1"
          >
            <option value="primary">Исходная запись</option>
            {price.taxViews
              .filter((v) => v.taxStatus !== basePrice.taxStatus)
              .map((v) => (
                <option key={v.taxStatus} value={v.taxStatus}>
                  {v.taxStatus === "included" ? "С НДС" : "Без НДС"} ·
                  публикация источника
                </option>
              ))}
          </select>
        </label>
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
          ? "Без НДС"
          : price.taxStatus === "included"
            ? "С НДС"
            : "НДС не указан"}
      </p>
      {price.vatRate !== undefined && (
        <p className="text-xs text-ink-400">
          Ставка НДС: {fmt(price.vatRate * 100)}%
        </p>
      )}
      {price.category === "owner_reference" && (
        <p className="text-xs text-ink-400">
          {price.taxStatusVerified
            ? "Налоговый статус подтверждён для наблюдения"
            : "Налоговый статус исходного снимка независимо не подтверждён"}
        </p>
      )}
      {price.category === "owner_reference" && (
        <p className="text-xs text-ink-400">
          Исходная запись владельца: {price.originalUnit}
        </p>
      )}
      {price.publisherCurrency && price.publisherUnit && (
        <p className="text-xs text-ink-400">
          Единица сопоставимого ряда издателя: {price.publisherCurrency}/
          {price.publisherUnit}. Пересчёт НДС и курса не предполагается.
        </p>
      )}
      {price.seriesContext && (
        <details
          className="relative z-20 text-xs text-ink-400"
          onClick={(e) => e.stopPropagation()}
        >
          <summary className="cursor-pointer">
            Проверка сопоставимого ряда
          </summary>
          <p className="mt-2 break-words">{price.seriesContext}</p>
        </details>
      )}
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
      {!!price.alternatives?.length && !secondary && (
        <details
          className="relative z-20 text-left text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <summary className="cursor-pointer text-brand-400">
            Другие независимые наблюдения ({price.alternatives.length})
          </summary>
          {price.alternatives.map((p) => (
            <VerifiedPrice
              key={p.observationId}
              price={p}
              unit={unit}
              secondary
            />
          ))}
        </details>
      )}
    </div>
  );
}
