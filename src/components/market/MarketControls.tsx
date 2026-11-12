import { REGIONS } from "../../../supabase/functions/_shared/universe";
import { METALS } from "@/data/metals";
import type { LiveMarketData } from "@/services/liveData";
import { getRate, getPairMetadata } from "@/services/currency";
import { formatDateTime } from "@/lib/format";
import { DISPLAY_MODES } from "@/data/displayModes";
export default function MarketControls({
  region,
  onRegion,
  mode,
  onMode,
  choices,
  onChoice,
  data,
}: {
  region: string;
  onRegion: (v: string) => void;
  mode: string;
  onMode: (v: string) => void;
  choices: Record<string, string>;
  onChoice: (id: string, key: string) => void;
  data: LiveMarketData | null;
}) {
  const config = DISPLAY_MODES.find((m) => m.id === mode)!;
  return (
    <section className="mb-6 rounded-xl border border-ink-800 p-4 space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-sm text-ink-300">Рынок</span>
        {REGIONS.map((r) => (
          <button
            className={
              region === r
                ? "text-brand-400 border-brand-500 border px-3 py-2 rounded-lg"
                : "text-ink-300 border border-ink-700 px-3 py-2 rounded-lg"
            }
            aria-pressed={region === r}
            key={r}
            onClick={() => onRegion(r)}
          >
            {r}
          </button>
        ))}
        <label className="text-sm text-ink-300">
          Цена{" "}
          <select
            aria-label="Валюта и единица"
            className="bg-ink-900 p-2 rounded"
            value={mode}
            onChange={(e) => onMode(e.target.value)}
          >
            {DISPLAY_MODES.map((m) => (
              <option value={m.id} key={m.id}>
                {m.currency}/{m.unit === "ton" ? "т" : "кг"}
              </option>
            ))}
          </select>
        </label>
      </div>
      {config.currency !== "USD" && (
        <p className="text-xs text-ink-400">
          {getRate("USD", config.currency) === null
            ? "Подтверждённый валютный курс отсутствует. Цена не пересчитывается."
            : `История пересчитывается по текущему подтверждённому курсу; это не исторический валютный ряд. Курс: ${getPairMetadata("USD", config.currency)?.origin ?? ""}, ${formatDateTime(getPairMetadata("USD", config.currency)?.date ?? 0)}`}
        </p>
      )}
      {METALS.map((m) => {
        const options = (data?.regionalQuotes ?? []).filter(
          (q) => q.metalId === m.id && q.region === region,
        );
        return options.length > 1 ? (
          <label className="block text-xs text-ink-300" key={m.id}>
            {m.nameRu}: выберите спецификацию
            <select
              aria-label={`Спецификация: ${m.nameRu}`}
              className="block w-full bg-ink-900 p-2 rounded mt-1"
              value={choices[m.id] ?? ""}
              onChange={(e) => onChoice(m.id, e.target.value)}
            >
              <option value="">Спецификация не выбрана</option>
              {options.map((q) => (
                <option key={q.specificationKey} value={q.specificationKey}>
                  {q.marketLabel} · {q.country ?? ""}
                </option>
              ))}
            </select>
          </label>
        ) : null;
      })}
    </section>
  );
}
