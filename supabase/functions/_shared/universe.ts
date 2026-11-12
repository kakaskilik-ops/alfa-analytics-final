export const METAL_IDS = [
  "tungsten",
  "molybdenum",
  "ferromolybdenum",
  "ferrotungsten",
  "tin",
  "zinc",
  "copper",
  "aluminum",
  "chromium",
  "cobalt",
  "zirconium",
  "niobium",
  "tantalum",
] as const;
export const REGIONS = ["Европа", "США", "Азия"] as const;
export type Region = (typeof REGIONS)[number];
export function isRegion(v: unknown): v is Region {
  return typeof v === "string" && (REGIONS as readonly string[]).includes(v);
}
export function isMetal(v: unknown): v is (typeof METAL_IDS)[number] {
  return typeof v === "string" && (METAL_IDS as readonly string[]).includes(v);
}
