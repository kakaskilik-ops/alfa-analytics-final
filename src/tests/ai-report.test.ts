import { it, expect } from "vitest";
import {
  validateAnalystDraft,
  renderVerifiedReport,
  type EvidenceFact,
} from "../../shared/aiReport";
const facts: EvidenceFact[] = [
  {
    id: "F1",
    metalId: "copper",
    kind: "monthly_price",
    label: "TEST monthly copper",
    value: 100,
    unit: "USD/т",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    receivedAt: "2026-11-13",
    region: "Мировой ориентир (LME)",
    specification: "TEST",
    source: "World Bank",
    url: "https://www.worldbank.org/en/research/commodity-markets",
    withinPeriod: true,
  },
];
const draft = () => ({
  summary: "Доступен месячный ориентир, но он не заменяет спотовую цену.",
  selectedFactIds: ["F1"],
  interpretations: [
    {
      text: "Для вывода о динамике нужны сопоставимые наблюдения.",
      factIds: ["F1"],
    },
  ],
  risks: ["Недостаток свежих наблюдений ограничивает выводы."],
  scenarios: [
    {
      direction: "growth",
      condition: "спрос усилится при неизменном предложении",
      description: "возможное давление в сторону роста",
    },
    {
      direction: "decline",
      condition: "спрос ослабнет",
      description: "возможно снижение",
    },
    {
      direction: "stable",
      condition: "спрос и предложение сохранят баланс",
      description: "возможна стабилизация",
    },
  ],
  limitations: ["Нет подтверждённых текущих региональных цен."],
  conclusion: "Продолжить наблюдение за датами и сопоставимостью данных.",
});
it("renders numbers and sources from the ledger, not the model", () => {
  const validated = validateAnalystDraft(draft(), facts);
  const text = renderVerifiedReport({
    draft: validated,
    facts,
    sources: [{ name: "World Bank", url: facts[0].url }],
    provider: "TEST",
    model: "TEST",
    generatedAt: "2026-11-13",
    evidenceHash: "TEST",
  });
  expect(text).toContain("100 USD/т");
  expect(text).toContain(facts[0].url);
});
it.each([
  "Цена выросла на 99%.",
  "Источник https://invented.example",
  "Рост на тридцать процентов.",
])("rejects unsupported generated numeric claims or sources: %s", (summary) =>
  expect(() => validateAnalystDraft({ ...draft(), summary }, facts)).toThrow(),
);
it("rejects unknown fact IDs and missing/duplicate scenario directions", () => {
  expect(() =>
    validateAnalystDraft({ ...draft(), selectedFactIds: ["F999"] }, facts),
  ).toThrow();
  const value = draft();
  value.scenarios[2].direction = "growth";
  expect(() => validateAnalystDraft(value, facts)).toThrow();
});
