import { build } from "esbuild";
import { writeFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const temp = new URL("../.catalog-temp.mjs", import.meta.url);
await build({
  entryPoints: ["src/data/metals.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: temp.pathname,
});
const { METALS } = await import(pathToFileURL(temp.pathname));
await rm(temp);
const sql = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const rows = METALS.map(
  (m) =>
    `(${[m.id, m.categoryId, m.symbol, m.name, m.nameRu].map(sql).join(",")},ARRAY[${m.aliases.map(sql).join(",")}]::text[],${m.atomicNumber ?? "NULL"},${sql(m.unit)},${sql(m.currency)},${sql(m.description)})`,
);
await writeFile(
  "ops/catalog-upsert.sql",
  `-- Generated from src/data/metals.ts; no market prices.\nINSERT INTO metal_categories(id,name,short_name,description) VALUES ('solders-babbitts','Припои и баббиты','Припои и баббиты','Состав требует проверки по сертификату') ON CONFLICT(id) DO NOTHING;\nINSERT INTO metals(id,category_id,symbol,name,name_ru,aliases,atomic_number,unit,currency,description) VALUES\n${rows.join(",\n")}\nON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id,symbol=excluded.symbol,name=excluded.name,name_ru=excluded.name_ru,aliases=excluded.aliases,description=excluded.description;\n`,
);
console.log(`${METALS.length} catalogue entries`);
