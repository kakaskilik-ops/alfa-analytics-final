import { METAL_IDS } from "../../supabase/functions/_shared/universe";
import { supabase } from "@/lib/supabase";
import type {
  CurrencyCode,
  DataStatus,
  MarketType,
  PriceQuoteRecord,
  SourceStatus,
  ValidationStatus,
} from "@/types/market";
import type { SourceStatusRow } from "@/services/sources";

export interface UpdateLogRow {
  id: string;
  job: string;
  sourceId: string | null;
  status: "started" | "success" | "error";
  startedAt: number;
  finishedAt: number | null;
  rowsWritten: number;
  message: string;
}

export interface QualityRecordRow {
  id: string;
  sourceId: string | null;
  metalId: string | null;
  checkName: string;
  result: "pass" | "warn" | "fail";
  details: string;
  checkedAt: number;
}

type Row = Record<string, unknown>;

function getClient() {
  if (!supabase) throw new Error("Подключение к базе данных не настроено.");
  return supabase;
}

function fail(message: string | undefined): never {
  void message;
  throw new Error("Ошибка чтения базы данных. Повторите попытку позже.");
}

function asString(value: unknown): string {
  if (typeof value !== "string") throw new Error("Неожиданный формат данных.");
  return value;
}

function asNumber(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed))
    throw new Error("Неожиданный формат данных.");
  return parsed;
}

function asTimestamp(value: unknown): number {
  const parsed = Date.parse(asString(value));
  if (Number.isNaN(parsed)) throw new Error("Неожиданный формат даты.");
  return parsed;
}

function asNullableTimestamp(value: unknown): number | null {
  return value === null || value === undefined ? null : asTimestamp(value);
}

function asNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : asString(value);
}

function asArray(data: unknown): Row[] {
  if (!Array.isArray(data))
    throw new Error("Неожиданный формат ответа базы данных.");
  return data as Row[];
}

export async function testConnection(): Promise<void> {
  const { error } = await getClient()
    .from("data_sources")
    .select("id", { count: "exact", head: true });
  if (error) fail(error.message);
}

export async function fetchSourceRows(): Promise<SourceStatusRow[]> {
  const { data, error } = await getClient()
    .from("data_sources")
    .select("id, status, last_success_at");
  if (error) fail(error.message);

  return asArray(data).map((row) => ({
    id: asString(row.id),
    status: asString(row.status) as SourceStatus,
    lastSuccessAt: asNullableTimestamp(row.last_success_at),
    lastError: null,
  }));
}

export async function fetchSourceCoverage(): Promise<Set<string>> {
  const { data, error } = await getClient()
    .from("metal_source_coverage")
    .select("metal_id, source_id");
  if (error) fail(error.message);

  const coverage = new Set<string>();
  for (const row of asArray(data)) {
    const metalId = asString(row.metal_id);
    const sourceId = asString(row.source_id);
    coverage.add(`${metalId}-${sourceId}`);
  }
  return coverage;
}

export async function fetchUpdateLogs(limit = 10): Promise<UpdateLogRow[]> {
  const { data, error } = await getClient()
    .from("update_logs")
    .select("id, job, source_id, status, started_at, finished_at, rows_written")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) fail(error.message);

  return asArray(data).map((row) => ({
    id: asString(row.id),
    job: asString(row.job),
    sourceId: asNullableString(row.source_id),
    status: asString(row.status) as UpdateLogRow["status"],
    startedAt: asTimestamp(row.started_at),
    finishedAt: asNullableTimestamp(row.finished_at),
    rowsWritten: asNumber(row.rows_written),
    message:
      row.status === "error" ? "Сбор завершён с ошибкой" : "Сбор завершён",
  }));
}

export async function fetchQualityRecords(
  limit = 10,
): Promise<QualityRecordRow[]> {
  const { data, error } = await getClient()
    .from("data_quality_records")
    .select("id, source_id, metal_id, check_name, result, details, checked_at")
    .order("checked_at", { ascending: false })
    .limit(limit);
  if (error) fail(error.message);

  return asArray(data).map((row) => ({
    id: asString(row.id),
    sourceId: asNullableString(row.source_id),
    metalId: asNullableString(row.metal_id),
    checkName: asString(row.check_name),
    result: asString(row.result) as QualityRecordRow["result"],
    details: asString(row.details),
    checkedAt: asTimestamp(row.checked_at),
  }));
}

