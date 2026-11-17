import { useEffect, useState } from "react";
import Panel from "@/components/common/Panel";
import PriceChart from "@/components/charts/PriceChart";
import { useAsyncData } from "@/hooks/useAsyncData";
import { fetchMonitorData, type MonitorData } from "@/services/monitor";
import { METALS } from "@/data/metals";
import { REGIONS } from "../../../supabase/functions/_shared/universe";
import {
  MONITOR_STAGES,
  MONITOR_AMOUNT_BASES,
  MONITOR_PRICE_KINDS,
  monitorStory,
  monitorComparisonKey,
} from "../../../shared/monitor";
import { formatDateTime } from "@/lib/format";
import { tableCsv, downloadCsv } from "@/services/export";
export default function MarketMonitor({
  initialMetal = "",
  initialRegion = "",
  initialDays = 0,
  compact = false,
}: {
  initialMetal?: string;
  initialRegion?: string;
  initialDays?: number;
  compact?: boolean;
}) {
  const [metal, setMetal] = useState(initialMetal),
    [region, setRegion] = useState(initialRegion),
    [stage, setStage] = useState(""),
    [tab, setTab] = useState("events"),
    [version, setVersion] = useState(0);
  const [days, setDays] = useState(String(initialDays));
  useEffect(() => {
    const timer = setInterval(() => setVersion((v) => v + 1), 60000);
    return () => clearInterval(timer);
  }, []);
  const { state, reload } = useAsyncData(
    fetchMonitorData,
    "monitor-" + version,
    true,
  );
  const [cached, setCached] = useState<MonitorData | null>(null);
  useEffect(() => {
    if (state.status === "ready") setCached(state.data);
  }, [state]);
  const data = state.status === "ready" ? state.data : cached;
  const rows = (data?.events ?? []).filter(
    (r) =>
      (!metal || r.data.metalIds.includes(metal)) &&
      (!region || r.data.region === region) &&
      (!stage || r.data.stage === stage) &&
      (!Number(days) ||
        Date.parse(r.data.publishedOn ?? "") >=
          Date.now() - Number(days) * 86400000),
  );
  const priced = rows.filter((r) => r.data.pricePerKg !== null);
  const comparable = priced.filter((r) => r.data.comparable),
    groups = [...new Set(comparable.map((r) => monitorComparisonKey(r.data)))];
  const [group, setGroup] = useState("");
  const current = groups.includes(group) ? group : groups[0];
  const history = comparable
    .filter((r) => monitorComparisonKey(r.data) === current)
    .sort((a, b) =>
      (a.data.publishedOn ?? "").localeCompare(b.data.publishedOn ?? ""),
    );
  const fmt = (v: string | null) =>
    v === null
      ? "Не опубликовано"
      : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 6 }).format(
          Number(v),
        );
  return (
    <section className="my-5" aria-label="ALFA MARKET MONITOR">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">ALFA MARKET MONITOR</h2>
          <p className="mt-1 text-xs text-ink-400">
            Официальные закупки, результаты и контрактные записи. Сбор и
            публикация работают без ИИ. Присуждение не означает исполненную
            продажу.
          </p>
        </div>
        <button className="text-sm text-brand-400" onClick={reload}>
          Обновить монитор
        </button>
      </div>
      <div className="my-4 flex flex-wrap gap-3 text-xs">
        {[
          ["events", "События и документы"],
          ["prices", "Контрактные цены"],
          ["coverage", "Покрытие 13 × 3"],
        ].map(([v, t]) => (
          <button
            className={tab === v ? "text-brand-400" : "text-ink-400"}
            aria-pressed={tab === v}
            key={v}
            onClick={() => setTab(v)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="my-3 flex flex-wrap gap-3 text-xs">
        {[
          {
            name: "Материал монитора",
            value: metal,
            set: setMetal,
            options: METALS.map((m) => [m.id, m.nameRu]),
          },
          {
            name: "Регион монитора",
            value: region,
            set: setRegion,
            options: REGIONS.map((r) => [r, r]),
          },
          {
            name: "Статус события",
            value: stage,
            set: setStage,
            options: Object.entries(MONITOR_STAGES),
          },
        ].map((f) => (
          <label key={f.name}>
            {f.name}
            <select
              aria-label={f.name}
              className="mt-1 block max-w-full rounded border border-ink-700 bg-ink-950 p-2"
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
            >
              <option value="">Все</option>
              {f.options.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {!compact && (
        <label className="my-3 block text-xs text-ink-400">
          Период монитора
          <select
            aria-label="Период монитора"
            className="ml-2 rounded bg-ink-950 p-2"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          >
            {[
              ["0", "Весь доступный срок"],
              ["30", "30 дней"],
              ["90", "90 дней"],
              ["365", "Год"],
            ].map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
      )}
      {state.status === "loading" && (
        <p className="text-sm text-ink-400">Загрузка подтверждённых событий…</p>
      )}
      {state.status === "error" && (
        <Panel className="p-4 text-sm text-ink-400">
          <p role="status">{state.message}</p>
          {cached && (
            <p className="mt-2">
              Ниже сохранена последняя успешно полученная выборка; обновление
              пока не подтверждено.
            </p>
          )}
        </Panel>
      )}
      {data && (
        <>
          <p className="my-3 text-xs text-ink-400">
            В загруженной выборке: {rows.length} записей; рассчитанных
            контрактных цен: {priced.length}. Это не число уникальных продаж.{" "}
            {data.truncated
              ? "Показаны последние 200 документов; фильтры применяются к этой выборке."
              : ""}
          </p>
          {rows.length > 0 && (
            <button
              className="mb-3 text-xs text-brand-400"
              onClick={() =>
                downloadCsv(
                  "monitor-events.csv",
                  tableCsv(
                    [
                      "Документ",
                      "Дата источника",
                      "Материалы",
                      "Регион",
                      "Страна",
                      "Статус",
                      "Покупатель",
                      "Поставщик",
                      "Сумма",
                      "Основание суммы",
                      "Валюта",
                      "Объём",
                      "Единица",
                      "Цена/кг",
                      "Тип цены",
                      "Источник",
                    ],
                    rows.map((r) => [
                      r.id,
                      r.data.publishedOn,
                      r.data.metalIds.join(","),
                      r.data.region,
                      r.data.country,
                      MONITOR_STAGES[r.data.stage],
                      r.data.buyer,
                      r.data.supplier,
                      r.data.amount,
                      r.data.amountBasis,
                      r.data.currency,
                      r.data.quantity,
                      r.data.unit,
                      r.data.pricePerKg,
                      r.data.priceKind,
                      r.data.sourceUrl,
                    ]),
                  ),
                )
              }
            >
              Экспорт событий CSV
            </button>
          )}
          {tab === "events" && (
            <div className="space-y-3">
              {rows.length === 0 ? (
                <Panel className="p-4 text-sm text-ink-400">
                  Подтверждённых событий по выбранным фильтрам нет.
                </Panel>
              ) : (
                rows.slice(0, compact ? 10 : 100).map((r) => {
                  const e = r.data,
                    s = monitorStory(e);
                  return (
                    <Panel key={r.id} className="p-4">
                      <div className="flex flex-wrap justify-between gap-2 text-xs text-ink-400">
                        <span>
                          {e.publishedOn} · {e.region} · {e.country}
                        </span>
                        <span>
                          {MONITOR_STAGES[e.stage]} · версия {r.revision}
                        </span>
                      </div>
                      <h3 className="my-2 text-sm font-semibold">
                        {r.title || s.title}
                      </h3>
                      <p className="break-words text-xs text-ink-300">
                        {e.title}
                      </p>
                      <p className="mt-1 break-all text-xs text-ink-400">
                        Номер источника: {e.referenceId ?? "Не опубликован"}
                      </p>
                      <div className="my-3 grid gap-2 text-xs sm:grid-cols-2">
                        <p>Покупатель: {e.buyer ?? "Не опубликован"}</p>
                        <p>Поставщик: {e.supplier ?? "Не опубликован"}</p>
                        <p>
                          Сумма: {fmt(e.amount)} {e.currency ?? ""} ·{" "}
                          {MONITOR_AMOUNT_BASES[e.amountBasis ?? ""] ??
                            "Основание не установлено"}
                        </p>
                        <p>
                          Объём: {fmt(e.quantity)} {e.unit ?? ""}
                        </p>
                        <p>
                          Цена единицы:{" "}
                          {e.pricePerKg === null
                            ? "Не рассчитывается"
                            : fmt(e.pricePerKg) + " " + e.currency + "/кг"}
                        </p>
                        <p>
                          Проверено: {formatDateTime(Date.parse(r.checkedAt))}
                        </p>
                      </div>
                      <details className="text-xs text-ink-400">
                        <summary className="cursor-pointer">
                          Поля документа и ограничения
                        </summary>
                        <p className="mt-2 whitespace-pre-wrap break-words">
                          {r.body || s.text}
                        </p>
                      </details>
                      <a
                        className="mt-3 inline-block break-all text-xs text-brand-400"
                        href={e.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Оригинальный документ · {r.sourceId} ↗
                      </a>
                    </Panel>
                  );
                })
              )}
            </div>
          )}
          {tab === "prices" && (
            <Panel className="p-4">
              <h3 className="font-semibold">Тендерные и контрактные цены</h3>
              <p className="my-2 text-xs text-ink-400">
                Начальные, присуждённые, подписанные и исполненные цены
                разделены. Биржевые цены и мировые ориентиры остаются в прежних
                разделах. Средний «мировой рынок» из разных контрактов не
                строится.
              </p>
              <p className="mb-3 text-xs text-brand-400">
                <a href="#metals">Биржевые котировки и доступность данных ↗</a>{" "}
                · <a href="#analytics">Исторические ориентиры ↗</a>
              </p>
              {priced.length === 0 ? (
                <p className="my-3 text-sm">
                  Нет контрактных цен с подтверждённым распределением суммы на
                  массу одной позиции.
                </p>
              ) : (
                <button
                  className="text-xs text-brand-400"
                  onClick={() =>
                    downloadCsv(
                      "monitor-contract-prices.csv",
                      tableCsv(
                        [
                          "Документ",
                          "Дата",
                          "Материалы",
                          "Страна",
                          "Тип цены",
                          "Цена/кг",
                          "Валюта",
                          "Спецификация",
                          "Поставка",
                          "НДС",
                          "Логистика",
                          "Источник",
                        ],
                        priced.map((r) => [
                          r.id,
                          r.data.publishedOn,
                          r.data.metalIds.join(","),
                          r.data.country,
                          r.data.priceKind,
                          r.data.pricePerKg,
                          r.data.currency,
                          r.data.specification,
                          r.data.deliveryTerms,
                          String(r.data.taxIncluded),
                          String(r.data.logisticsIncluded),
                          r.data.sourceUrl,
                        ]),
                      ),
                    )
                  }
                >
                  Экспорт контрактных цен CSV
                </button>
              )}
              {priced.length > 0 && (
                <div className="my-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr>
                        <th className="p-2">Документ / дата</th>
                        <th className="p-2">Тип цены</th>
                        <th className="p-2">Цена за кг</th>
                        <th className="p-2">Спецификация</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priced.map((r) => (
                        <tr key={r.id} className="border-t border-ink-800">
                          <td className="p-2">
                            <a
                              className="text-brand-400"
                              href={r.data.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {r.data.referenceId ?? r.id}
                            </a>
                            <p>{r.data.publishedOn}</p>
                          </td>
                          <td className="p-2">
                            {r.data.priceKind
                              ? MONITOR_PRICE_KINDS[r.data.priceKind]
                              : "Не установлен"}
                          </td>
                          <td className="p-2">
                            {fmt(r.data.pricePerKg)} {r.data.currency}/кг
                          </td>
                          <td className="p-2">
                            {r.data.specification ?? "Не опубликована"}
                            {!r.data.comparable && (
                              <p>В сопоставимую серию не включено</p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {groups.length > 0 && (
                <label className="my-3 block text-xs">
                  Сопоставимая серия
                  <select
                    aria-label="Сопоставимая контрактная серия"
                    className="mt-1 block w-full rounded bg-ink-950 p-2"
                    value={current}
                    onChange={(e) => setGroup(e.target.value)}
                  >
                    {groups.map((k, i) => (
                      <option key={k} value={k}>
                        {i + 1}:{" "}
                        {
                          comparable.find(
                            (r) => monitorComparisonKey(r.data) === k,
                          )?.data.specification
                        }
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <PriceChart
                data={history.map((r) => ({
                  date: Date.parse(r.data.publishedOn!),
                  price: Number(r.data.pricePerKg),
                }))}
                period="5Y"
                positive={true}
                valueFormatter={(v) =>
                  String(v) + " " + (history[0]?.data.currency ?? "") + "/кг"
                }
                height={210}
              />
              <p className="text-xs text-ink-400">
                Серия объединяется только при известных одинаковых спецификации,
                стране, валюте, базисе, налогах, логистике, типе цены и статусе.
                Неполные условия исключены. Агрегаты объёмов разных товаров не
                складываются.
              </p>
            </Panel>
          )}
          {tab === "coverage" && (
            <Panel className="overflow-x-auto p-4">
              <h3 className="font-semibold">
                Покрытие источниками, не котировками
              </h3>
              <table className="mt-3 w-full text-left text-xs">
                <thead>
                  <tr>
                    <th className="p-2">Материал</th>
                    {REGIONS.map((r) => (
                      <th className="p-2" key={r}>
                        {r}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {METALS.map((m) => (
                    <tr key={m.id} className="border-t border-ink-800">
                      <th className="p-2">
                        {m.nameRu} ({m.symbol})
                      </th>
                      {REGIONS.map((region) => {
                        const sources = data.sources.filter(
                          (s) =>
                            s.enabled &&
                            s.supported_metals.includes(m.id) &&
                            s.supported_regions.includes(region),
                        );
                        const observations = data.events.filter(
                          (e) =>
                            e.data.metalIds.includes(m.id) &&
                            e.data.region === region,
                        ).length;
                        return (
                          <td className="min-w-32 p-2" key={region}>
                            {sources.length
                              ? `${sources.length} источн.; ${observations} записей в выборке`
                              : "Источник не подключён"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
          <Panel className="mt-4 p-4">
            <h3 className="text-sm font-semibold">Источники мониторинга</h3>
            <div className="mt-3 space-y-3 text-xs">
              {data.sources.map((s) => (
                <div key={s.id}>
                  <a
                    className="text-brand-400"
                    href={s.home_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {s.name} ↗
                  </a>{" "}
                  ·{" "}
                  {!s.enabled
                    ? "Не включён"
                    : s.status === "connected"
                      ? "Проверка успешна"
                      : s.status === "partial"
                        ? "Частичный обход / продолжается пагинация"
                        : "Задержка или проверка ещё не выполнена"}
                  <p className="mt-1 text-ink-400">
                    Последняя успешная проверка:{" "}
                    {s.last_success_at
                      ? formatDateTime(Date.parse(s.last_success_at))
                      : "Не выполнялась"}
                    . Интервал: не чаще {s.min_interval_seconds / 60} мин.{" "}
                    <a href={s.license_url} target="_blank" rel="noreferrer">
                      Условия использования ↗
                    </a>
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-400">
              Отсутствие новых записей не означает отсутствие закупок во всём
              мире. Китай и другие неподключённые страны не имитируются. Дата
              источника и дата проверки различаются.
            </p>
          </Panel>
          {data.updates.some((u) => u.action === "withdrawn") && (
            <Panel className="mt-4 p-4">
              <h3 className="font-semibold text-sm">
                Исправления и отзывы публикаций
              </h3>
              {data.updates
                .filter((u) => u.action === "withdrawn")
                .map((u) => (
                  <p className="mt-2 break-all text-xs text-ink-400" key={u.id}>
                    {u.event_id} · {u.reason} ·{" "}
                    {formatDateTime(Date.parse(u.created_at))}
                  </p>
                ))}
            </Panel>
          )}
        </>
      )}
    </section>
  );
}
