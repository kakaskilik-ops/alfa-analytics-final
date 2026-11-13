import ReferenceMarkets from "@/components/market/ReferenceMarkets";
import CurrencyModule from "@/components/currency/CurrencyModule";
import { useMemo, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import Delta from "@/components/common/Delta";
import LastUpdated from "@/components/common/LastUpdated";
import Panel from "@/components/common/Panel";
import PeriodSwitcher from "@/components/common/PeriodSwitcher";
import SearchInput from "@/components/common/SearchInput";
import PriceChart from "@/components/charts/PriceChart";
import PageHeader from "@/components/layout/PageHeader";
import MarketStatCard from "@/components/market/MarketStatCard";
import MoversList from "@/components/market/MoversList";
import QuotesTable from "@/components/market/QuotesTable";
import MetalDetailDialog from "@/components/metals/MetalDetailDialog";
import { METALS } from "@/data/metals";
import { formatIndex, formatPercent } from "@/lib/format";
import type { FavoritesState } from "@/hooks/useFavorites";
import {
  buildQuotesCsv,
  buildExcelXml,
  downloadCsv,
  downloadExcel,
} from "@/services/export";
import { buildIndex } from "@/services/market";
import { buildHybridQuotes } from "@/services/liveData";
import type { LiveMarketData } from "@/services/liveData";
import type { Metal, PeriodKey } from "@/types/market";

interface MarketPageProps {
  updatedAt: Date;
  favorites: FavoritesState;
  liveData: LiveMarketData | null;
}

export default function MarketPage({
  updatedAt,
  favorites,
  liveData,
}: MarketPageProps) {
  const [period, setPeriod] = useState<PeriodKey>("1M");
  const [query, setQuery] = useState("");
  const [selectedMetal, setSelectedMetal] = useState<Metal | null>(null);

  const quotes = useMemo(
    () => buildHybridQuotes(METALS, period, updatedAt, liveData),
    [period, updatedAt, liveData],
  );
  const index = useMemo(() => buildIndex(quotes), [quotes]);
  const ranked = useMemo(
    () =>
      quotes
        .filter((q) => q.changePct !== null)
        .sort((a, b) => b.changePct! - a.changePct!)
        .slice(0, 10),
    [quotes],
  );

  const liveCount = quotes.filter((q) => q.dataStatus === "live").length;

  const indexFirst = index[0]?.price ?? null;
  const indexLast = index[index.length - 1]?.price ?? null;
  const indexChangePct =
    indexFirst && indexLast
      ? ((indexLast - indexFirst) / indexFirst) * 100
      : null;
  const dynamics = quotes.filter((q) => q.changePct !== null);
  const averageChangePct = dynamics.length
    ? dynamics.reduce((sum, q) => sum + q.changePct!, 0) / dynamics.length
    : null;
  const risingCount = dynamics.filter((quote) => quote.changePct! > 0).length;
  const leader = ranked[0];

  const normalizedQuery = query.trim().toLowerCase();
  const visibleQuotes = normalizedQuery
    ? quotes.filter(
        (quote) =>
          quote.metal.nameRu.toLowerCase().includes(normalizedQuery) ||
          quote.metal.aliases.some((a) =>
            a.toLowerCase().includes(normalizedQuery),
          ) ||
          quote.metal.name.toLowerCase().includes(normalizedQuery) ||
          quote.metal.symbol.toLowerCase().includes(normalizedQuery),
      )
    : quotes;

  return (
    <>
      <PageHeader
        title="Обзор рынка"
        description="Подтверждённые котировки и история. Расчётные показатели не гарантируют цену сделки."
        actions={
          <>
            <span className="inline-flex items-center gap-2 rounded-md border border-ink-700 bg-ink-900 px-2.5 py-1 text-xs text-ink-300">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
              {liveCount} с котировками / {quotes.length - liveCount} без данных
            </span>
            {liveData?.updatedAt ? (
              <LastUpdated at={new Date(liveData.updatedAt)} />
            ) : (
              <span className="text-xs text-ink-400">
                Нет региональных котировок
              </span>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MarketStatCard
          label="Индекс рынка металлов"
          value={formatIndex(indexLast)}
          footer={
            <Delta
              value={indexChangePct}
              text={`${formatPercent(indexChangePct)} за период`}
            />
          }
        />
        <MarketStatCard
          label="Средняя динамика"
          value={formatPercent(averageChangePct)}
          footer={<span>по {dynamics.length} металлам</span>}
        />
        <MarketStatCard
          label="Растут / падают"
          value={
            dynamics.length
              ? `${risingCount} / ${dynamics.filter((q) => q.changePct! < 0).length}`
              : "—"
          }
          footer={<span>металлов за период</span>}
        />
        <MarketStatCard
          label="Лидер роста"
          value={leader && leader.changePct! > 0 ? leader.metal.nameRu : "—"}
          footer={
            <Delta
              value={leader?.changePct ?? null}
              text={`${formatPercent(leader?.changePct ?? null)} за период`}
            />
          }
        />
      </div>

      <CurrencyModule />
      <ReferenceMarkets compact />

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel className="p-5 md:p-6 xl:col-span-2">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-semibold text-ink-100">
                  Индекс рынка металлов
                </h2>
              </div>
              <p className="mt-1 text-xs text-ink-400">
                Равные веса, база 100; минимум 2 металла и общие даты. Без
                интерполяции.
              </p>
            </div>
            <PeriodSwitcher value={period} onChange={setPeriod} />
          </div>
          <PriceChart
            data={index}
            period={period}
            positive={(indexChangePct ?? 0) >= 0}
            valueFormatter={formatIndex}
            height={index.length < 2 ? 140 : 300}
          />
        </Panel>

        <Panel className="p-5 md:p-6">
          <h2 className="text-base font-semibold text-ink-100">
            Лидеры изменения
          </h2>
          <p className="mb-6 mt-1 text-xs text-ink-400">
            Металлы по изменению % за выбранный период
          </p>
          <MoversList rankedQuotes={ranked} onSelect={setSelectedMetal} />
        </Panel>
      </div>

      <Panel className="mt-4 overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-ink-800 p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-semibold text-ink-100">
                Котировки металлов
              </h2>
            </div>
            <p className="mt-1 text-xs text-ink-400">
              Нажмите на металл, чтобы открыть карточку
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Поиск металлов"
              className="md:w-72"
            />
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  `metals-analytics-market-${period}-${updatedAt.toISOString().slice(0, 10)}.csv`,
                  buildQuotesCsv(visibleQuotes, period, updatedAt),
                )
              }
              disabled={visibleQuotes.length === 0}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-ink-700 bg-ink-950 px-4 text-sm text-ink-200 transition-colors duration-200 hover:border-brand-500/40 hover:text-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              CSV
            </button>
            <button
              type="button"
              onClick={() =>
                downloadExcel(
                  `metals-analytics-market-${period}-${updatedAt.toISOString().slice(0, 10)}.xls`,
                  buildExcelXml(visibleQuotes, period, updatedAt),
                )
              }
              disabled={visibleQuotes.length === 0}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-ink-700 bg-ink-950 px-4 text-sm text-ink-200 transition-colors duration-200 hover:border-brand-500/40 hover:text-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              Excel
            </button>
          </div>
        </div>
        <QuotesTable
          quotes={visibleQuotes}
          emptyText={`Ничего не найдено по запросу «${query.trim()}»`}
          isFavorite={favorites.isFavorite}
          onToggleFavorite={favorites.toggleFavorite}
          onSelect={setSelectedMetal}
        />
      </Panel>

      {selectedMetal && (
        <MetalDetailDialog
          metal={selectedMetal}
          initialPeriod={period}
          updatedAt={updatedAt}
          isFavorite={favorites.isFavorite(selectedMetal.id)}
          onToggleFavorite={() => favorites.toggleFavorite(selectedMetal.id)}
          onClose={() => setSelectedMetal(null)}
          liveData={liveData}
        />
      )}
    </>
  );
}
