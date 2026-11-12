import { comparisonKey, safeSourceUrl } from "@/services/quoteValidation";
import { useState } from "react";
import {
  CONFIDENCE_COLORS,
  CONFIDENCE_LABELS,
  computeAveragePrice,
} from "@/services/averagePrice";
import DataStatusBadge from "@/components/common/DataStatusBadge";
import { cn } from "@/lib/cn";
import { formatIndex, formatDateTime } from "@/lib/format";
import type { AsyncState } from "@/hooks/useAsyncData";
import type { AveragePriceResult, PriceQuoteRecord } from "@/types/market";

interface PriceSummaryPanelProps {
  state: AsyncState<PriceQuoteRecord[]>;
  unit: string;
  currency: string;
}

function formatValue(value: number | null, currency: string): string {
  return value === null ? "—" : `${formatIndex(value)} ${currency}`;
}

function describeState(state: AsyncState<PriceQuoteRecord[]>): string {
  switch (state.status) {
    case "idle":
      return "База данных не подключена, поэтому реальные котировки не загружены. Репрезентативная цена не рассчитывается.";
    case "loading":
      return "Загрузка котировок из базы данных…";
    case "error":
      return `Не удалось загрузить котировки: ${state.message}`;
    case "ready":
      return "котировки из подключённых источников пока не загружены. Репрезентативная цена не рассчитывается, чтобы не создавать ложных данных.";
  }
}

function buildTiles(result: AveragePriceResult, currency: string) {
  return [
    {
      label: "Средневзвешенная",
      value: formatValue(result.weightedAverage, currency),
      hint: "только при обоснованных весах",
    },
    {
      label: "Среднее арифм.",
      value: formatValue(result.simpleAverage, currency),
      hint: undefined,
    },
    {
      label: "Усечённое среднее",
      value: formatValue(result.trimmedMean, currency),
      hint: "10% тримминг",
    },
    {
      label: "Медиана",
      value: formatValue(result.median, currency),
      hint: undefined,
    },
    {
      label: "Минимум",
      value: formatValue(result.min, currency),
      hint: undefined,
    },
    {
      label: "Максимум",
      value: formatValue(result.max, currency),
      hint: undefined,
    },
    {
      label: "Ст. отклонение",
      value: formatValue(result.standardDeviation, currency),
      hint: undefined,
    },
    {
      label: "Разброс",
      value:
        result.dispersion === null
          ? "—"
          : `${formatIndex(result.dispersion * 100)}%`,
      hint: "коэф. вариации",
    },
    {
      label: "Котировок",
      value: String(result.quotationCount),
      hint: undefined,
    },
    { label: "Источников", value: String(result.sourceCount), hint: undefined },
    {
      label: "Выбросы",
      value: String(result.outliers.length),
      hint: undefined,
    },
  ];
}

export default function PriceSummaryPanel({
  state,
  unit,
  currency,
}: PriceSummaryPanelProps) {
  const records = state.status === "ready" ? state.data : [];
  const groups = [...new Set(records.map(comparisonKey))];
  const [group, setGroup] = useState("");
  const selected = group || groups[0];
  const comparable = records.filter((r) => comparisonKey(r) === selected);
  const result = computeAveragePrice(comparable);
  const hasRealData = result.simpleAverage !== null && result.sourceCount >= 2;

  return (
    <div className="rounded-xl border border-ink-800 bg-ink-950/60 p-4">
      {groups.length > 0 && (
        <label className="block text-xs text-ink-300 mb-4">
          Условия сравнения
          <select
            aria-label="Условия сравнения"
            value={selected}
            onChange={(e) => setGroup(e.target.value)}
            className="block w-full bg-ink-900 p-2 mt-2"
          >
            {groups.map((key) => {
              const r = records.find((r) => comparisonKey(r) === key)!;
              return (
                <option key={key} value={key}>
                  {r.region} · {r.marketType} · {r.grade} · {r.productForm} ·{" "}
                  {r.currency}/{r.unit}
                </option>
              );
            })}
          </select>
        </label>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-ink-400">
            ALFA ANALYTICS — Расчётная медиана за {unit}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-100">
            {hasRealData && result.median !== null
              ? `${formatIndex(result.median)} ${currency}`
              : "Недостаточно данных"}
          </p>
        </div>
        {hasRealData ? (
          <DataStatusBadge status="live" />
        ) : (
          <DataStatusBadge status="unavailable" />
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-400">
        {hasRealData
          ? "Медиана сопоставимых котировок. Оценка не гарантирует цену сделки. Веса применяются только при документированном обосновании."
          : "Реальных котировок пока нет. Цена не рассчитана, чтобы не показывать ложные данные."}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-ink-800 pt-4">
        <span className="text-xs text-ink-400">Достоверность</span>
        <span
          className={cn(
            "text-sm font-medium",
            CONFIDENCE_COLORS[result.confidence],
          )}
        >
          {CONFIDENCE_LABELS[result.confidence]}
        </span>
      </div>

      <p className="mt-3 text-xs text-ink-400">
        Качество: {Math.round(result.qualityScore * 100)}%. Исключено:{" "}
        {result.rejectedCount}. {result.reason}
      </p>
      <ul className="mt-3 space-y-2 text-xs text-ink-300">
        {comparable.map((r, i) => (
          <li key={`${r.sourceId}-${r.timestamp}-${i}`}>
            {safeSourceUrl(r.sourceUrl) ? (
              <a
                href={r.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-brand-400"
              >
                {r.sourceName}
              </a>
            ) : (
              r.sourceName
            )}{" "}
            · {r.price} {r.currency}/{r.unit} · {formatDateTime(r.timestamp)} ·
            получено {formatDateTime(r.retrievedAt)} · {r.grade} ·{" "}
            {r.productForm} ·{" "}
            {r.validationStatus === "valid" ? "Проверено" : "Требует проверки"}
          </li>
        ))}
      </ul>
      {result.quotationCount === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-ink-400">
          {describeState(state)}
        </p>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {buildTiles(result, currency).map((tile) => (
            <div
              key={tile.label}
              className="rounded-lg border border-ink-800 p-3"
            >
              <dt className="text-[11px] text-ink-400">{tile.label}</dt>
              <dd className="mt-1 text-sm font-medium tabular-nums text-ink-100">
                {tile.value}
              </dd>
              {tile.hint && (
                <p className="mt-0.5 text-[10px] text-ink-500">{tile.hint}</p>
              )}
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
