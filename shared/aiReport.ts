export interface EvidenceFact {
  id: string;
  metalId: string | null;
  kind:
    | "monthly_price"
    | "regional_quote"
    | "fx"
    | "trade"
    | "production"
    | "reserves"
    | "news";
  label: string;
  value: number | string;
  unit: string;
  periodStart: string;
  periodEnd: string;
  receivedAt: string;
  region: string;
  specification: string;
  source: string;
  url: string;
  withinPeriod: boolean;
}
export interface AnalystDraft {
  summary: string;
  selectedFactIds: string[];
  interpretations: { text: string; factIds: string[] }[];
  risks: string[];
  scenarios: {
    direction: "growth" | "decline" | "stable";
    condition: string;
    description: string;
  }[];
  limitations: string[];
  conclusion: string;
}
export interface VerifiedReport {
  draft: AnalystDraft;
  facts: EvidenceFact[];
  sources: { name: string; url: string }[];
  provider: string;
  model: string;
  generatedAt: string;
  evidenceHash: string;
}
function prose(v: unknown, max: number): string {
  if (
    typeof v !== "string" ||
    !v.trim() ||
    v.length > max ||
    /\p{N}|https?:|www\.|процент|вероятност/iu.test(v)
  )
    throw new Error("unverified_model_claim");
  return v.trim();
}
function strings(v: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(v) || v.length > maxItems)
    throw new Error("invalid_report_structure");
  return v.map((s) => prose(s, maxLength));
}
export function validateAnalystDraft(
  input: unknown,
  facts: EvidenceFact[],
): AnalystDraft {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("invalid_report_structure");
  const r = input as Record<string, unknown>,
    ids = new Set(facts.map((f) => f.id));
  const refs = (v: unknown) => {
    if (
      !Array.isArray(v) ||
      v.length > 30 ||
      v.some((s) => typeof s !== "string" || !ids.has(s))
    )
      throw new Error("invalid_fact_reference");
    return [...new Set(v)] as string[];
  };
  if (
    !Array.isArray(r.interpretations) ||
    r.interpretations.length > 6 ||
    !Array.isArray(r.scenarios) ||
    r.scenarios.length !== 3
  )
    throw new Error("invalid_report_structure");
  const interpretations = r.interpretations.map((x) => {
    if (!x || typeof x !== "object")
      throw new Error("invalid_report_structure");
    const e = x as Record<string, unknown>;
    const factIds = refs(e.factIds);
    if (!factIds.length) throw new Error("missing_fact_reference");
    return { text: prose(e.text, 700), factIds };
  });
  const scenarios = r.scenarios.map((x) => {
    if (!x || typeof x !== "object")
      throw new Error("invalid_report_structure");
    const e = x as Record<string, unknown>;
    if (!["growth", "decline", "stable"].includes(String(e.direction)))
      throw new Error("invalid_scenario");
    return {
      direction: e.direction as "growth" | "decline" | "stable",
      condition: prose(e.condition, 400),
      description: prose(e.description, 600),
    };
  });
  if (new Set(scenarios.map((s) => s.direction)).size !== 3)
    throw new Error("invalid_scenario");
  const selectedFactIds = refs(r.selectedFactIds);
  if (!selectedFactIds.length) throw new Error("missing_fact_reference");
  return {
    summary: prose(r.summary, 900),
    selectedFactIds,
    interpretations,
    risks: strings(r.risks, 6, 400),
    scenarios,
    limitations: strings(r.limitations, 8, 400),
    conclusion: prose(r.conclusion, 1400),
  };
}
export function renderVerifiedReport(report: VerifiedReport): string {
  const { draft: d, facts } = report;
  const number = (v: number | string) =>
    typeof v === "number"
      ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 6 }).format(v)
      : v;
  return [
    d.summary,
    "\nПодтверждённые факты (из базы, не сгенерированы моделью):",
    ...facts
      .filter((f) => d.selectedFactIds.includes(f.id))
      .map(
        (f) =>
          `• [${f.id}] ${f.label}: ${number(f.value)} ${f.unit}. ${f.periodStart} — ${f.periodEnd}; ${f.region}. ${f.specification} Источник: ${f.source}; ${f.url}. Получено: ${f.receivedAt}.${f.withinPeriod ? "" : " Вне выбранного периода — только исторический контекст."}`,
      ),
    "\nКачественная интерпретация, не установленная причинность:",
    ...d.interpretations.map((a) => `• ${a.text} [${a.factIds.join(", ")}]`),
    "\nВозможные риски (требуют проверки):",
    ...d.risks.map((s) => "• " + s),
    "\nУсловные сценарии — без вероятностей и целевых цен:",
    ...d.scenarios.map(
      (s) =>
        `${{ growth: "Рост", decline: "Снижение", stable: "Стабилизация" }[s.direction]}: если ${s.condition} — ${s.description}`,
    ),
    "\nОграничения:",
    ...d.limitations.map((s) => "• " + s),
    "\nЗаключение:",
    d.conclusion,
    `\nМодель: ${report.provider} / ${report.model}. Сформировано: ${report.generatedAt}.`,
    "Источники:",
    ...report.sources.map((s) => `${s.name}: ${s.url}`),
  ].join("\n");
}