export async function fetchQuotationRecords(
  metalId: string,
): Promise<PriceQuoteRecord[]> {
  const { data, error } = await getClient()
    .from("price_quotations")
    .select(
      "metal_id, source_id, original_price, original_currency, original_unit, normalized_price, normalized_currency, normalized_unit, grade, product_form, region, market_type, exchange_name, quality_score, data_status, validation_status, quoted_at, retrieved_at, source_url, attribution, price_type, composition, country, purity, element_content, delivery_terms, specification_id, data_sources(name, url, independence_id)",
    )
    .eq("metal_id", metalId)
    .order("quoted_at", { ascending: false })
    .limit(500);
  if (error) fail(error.message);

  return asArray(data).map((row) => {
    const source = row.data_sources as Row | null;
    if (!source || typeof source !== "object")
      throw new Error("Неожиданный формат данных источника.");
    return {
      sourceName: asString(source.name),
      sourceUrl: asString(row.source_url),
      sourceId: asString(row.source_id),
      metalId: asString(row.metal_id),
      price: asNumber(row.normalized_price),
      originalPrice: asNumber(row.original_price),
      originalCurrency: asString(row.original_currency) as CurrencyCode,
      originalUnit: asString(row.original_unit),
      currency: asString(row.normalized_currency) as CurrencyCode,
      unit: asString(row.normalized_unit),
      marketType: asString(row.market_type) as MarketType,
      region: asString(row.region),
      exchangeName: asNullableString(row.exchange_name),
      grade: asNullableString(row.grade),
      productForm: asNullableString(row.product_form),
      dataStatus: asString(row.data_status) as DataStatus,
      validationStatus: asString(row.validation_status) as ValidationStatus,
      qualityScore: asNumber(row.quality_score),
      timestamp: asTimestamp(row.quoted_at),
      retrievedAt: asTimestamp(row.retrieved_at),
      attribution: asString(row.attribution),
      priceType: asString(row.price_type),
      independenceId: asString(source.independence_id ?? row.source_id),
      composition: asNullableString(row.composition),
      country: asNullableString(row.country),
      purity: row.purity == null ? null : asNumber(row.purity),
      elementContent:
        row.element_content == null ? null : asNumber(row.element_content),
      deliveryTerms: asNullableString(row.delivery_terms),
      specificationId: asNullableString(row.specification_id),
    } as PriceQuoteRecord & {
      originalPrice: number;
      originalCurrency: CurrencyCode;
      originalUnit: string;
    };
  });
}

export async function fetchAllLiveQuotations(): Promise<PriceQuoteRecord[]> {
  const { data, error } = await getClient()
    .from("price_quotations")
    .select(
      "metal_id, source_id, original_price, original_currency, original_unit, normalized_price, normalized_currency, normalized_unit, grade, product_form, region, market_type, exchange_name, quality_score, data_status, validation_status, quoted_at, retrieved_at, source_url, attribution, price_type, composition, country, purity, element_content, delivery_terms, specification_id, data_sources(name, url, independence_id)",
    )
    .in("metal_id", [...METAL_IDS])
    .eq("data_status", "live")
    .gte("quoted_at", new Date(Date.now() - 4 * 86400000).toISOString())
    .eq("validation_status", "valid")
    .order("quoted_at", { ascending: false })
    .limit(1000);
  if (error) fail(error.message);

  const rows = asArray(data);
  const result: PriceQuoteRecord[] = [];

  for (const row of rows) {
    const metalId = asString(row.metal_id);
    const sourceId = asString(row.source_id);

    const source = row.data_sources as Row | null;
    if (!source) continue;

    result.push({
      sourceName: asString(source.name),
      sourceUrl: asString(row.source_url),
      sourceId,
      metalId,
      price: asNumber(row.normalized_price),
      originalPrice: asNumber(row.original_price),
      originalCurrency: asString(row.original_currency) as CurrencyCode,
      originalUnit: asString(row.original_unit),
      currency: asString(row.normalized_currency) as CurrencyCode,
      unit: asString(row.normalized_unit),
      marketType: asString(row.market_type) as MarketType,
      region: asString(row.region),
      exchangeName: asNullableString(row.exchange_name),
      grade: asNullableString(row.grade),
      productForm: asNullableString(row.product_form),
      dataStatus: asString(row.data_status) as DataStatus,
      validationStatus: asString(row.validation_status) as ValidationStatus,
      qualityScore: asNumber(row.quality_score),
      timestamp: asTimestamp(row.quoted_at),
      retrievedAt: asTimestamp(row.retrieved_at),
      attribution: asString(row.attribution),
      priceType: asString(row.price_type),
      independenceId: asString(source.independence_id ?? row.source_id),
      composition: asNullableString(row.composition),
      country: asNullableString(row.country),
      purity: row.purity == null ? null : asNumber(row.purity),
      elementContent:
        row.element_content == null ? null : asNumber(row.element_content),
      deliveryTerms: asNullableString(row.delivery_terms),
      specificationId: asNullableString(row.specification_id),
    } as PriceQuoteRecord & {
      originalPrice: number;
      originalCurrency: CurrencyCode;
      originalUnit: string;
    });
  }

  return result;
}

export async function fetchPriceHistory(
  metalId: string,
  sourceId: string,
  comparisonKey: string,
): Promise<
  {
    date: number;
    open: number;
    high: number;
    low: number;
    close: number;
    currency: string;
    unit: string;
  }[]
> {
  const { data, error } = await getClient()
    .from("price_history")
    .select("trade_date, open, high, low, close, currency, unit, data_status")
    .eq("metal_id", metalId)
    .eq("source_id", sourceId)
    .eq("comparison_key", comparisonKey)
    .eq("data_status", "live")
    .order("trade_date", { ascending: false })
    .limit(1826);
  if (error) fail(error.message);

  return asArray(data).map((row) => ({
    date: asTimestamp(row.trade_date),
    open: asNumber(row.open),
    high: asNumber(row.high),
    low: asNumber(row.low),
    close: asNumber(row.close),
    currency: asString(row.currency),
    unit: asString(row.unit),
  }));
}
