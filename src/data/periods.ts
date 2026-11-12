import type { PeriodConfig } from "@/types/market";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const PERIODS: PeriodConfig[] = [
  { key: "1D", label: "24 часа", durationMs: 1 * DAY },
  { key: "1W", label: "7 дней", durationMs: 7 * DAY },
  { key: "1M", label: "30 дней", durationMs: 30 * DAY },
  { key: "3M", label: "90 дней", durationMs: 90 * DAY },
  { key: "6M", label: "6 месяцев", durationMs: 183 * DAY },
  { key: "1Y", label: "1 год", durationMs: 365 * DAY },
  { key: "5Y", label: "5 лет", durationMs: 1826 * DAY },
];
