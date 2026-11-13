export interface BenchmarkObservation {
  materialId: string;
  commercialKey: string;
  region: string;
  currency: string;
  unit: string;
  publishedAt: number;
  price: number;
  licenseReference: string;
  redistributionAllowed: boolean;
}
export function compareBenchmark(
  estimate: {
    materialId: string;
    commercialKey: string;
    region: string;
    currency: string;
    unit: string;
    at: number;
    price: number | null;
  },
  reference: BenchmarkObservation,
): { difference: number; percent: number } | null {
  if (
    !reference.licenseReference.trim() ||
    estimate.price === null ||
    ![estimate.price, reference.price].every(
      (v) => Number.isFinite(v) && v > 0,
    ) ||
    Math.abs(estimate.at - reference.publishedAt) > 86400000
  )
    return null;
  if (
    ["materialId", "commercialKey", "region", "currency", "unit"].some(
      (k) =>
        estimate[k as keyof typeof estimate] !==
        reference[k as keyof BenchmarkObservation],
    )
  )
    return null;
  const difference = estimate.price - reference.price;
  return { difference, percent: (difference / reference.price) * 100 };
}
