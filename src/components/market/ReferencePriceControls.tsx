import type { ReferenceScope } from "@/services/displayedPrices";
export default function ReferencePriceControls({
  scope,
  onScope,
  unit,
  onUnit,
}: {
  scope: ReferenceScope;
  onScope: (s: ReferenceScope) => void;
  unit: "kg" | "ton";
  onUnit: (u: "kg" | "ton") => void;
}) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-ink-300">
      <label>
        Регион ориентиров{" "}
        <select
          aria-label="Регион ориентиров"
          value={scope}
          onChange={(e) => onScope(e.target.value as ReferenceScope)}
          className="ml-2 max-w-full rounded border border-ink-700 bg-ink-950 p-2"
        >
          {[
            ["all", "Все металлы"],
            ["Europe", "Европа"],
            ["USA", "США"],
            ["Asia", "Азия"],
            ["global", "Мировые ориентиры"],
          ].map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Единица ориентира{" "}
        <select
          aria-label="Единица ориентира"
          value={unit}
          onChange={(e) => onUnit(e.target.value as "kg" | "ton")}
          className="ml-2 rounded border border-ink-700 bg-ink-950 p-2"
        >
          <option value="kg">USD/кг</option>
          <option value="ton">USD/т</option>
        </select>
      </label>
    </div>
  );
}
