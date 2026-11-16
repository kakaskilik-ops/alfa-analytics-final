import { useEffect, useState } from "react";
import { ArrowLeftRight, RefreshCw } from "lucide-react";
import Panel from "@/components/common/Panel";
import PriceChart from "@/components/charts/PriceChart";
import {
  fetchFxRates,
  fxPair,
  convertMoney,
  FX_PAIRS,
  type FxRate,
} from "@/services/fx";
import { FX_CURRENCIES, type FxCurrency } from "../../../shared/fx";
import { formatDateTime } from "@/lib/format";
const number = (value: number, digits = 4) =>
  new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
export default function CurrencyModule() {
  const [rows, setRows] = useState<FxRate[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0),
    [selected, setSelected] = useState(0),
    [days, setDays] = useState(30);
  const [amount, setAmount] = useState("100"),
    [from, setFrom] = useState<FxCurrency>("USD"),
    [to, setTo] = useState<FxCurrency>("RUB");
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchFxRates();
        if (active) {
          setRows(data);
          setError("");
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Курсы недоступны.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(load, 300000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refresh]);
  const now = Date.now(),
    [base, quote] = FX_PAIRS[selected],
    pair = fxPair(rows, base, quote, now);
  const series = pair.history
    .filter((r) => r.date >= now - days * 86400000)
    .map((r) => ({ date: r.date, price: r.rate }));
  const converted = convertMoney(amount, from, to, rows, now),
    conversionPair = fxPair(rows, from, to, now);
  return (
    <Panel className="mt-6 p-5 md:p-6">
      <section aria-labelledby="currency-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="currency-title" className="text-lg font-semibold">
              Курсы валют
            </h2>
            <p className="mt-1 text-xs text-ink-400">
              Расчётные справочные курсы Frankfurter. Это не биржевые котировки
              в реальном времени.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRefresh((v) => v + 1)}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-brand-400 disabled:opacity-40"
            aria-label="Обновить курсы валют"
          >
            <RefreshCw size={14} />
            {loading ? "Загрузка…" : "Обновить"}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-loss-400">
            {error}{" "}
            {rows.length > 0
              ? "Показаны ранее загруженные значения с датами."
              : ""}
          </p>
        )}
        {!loading && !error && !rows.length && (
          <p className="mt-3 text-sm text-ink-400">Нет данных по валютам.</p>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {FX_PAIRS.map(([a, b], i) => {
            const p = fxPair(rows, a, b, now);
            return (
              <button
                type="button"
                key={a + b}
                aria-pressed={selected === i}
                aria-label={`История ${a}/${b}`}
                onClick={() => setSelected(i)}
                className={`min-w-0 rounded-lg border p-3 text-left ${selected === i ? "border-brand-500/60 bg-brand-500/5" : "border-ink-800"}`}
              >
                <span className="text-xs text-ink-400">
                  {a}/{b}
                </span>
                <p className="mt-1 break-words text-lg font-semibold tabular-nums">
                  {p.latest ? number(p.latest.rate) : "Нет данных"}
                </p>
                <p
                  className={`mt-1 text-xs ${p.change === null ? "text-ink-500" : p.change >= 0 ? "text-brand-400" : "text-loss-400"}`}
                >
                  {p.change === null
                    ? "Нет предыдущего значения"
                    : `${p.change >= 0 ? "+" : ""}${number(p.change)} (${number(p.changePct!, 2)}%)`}
                </p>
                <p className="mt-1 text-[11px] text-ink-400">
                  {p.latest
                    ? new Date(p.latest.date).toLocaleDateString("ru-RU", {
                        timeZone: "UTC",
                      })
                    : "—"}
                  {p.latest && p.stale ? " · Устарел" : ""}
                </p>
              </button>
            );
          })}
        </div>
        <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                История {base}/{quote}
              </h3>
              <div className="flex gap-2">
                {[7, 30].map((d) => (
                  <button
                    type="button"
                    key={d}
                    aria-pressed={days === d}
                    onClick={() => setDays(d)}
                    className={`rounded px-2 py-1 text-xs ${days === d ? "bg-ink-800 text-brand-400" : "text-ink-400"}`}
                  >
                    {d} дней
                  </button>
                ))}
              </div>
            </div>
            <div
              role="img"
              aria-label={`График курса ${base}/${quote}, ${series.length} наблюдений`}
            >
              <PriceChart
                animate={false}
                data={series}
                period="1M"
                positive={(pair.change ?? 0) >= 0}
                valueFormatter={(v) => number(v)}
                height={210}
              />
            </div>
            {pair.latest && (
              <p className="text-xs text-ink-400">
                Курс на{" "}
                {new Date(pair.latest.date).toLocaleDateString("ru-RU", {
                  timeZone: "UTC",
                })}
                . Получен {formatDateTime(pair.latest.retrievedAt)}.{" "}
                {pair.previous
                  ? `Изменение относительно ${new Date(pair.previous.date).toLocaleDateString("ru-RU", { timeZone: "UTC" })}.`
                  : ""}{" "}
                Всего {series.length} наблюдений за выбранный период. Дни без
                наблюдений не заполняются.
              </p>
            )}
          </div>
          <div className="min-w-0 rounded-lg border border-ink-800 p-4">
            <h3 className="text-sm font-semibold">Конвертер валют</h3>
            <label className="mt-3 block text-xs text-ink-400">
              Сумма
              <input
                aria-label="Сумма для конвертации"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded border border-ink-700 bg-ink-950 p-2 text-ink-100"
              />
            </label>
            <div className="mt-3 flex items-end gap-2">
              {(
                [
                  [from, setFrom, "Из валюты"],
                  [to, setTo, "В валюту"],
                ] as const
              ).map(([value, set, label]) => (
                <label
                  key={label}
                  className="min-w-0 flex-1 text-xs text-ink-400"
                >
                  {label}
                  <select
                    aria-label={label}
                    value={value}
                    onChange={(e) => set(e.target.value as FxCurrency)}
                    className="mt-1 w-full rounded border border-ink-700 bg-ink-950 p-2 text-ink-100"
                  >
                    {FX_CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              ))}
              <button
                type="button"
                aria-label="Поменять валюты местами"
                onClick={() => {
                  setFrom(to);
                  setTo(from);
                }}
                className="p-2 text-brand-400"
              >
                <ArrowLeftRight size={18} />
              </button>
            </div>
            <output
              aria-live="polite"
              aria-label="Результат конвертации"
              className="mt-4 block break-words text-xl font-semibold"
            >
              {converted === null
                ? "Нет данных"
                : `${number(converted, 2)} ${to}`}
            </output>
            <p className="mt-2 text-xs text-ink-400">
              {from === to
                ? "Одинаковые валюты: курс 1:1."
                : conversionPair.latest && !conversionPair.stale
                  ? `1 ${from} = ${number(conversionPair.latest.rate)} ${to}. Справочный расчёт без комиссий.`
                  : "Введите неотрицательную сумму. Для пересчёта нужен курс не старше четырёх суток."}
            </p>
          </div>
        </div>
        <a
          href="https://frankfurter.dev/"
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-xs text-brand-400"
        >
          Источник и методология Frankfurter ↗
        </a>
        <p className="mt-1 text-xs text-ink-500">
          Первичные провайдеры сохраняются в базе. Сервер обновляет данные
          ежечасно; этот блок проверяет обновления каждые пять минут. Банк
          России напрямую не используется.
        </p>
      </section>
    </Panel>
  );
}
