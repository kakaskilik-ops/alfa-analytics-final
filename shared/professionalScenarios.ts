import type { MarketAnalytics } from "./marketCalculations.ts";
import type { EvidenceFact, AnalystDraft } from "./aiReport.ts";
/** Descriptive reference triggers, NOT calibrated probabilities or price targets. */
export function quantitativeScenarios(
  a: MarketAnalytics,
  facts: EvidenceFact[],
): AnalystDraft["scenarios"] {
  const eligible = a.prices.filter((s) => s.current.length >= 4),
    ids = (key: string) =>
      facts
        .filter(
          (f) =>
            f.kind === "derived_metric" &&
            f.metricKey === key &&
            eligible.some(
              (s) =>
                s.metalId === f.metalId && s.specification === f.specification,
            ),
        )
        .map((f) => f.id)
        .slice(0, 30);
  if (!eligible.length) return [];
  return [
    {
      direction: "growth",
      factIds: ids("max"),
      condition:
        "следующее закрытое месячное наблюдение выбранного металла выйдет выше максимума текущего окна",
      description:
        "Это проверяемый выход за верхнюю границу наблюдений, а не доказательство роста спроса. Проверка экономической гипотезы требует новых сопоставимых объёмов торговли и данных о выпуске и запасах.",
    },
    {
      direction: "decline",
      factIds: ids("min"),
      condition:
        "следующее закрытое месячное наблюдение выбранного металла опустится ниже минимума текущего окна",
      description:
        "Это сигнал выхода за нижнюю границу ряда. Нельзя объявлять переизбыток предложения или продолжение падения без последующих наблюдений и отдельного баланса производства и потребления.",
    },
    {
      direction: "stable",
      factIds: [...ids("q25"), ...ids("q75")].slice(0, 30),
      condition:
        "следующие месячные оценки выбранного металла останутся в центральном историческом диапазоне между квартилями",
      description:
        "Такой сценарий описывает нахождение в центральной части наблюдавшегося распределения. Интерквартильный коридор не является прогнозным доверительным интервалом и сам по себе не доказывает устойчивость рынка.",
    },
  ];
}
