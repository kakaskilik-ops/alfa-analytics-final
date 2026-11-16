import type { VerifiedReport } from "./aiReport.ts";
const num = (v: number | null, digits = 2) =>
  v === null
    ? "не вычисляется"
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(
        v,
      );
const delta = (v: number | null, unit: string) =>
  v === null ? "не вычисляется" : `${v > 0 ? "+" : ""}${num(v)} ${unit}`;
const metrics: Record<string, string> = {
  import_value: "Импорт CIF",
  export_value: "Экспорт FOB",
  import_mass: "Масса импорта",
  export_mass: "Масса экспорта",
  mine_production: "Добыча",
  reserves: "Запасы",
};
export function renderProfessionalReport(report: VerifiedReport): string {
  const a = report.analytics!;
  const w = a.window,
    d = report.draft;
  const lines = [
    `АНАЛИТИЧЕСКИЙ ОТЧЁТ: ${a.metals.map((m) => m.name).join(", ")}`,
    `Запрошено: ${w.requested.start} — ${w.requested.end}. ${w.label}. Период определён ${w.selection === "question" ? "из текста вопроса" : "переключателем/датами"}.`,
    `Предыдущее сопоставимое окно: ${w.previous.start} — ${w.previous.end}.`,
    w.monthlyPolicy,
    "",
    "1. РЕЗЮМЕ",
    d.summary,
  ];
  const prose = (section: string) =>
    d.interpretations
      .filter((x) => x.section === section)
      .map((x) => `• ${x.text} [${x.factIds.join(", ")}]`);
  lines.push("", "2. ДИНАМИКА И СЕРВЕРНЫЕ РАСЧЁТЫ");
  if (!a.prices.length)
    lines.push(
      "Подтверждённого сопоставимого ценового ряда в запрошенных окнах нет.",
    );
  for (const s of a.prices) {
    const m = s.currentMetrics,
      p = s.previousMetrics;
    lines.push(
      "",
      `${a.metals.find((x) => x.id === s.metalId)?.name ?? s.metalId} · ${s.source} · ${s.region}`,
      `${s.specification}. Единица: ${s.unit}. Источник: ${s.url}`,
      `Покрытие: текущее окно ${m.n} наблюдений (${s.current[0]?.month.slice(0, 7) ?? "нет"} — ${s.current[s.current.length - 1]?.month.slice(0, 7) ?? "нет"}), предыдущее ${p.n}.`,
      `Первое / последнее месячное среднее: ${num(m.first)} / ${num(m.last)} ${s.unit}.`,
      `От первого до последнего наблюдения: ${delta(m.change, s.unit)}; ${delta(m.changePct, "%")}. Это ${Math.max(0, m.n - 1)} интервалов, не доходность от ненаблюдаемой дневной цены начала окна.`,
      `Минимум: ${num(m.min)} ${s.unit} (${m.minMonths.map((x) => x.slice(0, 7)).join(", ") || "нет"}). Максимум: ${num(m.max)} ${s.unit} (${m.maxMonths.map((x) => x.slice(0, 7)).join(", ") || "нет"}).`,
      `Среднее арифметическое месячных средних: ${num(m.mean)} ${s.unit}; предыдущее окно: ${num(p.mean)} ${s.unit}. Это не средневзвешенная дневная цена.`,
      `Изменение среднего двух окон: ${delta(s.meanChange, s.unit)}; ${delta(s.meanChangePct, "%")}.`,
      `Последнее наблюдение против последнего в прошлом окне: ${delta(s.endpointChange, s.unit)}; ${delta(s.endpointChangePct, "%")}. Даты: ${s.current[s.current.length - 1]?.month ?? "нет"} / ${s.previous[s.previous.length - 1]?.month ?? "нет"}.`,
      `Месячная волатильность: ${m.monthlyVolatilityPct === null ? "недостаточно последовательных наблюдений" : num(m.monthlyVolatilityPct, 4) + "%"}; использовано доходностей: ${m.returnCount}. Предыдущее окно: ${p.monthlyVolatilityPct === null ? "не вычисляется" : num(p.monthlyVolatilityPct, 4) + "%"}. Метод: выборочное стандартное отклонение log(Pt/Pt−1), только соседние месяцы, минимум 6 доходностей. Не дневная волатильность спота и не вероятность прогноза.`,
      "Помесячная динамика текущего окна (цена; изменение к предыдущему календарному месяцу):",
    );
    for (const v of s.current)
      lines.push(
        `• ${v.month.slice(0, 7)}: ${num(v.price)} ${s.unit}; ${delta(v.delta, s.unit)}; ${delta(v.pct, "%")}.`,
      );
    lines.push("Все доступные наблюдения предыдущего окна:");
    for (const v of s.previous)
      lines.push(
        `• ${v.month.slice(0, 7)}: ${num(v.price)} ${s.unit}; ${delta(v.delta, s.unit)}; ${delta(v.pct, "%")}.`,
      );
    for (const v of s.limitations) lines.push("Ограничение: " + v);
  }
  lines.push(
    ...prose("dynamics"),
    "",
    "3. МЕЖДУНАРОДНАЯ ТОРГОВЛЯ — ОТДЕЛЬНО ОТ ЦЕН",
  );
  if (!a.trade.length)
    lines.push(
      "Подтверждённых торговых наблюдений выбранной товарной группы нет.",
    );
  else {
    lines.push(
      `Покрытие — только страны выборки: ${[...new Set(a.trade.map((t) => t.country))].join(", ")}; это не полный мировой итог. Годовая стоимость CIF/FOB и масса не являются рыночной котировкой; USD/kg из них не рассчитывается.`,
      `Строк, полностью попадающих в запрошенное окно: ${a.trade.filter((t) => t.relation === "current").length}. Остальные годы показаны отдельно как сравнение/исторический фон, без подмены итогов запрошенных месяцев.`,
    );
    for (const t of a.trade)
      lines.push(
        `• ${t.period_year} · ${t.country} · ${metrics[t.metric] ?? t.metric}: ${num(t.value, 3)} ${t.unit}; ${t.commodity_code}; ${t.relation === "current" ? "внутри текущего окна" : t.relation === "previous" ? "внутри предыдущего окна" : "исторический фон / календарный год вне полного окна"}${t.estimated ? "; оценка источника" : ""}. ${t.product_description}. ${t.comparisonYear !== null ? `Изменение к ${t.comparisonYear} для той же страны/кода/показателя: ${delta(t.change, t.unit)}; ${delta(t.changePct, "%")}.` : "Нет предыдущего сопоставимого годового наблюдения для расчёта динамики."}`,
      );
  }
  lines.push(
    ...prose("trade"),
    "",
    "4. ФАКТОРЫ РЫНКА И ПОЛУЧЕННЫЕ НОВОСТИ",
    "Подтверждены числовые ряды и факт публикации метаданных. Причинное влияние новости на цену по ним не установлено. Интерпретации ниже — гипотезы, не доказанные причины.",
  );
  if (!a.news.length)
    lines.push("Релевантных полученных новостей в выбранном окне нет.");
  for (const n of a.news)
    lines.push(
      `• ${n.date.slice(0, 10)} · ${n.source} · ${n.scope === "metal" ? "явно упомянут выбранный металл" : "общий отраслевой контекст"}: ${n.title}. ${n.excerpt ? `RSS-анонс: ${n.excerpt}. ` : ""}${n.url} (полный текст не загружен).`,
    );
  lines.push(
    ...prose("factors"),
    "",
    "СРАВНЕНИЕ РЕГИОНОВ",
    "Мировой месячный ориентир не распределяется между Европой, США и Азией. Сопоставление регионов требует отдельных котировок одинаковой марки, формы, чистоты, даты и условий поставки.",
    ...report.facts
      .filter((f) => f.kind === "regional_quote")
      .map(
        (f) =>
          `• ${f.region}: ${f.value} ${f.unit}; ${f.periodStart}; ${f.specification}; ${f.url}.`,
      ),
    ...(report.facts.some((f) => f.kind === "regional_quote")
      ? []
      : [
          "Сопоставимых региональных котировок в контексте нет; региональные премии не вычисляются.",
        ]),
    "",
    "ПРОИЗВОДСТВО, ПРЕДЛОЖЕНИЕ И ПРОМЫШЛЕННЫЙ СПРОС",
    ...report.facts
      .filter((f) => f.kind === "production" || f.kind === "reserves")
      .map(
        (f) =>
          `• ${f.label}: ${f.value} ${f.unit}; ${f.periodStart}; ${f.url}.`,
      ),
    ...(report.facts.some(
      (f) => f.kind === "production" || f.kind === "reserves",
    )
      ? []
      : [
          "Добыча, выпуск и экономически извлекаемые запасы за период не подтверждены отдельными рядами. Минеральные ресурсы не подменяют запасы.",
        ]),
    "Отдельного ряда промышленного потребления нет. Импортная стоимость зависит одновременно от цены, массы и состава поставок; сама по себе она не доказывает рост спроса или дефицит.",
    "",
    "ВЛИЯНИЕ ВАЛЮТ",
    ...report.facts
      .filter((f) => f.kind === "fx")
      .map(
        (f) =>
          `• ${f.label}: ${f.value} ${f.unit}; ${f.periodStart}; источник ${f.source}: ${f.url}.`,
      ),
    "Это отдельный справочный валютный контекст, а не региональная котировка металла. История валют за всё окно и модель валютной чувствительности в этот отчёт не включены; количественный вклад курса в изменение цены не установлен.",
    "",
    "5. РИСКИ И НЕДОСТАЮЩИЕ ДАННЫЕ",
    ...d.risks.map((x) => "• " + x),
    ...[...new Set([...a.limitations, ...d.limitations])].map((x) => "• " + x),
    "",
    "6. УСЛОВНЫЕ СЦЕНАРИИ — НЕ ПРОГНОЗНЫЕ ВЕРОЯТНОСТИ",
  );
  if (!d.scenarios.length)
    lines.push(
      "Проверяемые ценовые сценарии не строятся: нужно хотя бы четыре сопоставимых месячных наблюдения.",
    );
  for (const s of a.prices.filter((p) => p.current.length >= 4))
    lines.push(
      `Пороговая карта ${a.metals.find((m) => m.id === s.metalId)?.name ?? s.metalId}: выход вверх выше ${num(s.currentMetrics.max)} ${s.unit}; выход вниз ниже ${num(s.currentMetrics.min)} ${s.unit}; центральный исторический коридор ${num(s.currentMetrics.q25)} — ${num(s.currentMetrics.q75)} ${s.unit}. Квартили: линейная интерполяция ранга (n−1)×p; это описательные уровни, не цели цены и не прогнозные вероятности.`,
    );
  for (const s of d.scenarios)
    lines.push(
      `${{ growth: "Рост", decline: "Снижение", stable: "Стабилизация" }[s.direction]}: если ${s.condition} — ${s.description}${s.factIds?.length ? ` [${s.factIds.join(", ")}]` : ""}`,
    );
  lines.push(
    "",
    "7. ВЫВОД",
    d.conclusion,
    "",
    "8. ИСТОЧНИКИ И ПРОИСХОЖДЕНИЕ РАСЧЁТОВ",
    ...report.sources.map((s) => `${s.name}: ${s.url}`),
    `Все числовые расчёты выполнены сервером по указанным наблюдениям. Даты получения хранятся в реестре фактов. Модель не является источником цен. Модель: ${report.provider} / ${report.model}; сформировано: ${report.generatedAt}.`,
  );
  return lines.join("\n");
}
