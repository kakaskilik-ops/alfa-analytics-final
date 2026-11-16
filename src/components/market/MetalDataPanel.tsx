import { useAsyncData } from "@/hooks/useAsyncData";
import { fetchMetalStatistics } from "@/services/marketIntelligence";
import { fetchReferencePrices } from "@/services/referenceMarkets";
import { METAL_MAP } from "@/data/metals";
import Panel from "@/components/common/Panel";
import PriceChart from "@/components/charts/PriceChart";
import { formatDateTime } from "@/lib/format";
const metricNames: Record<string, string> = {
  import_value: "Импорт, CIF",
  export_value: "Экспорт, FOB",
  import_mass: "Масса импорта",
  export_mass: "Масса экспорта",
  mine_production: "Добыча",
  reserves: "Запасы",
};
const format = (v: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(v);
export default function MetalDataPanel({ metalId }: { metalId: string }) {
  const stats = useAsyncData(
      () => fetchMetalStatistics(metalId),
      metalId,
      true,
    ),
    monthly = useAsyncData(
      fetchReferencePrices,
      "monthly-metal-" + metalId,
      true,
    );
  const rows = stats.state.status === "ready" ? stats.state.data : [],
    history =
      monthly.state.status === "ready"
        ? monthly.state.data.filter((p) => p.metal_id === metalId)
        : [],
    last = history[history.length - 1];
  return (
    <Panel className="my-5 p-4 md:p-5">
      <h2 className="font-semibold">
        Подтверждённые показатели: {METAL_MAP[metalId]?.nameRu ?? metalId}
      </h2>
      <p className="mt-1 text-xs text-ink-400">
        Цены, торговая стоимость и выпуск продукции — разные показатели.
        Германия представляет только Германию, а не весь рынок Европы.
      </p>
      {last && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">
            Месячный мировой ориентир: {format(last.price)} USD/т
          </h3>
          <p className="text-xs text-ink-400">
            {last.period_start.slice(0, 7)} · {last.specification} · World Bank
            Pink Sheet
          </p>
          <PriceChart
            animate={false}
            data={history.map((p) => ({
              date: Date.parse(p.period_start),
              price: p.price,
            }))}
            period="5Y"
            axisFormatter={(d) =>
              new Date(d).toLocaleDateString("ru-RU", {
                month: "short",
                year: "2-digit",
                timeZone: "UTC",
              })
            }
            positive={true}
            valueFormatter={(v) => format(v) + " USD/т"}
            height={180}
          />
        </div>
      )}
      <h3 className="mt-4 text-sm font-semibold">
        Международная торговля и производство
      </h3>
      {stats.state.status === "loading" && (
        <p className="mt-2 text-sm text-ink-400">Загрузка статистики…</p>
      )}
      {stats.state.status === "error" && (
        <p role="status" className="mt-2 text-sm text-ink-400">
          {stats.state.message}{" "}
          <button
            type="button"
            onClick={stats.reload}
            className="text-brand-400"
          >
            Повторить
          </button>
        </p>
      )}
      {rows.length ? (
        <>
          <p className="mt-2 text-xs text-ink-400">
            {rows[0].description}. {rows[0].commodity}. Не цена сделки и не
            полный рынок всех форм металла.
          </p>
          <div className="mt-3 max-h-72 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-ink-400">
                  <th className="p-2">Год</th>
                  <th className="p-2">Страна</th>
                  <th className="p-2">Показатель</th>
                  <th className="p-2 text-right">Значение</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={[r.year, r.country, r.metric, i].join("-")}
                    className="border-t border-ink-800"
                  >
                    <td className="p-2">{r.year}</td>
                    <td className="p-2">{r.country}</td>
                    <td className="p-2">
                      {metricNames[r.metric] ?? r.metric}
                      {r.estimated ? " · оценка источника" : ""}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {format(r.value)} {r.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-500">
            UN Comtrade. Годовые агрегаты; массы могут быть оценками источника.
            CIF импорта и FOB экспорта не взаимозаменяемы. Получено{" "}
            {formatDateTime(Math.max(...rows.map((r) => r.retrievedAt)))}.
          </p>
          <a
            href={rows[0].sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs text-brand-400"
          >
            Проверить исходные данные ↗
          </a>
        </>
      ) : (
        stats.state.status === "ready" && (
          <p className="mt-2 text-sm text-ink-400">
            Нет проверенной торговой статистики для выбранной товарной группы.
            {metalId === "niobium"
              ? " На уровне выбранной HS-классификации ниобий объединён с другими металлами; такую группу не выдаём за Nb."
              : ""}
          </p>
        )
      )}
      <div className="mt-4 rounded-lg bg-ink-950 p-3 text-xs text-ink-400">
        <p className="font-medium text-ink-300">
          Ограничения факторов и рисков
        </p>
        <p className="mt-1">
          {rows.some(
            (r) => r.metric === "mine_production" || r.metric === "reserves",
          )
            ? "Производство и резервы показаны только при наличии отдельного подтверждённого ряда."
            : "Подтверждённые данные о добыче, производстве и запасах ещё не загружены. USGS MCS открыт для использования, но его файловый API блокирует серверный запрос. Не делаем вывод о дефиците на основании одних торговых стоимостей."}
        </p>
        <p className="mt-1">
          Месячная статистика и годовая торговля не подтверждают текущую
          спотовую цену, причинность или будущую динамику.
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          try {
            sessionStorage.setItem("ai-metal", metalId);
          } catch {
            /* Navigation still works without storage. */
          }
          location.hash = "ai";
        }}
        className="mt-4 text-sm text-brand-400"
      >
        Анализировать этот материал с ИИ →
      </button>
    </Panel>
  );
}
