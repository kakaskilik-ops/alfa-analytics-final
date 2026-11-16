import Panel from "@/components/common/Panel";
import { METALS } from "@/data/metals";
import { REGIONS } from "../../../supabase/functions/_shared/universe";
import type { LiveMarketData } from "@/services/liveData";
import { formatDateTime } from "@/lib/format";
export default function CoverageMatrix({
  data,
}: {
  data: LiveMarketData | null;
}) {
  const ready = data?.loaded === true && !data.error;
  const cells = METALS.map((m) => ({
    metal: m,
    regions: REGIONS.map((region) => {
      const observations = (data?.regionalQuotes ?? []).filter(
        (q) =>
          q.metalId === m.id &&
          q.region === region &&
          q.livePrice !== null &&
          q.timestamp <= Date.now(),
      );
      const fresh = observations.filter(
        (q) =>
          q.dataStatus === "live" && Date.now() - q.timestamp <= 4 * 86400000,
      );
      return { region, observations, fresh };
    }),
  }));
  const count = cells.reduce(
    (n, r) => n + r.regions.filter((c) => c.fresh.length).length,
    0,
  );
  return (
    <Panel className="my-5 p-4 md:p-5">
      <h2 className="font-semibold">Региональное покрытие: 13 × 3</h2>
      <p className="mt-2 text-xs text-ink-400">
        {ready
          ? `Подтверждённых свежих позиций: ${count} из 39.`
          : "Покрытие не проверено: база недоступна или загружается."}{" "}
        Считаются отдельные металл × регион, со спецификацией и датой не старше
        четырёх суток. Мировые ориентиры, торговая стоимость и пересчёт валют
        сюда не входят.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs">
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
            {cells.map((row) => (
              <tr className="border-t border-ink-800" key={row.metal.id}>
                <th className="p-2 font-medium">
                  {row.metal.nameRu} ({row.metal.symbol})
                </th>
                {row.regions.map((c) => (
                  <td className="p-2 min-w-36" key={c.region}>
                    {!ready ? (
                      "Не проверено"
                    ) : !c.observations.length ? (
                      "Нет подтверждённой котировки"
                    ) : (
                      <details>
                        <summary
                          className={
                            c.fresh.length ? "text-brand-400" : "text-ink-400"
                          }
                        >
                          {c.fresh.length ? "Подтверждено" : "Устарело"} ·{" "}
                          {c.observations.length} спецификаций
                        </summary>
                        {c.observations.map((q) => (
                          <p className="my-2" key={q.specificationKey}>
                            {q.livePrice} USD/кг · {q.country} · {q.marketLabel}{" "}
                            · {formatDateTime(q.timestamp)} ·{" "}
                            <a
                              className="text-brand-400"
                              href={q.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {q.sourceName}
                            </a>
                          </p>
                        ))}
                      </details>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
