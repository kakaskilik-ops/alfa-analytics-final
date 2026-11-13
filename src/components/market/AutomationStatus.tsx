import { useAsyncData } from "@/hooks/useAsyncData";
import { supabase } from "@/lib/supabase";
import Panel from "@/components/common/Panel";
import { formatDateTime } from "@/lib/format";
const names: Record<string, string> = {
  "collect-fx": "Валютные курсы",
  "collect-trade": "Статистика международной торговли",
  "generate-market-report": "Автоматический ИИ-отчёт",
  "collect-quotes": "Региональные котировки",
  "compute-orientations": "Расчёт ориентиров",
  "collect-reference-prices": "Месячные ряды World Bank",
};
const statuses: Record<string, string> = {
  started: "Выполняется",
  success: "Успешно",
  partial: "Частично",
  error: "Ошибка",
};
const errors: Record<string, string> = {
  ai_not_configured: "Нужен ключ бесплатного ИИ в Supabase Secrets",
  trade_source_rate_limited: "Источник торговли ограничил частоту запросов",
  trade_sources_failed: "Часть торговых источников недоступна",
  no_verified_quotes: "Нет проверенных котировок",
  quote_sources_not_configured: "Нужен доступ к поставщику котировок",
  reference_source_unavailable: "Месячный источник недоступен",
  fx_source_unavailable: "Валютный источник недоступен",
};
async function load() {
  if (!supabase) throw new Error("База данных не подключена.");
  const { data, error } = await supabase
    .from("automation_runs")
    .select("id,job,status,started_at,finished_at,rows_written,error_code")
    .order("started_at", { ascending: false })
    .limit(8);
  if (error) throw new Error("Журнал обновлений временно недоступен.");
  return data ?? [];
}
export default function AutomationStatus({ updatedAt }: { updatedAt: Date }) {
  const { state, reload } = useAsyncData(
    load,
    String(Math.floor(updatedAt.getTime() / 300000)),
    true,
  );
  return (
    <Panel className="mt-4 p-5">
      <div className="flex justify-between gap-3">
        <h2 className="font-semibold">Фоновые обновления</h2>
        <button
          type="button"
          className="text-sm text-brand-400"
          onClick={reload}
        >
          Обновить журнал
        </button>
      </div>
      <p className="mt-1 text-xs text-ink-400">
        Фактические запуски серверных задач. Отсутствующие цены не считаются
        успешным сбором котировок.
      </p>
      {state.status === "error" && (
        <p role="status" className="mt-3 text-sm text-ink-400">
          {state.message}
        </p>
      )}
      {state.status === "loading" && <p className="mt-3 text-sm">Загрузка…</p>}
      {state.status === "ready" &&
        (state.data.length ? (
          state.data.map((r) => (
            <div
              key={r.id}
              className="mt-3 flex flex-wrap justify-between gap-2 border-t border-ink-800 pt-3 text-sm"
            >
              <div>
                <p>
                  {names[r.job] ?? "Серверная задача"} ·{" "}
                  {statuses[r.status] ?? "Неизвестно"}
                </p>
                <p className="text-xs text-ink-400">
                  {errors[r.error_code] ??
                    (r.error_code
                      ? "Обновление не завершено; проверьте серверный журнал."
                      : `${r.rows_written} записей записано`)}
                </p>
              </div>
              <span className="text-xs text-ink-400">
                {formatDateTime(Date.parse(r.finished_at ?? r.started_at))}
              </span>
            </div>
          ))
        ) : (
          <p className="mt-3 text-sm text-ink-400">Запусков пока нет.</p>
        ))}
    </Panel>
  );
}
