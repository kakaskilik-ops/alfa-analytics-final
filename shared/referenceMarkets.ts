export const WORLD_BANK_SOURCE = "world-bank-pink-sheet";
export const WORLD_BANK_URL =
  "https://www.worldbank.org/en/research/commodity-markets";
export const WORLD_BANK_LICENSE =
  "https://data.worldbank.org/summary-terms-of-use";
export const WORLD_BANK_WORKBOOK =
  "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx";
// Descriptions verified against the publisher's November 2026 Pink Sheet, page 3.
export const REFERENCE_SERIES = [
  {
    id: "aluminum",
    symbol: "Al",
    column: "Aluminum",
    name: "Алюминий",
    specification:
      "LME: первичные нелегированные слитки, standard high grade, physical settlement",
  },
  {
    id: "copper",
    symbol: "Cu",
    column: "Copper",
    name: "Медь",
    specification:
      "LME: standard grade A, катоды и wire bars, physical settlement",
  },
  {
    id: "tin",
    symbol: "Sn",
    column: "Tin",
    name: "Олово",
    specification:
      "LME: рафинированное, standard high grade, physical settlement",
  },
  {
    id: "zinc",
    symbol: "Zn",
    column: "Zinc",
    name: "Цинк",
    specification:
      "LME: рафинированный, special high grade, physical settlement",
  },
] as const;
export interface ReferenceObservation {
  metal_id: string;
  period_start: string;
  price: number;
  currency: "USD";
  unit: "ton";
  region: "Мировой ориентир (LME)";
  specification: string;
}
