export interface DateSpan {
  start: string;
  end: string;
}
export interface AnalysisWindow {
  requested: DateSpan;
  previous: DateSpan;
  period: string;
  selection: "question" | "controls";
  label: string;
  monthlyPolicy: string;
  completedMonthEnd: string;
}
export const PERIOD_DAYS: Record<string, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "6M": 183,
  "1Y": 365,
  "5Y": 1826,
};
const day = 86400000;
export function parseDate(s: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw Error("invalid_date");
  const n = Date.parse(s + "T00:00:00Z");
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== s)
    throw Error("invalid_date");
  return n;
}
const iso = (n: number) => new Date(n).toISOString().slice(0, 10);
export function shiftMonths(s: string, months: number) {
  const d = new Date(parseDate(s)),
    target = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1),
    ),
    max = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
    ).getUTCDate();
  return iso(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      Math.min(d.getUTCDate(), max),
    ),
  );
}
export function resolveAnalysisWindow(
  input: {
    question: string;
    period?: string;
    startDate?: string;
    endDate?: string;
  },
  now = Date.now(),
): AnalysisWindow {
  const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(now)),
    endDay = parseDate(today),
    q = input.question.toLowerCase();
  let period = input.period ?? "1M",
    selection: AnalysisWindow["selection"] = "controls",
    startDate = input.startDate,
    endDate = input.endDate;
  const dates = q
    .match(/\b(?:\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})\b/g)
    ?.map((s) => (s.includes(".") ? s.split(".").reverse().join("-") : s));
  const quarterHint = q.match(
    /(первый|второй|третий|четв[её]ртый|iv|iii|ii|i|[1-4])(?:[ -]?(?:й|ый|ий))?\s+квартал(?:а)?\s+((?:19|20)\d{2})/iu,
  );
  const currentQuarter = /текущ[а-я]*\s+квартал/iu.test(q);
  if (dates?.length) {
    if (dates.length !== 2) throw Error("range_requires_two_dates");
    [startDate, endDate] = dates;
    period = "custom";
    selection = "question";
  } else if (
    /(?:12|двенадцать)\s*(?:месяц|months?)|последни[йе]\s+год|за\s+год|за\s+последний\s+год/i.test(
      q,
    )
  ) {
    period = "1Y";
    selection = "question";
  } else if (/(?:30|тридцать)\s*(?:дн|день|days?)/i.test(q)) {
    period = "1M";
    selection = "question";
  } else if (/(?:90|девяносто)\s*(?:дн|день)|(?:3|три)\s*месяц/i.test(q)) {
    period = "3M";
    selection = "question";
  } else if (/квартал/.test(q)) {
    period = "1Q";
    selection = "question";
  } else if (/\b(?:19|20)\d{2}\s*год/.test(q)) {
    const year = Number(q.match(/\b((?:19|20)\d{2})\s*год/)![1]);
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
    if (parseDate(endDate) > endDay) throw Error("future_range");
    period = "custom";
    selection = "question";
  }
  let requested: DateSpan, previous: DateSpan, label: string;
  if (period === "custom") {
    if (!startDate || !endDate) throw Error("missing_range");
    const a = parseDate(startDate),
      b = parseDate(endDate);
    if (a > b || b > endDay || b - a > 5 * 366 * day)
      throw Error("invalid_range");
    const n = (b - a) / day + 1;
    requested = { start: startDate, end: endDate };
    const wholeMonths =
      startDate.endsWith("-01") &&
      endDate === monthEnd(endDate.slice(0, 7) + "-01");
    const months =
      (Number(endDate.slice(0, 4)) - Number(startDate.slice(0, 4))) * 12 +
      Number(endDate.slice(5, 7)) -
      Number(startDate.slice(5, 7)) +
      1;
    previous = {
      start: wholeMonths ? shiftMonths(startDate, -months) : iso(a - n * day),
      end: iso(a - day),
    };
    label = wholeMonths
      ? "Полные календарные месяцы; сравнение с предыдущим окном того же числа месяцев"
      : "Произвольный диапазон; сравнение с предыдущим окном той же длины";
  } else if (period === "1Q") {
    const d = new Date(endDay),
      quarterStart = iso(
        Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1),
      );
    let start = currentQuarter ? quarterStart : shiftMonths(quarterStart, -3);
    if (quarterHint) {
      const map: Record<string, number> = {
        первый: 1,
        второй: 2,
        третий: 3,
        четвертый: 4,
        четвёртый: 4,
        i: 1,
        ii: 2,
        iii: 3,
        iv: 4,
      };
      const n = map[quarterHint[1]] ?? Number(quarterHint[1]);
      start = iso(Date.UTC(Number(quarterHint[2]), (n - 1) * 3, 1));
    }
    const fullEnd = iso(parseDate(shiftMonths(start, 3)) - day);
    if (!currentQuarter && parseDate(fullEnd) > endDay)
      throw Error("future_range");
    requested = {
      start,
      end: currentQuarter && !quarterHint ? today : fullEnd,
    };
    const prevStart = shiftMonths(start, -3),
      prevEnd = iso(parseDate(start) - day),
      length = parseDate(requested.end) - parseDate(start);
    previous = {
      start: prevStart,
      end:
        currentQuarter && !quarterHint
          ? iso(Math.min(parseDate(prevEnd), parseDate(prevStart) + length))
          : prevEnd,
    };
    label =
      currentQuarter && !quarterHint
        ? "Текущий календарный квартал к дате; сравнение с такой же частью прошлого квартала"
        : quarterHint
          ? "Указанный завершённый календарный квартал"
          : "Последний завершённый календарный квартал";
  } else {
    if (!Object.prototype.hasOwnProperty.call(PERIOD_DAYS, period))
      throw Error("invalid_period");
    const start =
      period === "1Y" || period === "5Y"
        ? iso(parseDate(shiftMonths(today, period === "1Y" ? -12 : -60)) + day)
        : iso(endDay - (PERIOD_DAYS[period] - 1) * day);
    requested = { start, end: today };
    previous = {
      start:
        period === "1Y" || period === "5Y"
          ? shiftMonths(start, period === "1Y" ? -12 : -60)
          : iso(parseDate(start) - PERIOD_DAYS[period] * day),
      end: iso(parseDate(start) - day),
    };
    label =
      period === "1Y"
        ? "Последние двенадцать календарных месяцев"
        : `${PERIOD_DAYS[period]} дней`;
  }
  return {
    requested,
    previous,
    period,
    selection,
    label,
    completedMonthEnd: iso(
      Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 0),
    ),
    monthlyPolicy:
      "Используются полные месячные средние с датой окончания месяца внутри окна. Пограничный месяц может включать дни до начала диапазона; пропорционального пересчёта и интерполяции нет. Это не доходность дневной спотовой цены.",
  };
}
export function monthEnd(month: string) {
  const d = new Date(parseDate(month));
  return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}
export function expectedMonths(span: DateSpan) {
  const d = new Date(parseDate(span.start)),
    end = parseDate(span.end),
    months: string[] = [];
  for (let n = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); n <= end;) {
    const m = iso(n);
    if (
      parseDate(monthEnd(m)) >= parseDate(span.start) &&
      parseDate(monthEnd(m)) <= end
    )
      months.push(m);
    const t = new Date(n);
    n = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1);
  }
  return months;
}
