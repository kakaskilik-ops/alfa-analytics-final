import { Bot, Info, Send, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import Panel from "@/components/common/Panel";
import ChatBubble, { type ChatMessage } from "@/components/ai/ChatBubble";
import PageHeader from "@/components/layout/PageHeader";
import { sendAiRequest, type AiRequest } from "@/services/ai";
import {
  fetchAiRuntimeStatus,
  fetchLatestMarketReport,
} from "@/services/marketIntelligence";
import { useAsyncData } from "@/hooks/useAsyncData";
import { METALS, METAL_MAP } from "@/data/metals";
import { renderVerifiedReport } from "../../shared/aiReport";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
const suggestions = [
  "Почему меняется цена выбранного металла?",
  "Проанализируй доступные цены за выбранный период",
  "Сравни импорт и экспорт выбранных материалов",
  "Какие данные о производстве и запасах подтверждены?",
  "Сравни регионы и объясни ограничения сравнения",
  "Как валютные курсы влияют на возможные риски?",
];
export default function AiAnalystPage({ updatedAt }: { updatedAt: Date }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(""),
    [userEmail, setUserEmail] = useState<string | null>(null),
    [authMessage, setAuthMessage] = useState("");
  const [ids, setIds] = useState<string[]>(() => {
      try {
        const id = sessionStorage.getItem("ai-metal");
        return id && METAL_MAP[id] ? [id] : [];
      } catch {
        return [];
      }
    }),
    [period, setPeriod] = useState("3M"),
    [region, setRegion] = useState("");
  const status = useAsyncData(fetchAiRuntimeStatus, "free-ai-status", true),
    published = useAsyncData(
      fetchLatestMarketReport,
      "latest-market-report",
      true,
    );
  const active = useRef(true),
    endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth
      .getSession()
      .then(({ data }) => setUserEmail(data.session?.user.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setUserEmail(session?.user.email ?? null),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  async function ask(question: string, all = false) {
    const text = question.trim();
    if (!text || busy) return;
    const request: AiRequest = {
      question: text,
      metalIds: all ? [] : ids,
      period,
      region: region || undefined,
      messages: messages
        .filter((m) => !m.error)
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.text.slice(0, 1200) })),
    };
    setMessages((v) => [...v, { id: "q-" + Date.now(), role: "user", text }]);
    setDraft("");
    setBusy(true);
    try {
      const result = await sendAiRequest(request, updatedAt);
      if (active.current) {
        setMessages((v) => [
          ...v,
          {
            id: "a-" + Date.now(),
            role: "assistant",
            text: result.text,
            sources: result.report?.sources,
          },
        ]);
        status.reload();
        published.reload();
      }
    } catch (e) {
      if (active.current)
        setMessages((v) => [
          ...v,
          {
            id: "error-" + Date.now(),
            role: "assistant",
            error: true,
            text:
              e instanceof Error
                ? e.message
                : "Ответ не сформирован. Повторите позже.",
          },
        ]);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(draft);
  };
  const unavailable =
    status.state.status === "ready" && !status.state.data.configured;
  return (
    <>
      <PageHeader
        title="ИИ-аналитик"
        description="Чат и заключения по проверенным данным платформы. Факты отделены от качественных интерпретаций и условных сценариев."
      />
      <Panel className="mb-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Бесплатный серверный ИИ</h2>
            <p role="status" className="mt-1 text-xs text-ink-400">
              {status.state.status === "ready"
                ? status.state.data.message
                : status.state.status === "error"
                  ? status.state.message
                  : "Проверка доступности…"}
            </p>
            {status.state.status === "ready" && status.state.data.primary && (
              <p className="mt-1 break-words text-xs text-ink-400">
                {status.state.data.primary.provider} ·{" "}
                {status.state.data.primary.model}
                {status.state.data.verifiedAt
                  ? ` · Проверен ${formatDateTime(Date.parse(status.state.data.verifiedAt))}`
                  : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={status.reload}
            className="flex items-center gap-1 text-xs text-brand-400"
          >
            <RefreshCw size={13} /> Проверить доступность
          </button>
        </div>
      </Panel>
      <Panel className="mb-4 p-4">
        <h2 className="text-sm font-semibold">
          Последнее автоматическое заключение
        </h2>
        {published.state.status === "ready" ? (
          published.state.data ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-brand-400">
                Открыть отчёт от{" "}
                {formatDateTime(Date.parse(published.state.data.generatedAt))}
              </summary>
              <div className="mt-3 whitespace-pre-wrap break-words text-sm text-ink-300">
                {renderVerifiedReport(published.state.data)}
              </div>
            </details>
          ) : (
            <p className="mt-2 text-xs text-ink-400">
              Проверенных ИИ-отчётов пока нет. Отчёт появляется только после
              реального ответа провайдера, проверки и сохранения.
            </p>
          )
        ) : (
          <p className="mt-2 text-xs text-ink-400">
            {published.state.status === "error"
              ? published.state.message
              : "Загрузка…"}
          </p>
        )}
      </Panel>
      <div className="mb-4 flex gap-3 rounded-xl border border-ink-800 bg-ink-900/70 p-4 text-xs text-ink-400">
        <Info size={16} className="shrink-0" />
        <p>
          Числа, даты и ссылки в разделе фактов выводит сервер из Supabase.
          Модель предлагает только качественную интерпретацию и условные
          сценарии без вероятностей и целевых цен. Месячные средние, торговая
          стоимость и текущие котировки не взаимозаменяемы.
        </p>
      </div>
      <Panel className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="min-w-0 text-xs text-ink-400">
            Материал
            <select
              aria-label="Материал для ИИ-анализа"
              className="mt-1 w-full rounded border border-ink-700 bg-ink-950 p-2 text-ink-100"
              value={
                ids.length === 0 ? "all" : ids.length === 1 ? ids[0] : "compare"
              }
              onChange={(e) => {
                if (e.target.value !== "compare")
                  setIds(e.target.value === "all" ? [] : [e.target.value]);
              }}
            >
              <option value="all">Все материалы</option>
              {ids.length > 1 && (
                <option value="compare">Сравнение: {ids.length}</option>
              )}
              {METALS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.symbol} — {m.nameRu}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-xs text-ink-400">
            Период
            <select
              aria-label="Период ИИ-анализа"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="mt-1 w-full rounded border border-ink-700 bg-ink-950 p-2 text-ink-100"
            >
              {[
                ["1D", "День"],
                ["1W", "Неделя"],
                ["1M", "Месяц"],
                ["3M", "Девяносто дней"],
                ["6M", "Полгода"],
                ["1Y", "Год"],
                ["5Y", "Пять лет"],
              ].map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-xs text-ink-400">
            Регион
            <select
              aria-label="Регион ИИ-анализа"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="mt-1 w-full rounded border border-ink-700 bg-ink-950 p-2 text-ink-100"
            >
              <option value="">Все регионы</option>
              {["Европа", "США", "Азия"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        </div>
        <details className="mt-3 text-xs text-ink-400">
          <summary className="cursor-pointer">
            Выбрать несколько материалов для сравнения
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {METALS.map((m) => (
              <label key={m.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ids.includes(m.id)}
                  onChange={(e) =>
                    setIds((v) =>
                      e.target.checked
                        ? [...v, m.id]
                        : v.filter((id) => id !== m.id),
                    )
                  }
                />
                {m.symbol} — {m.nameRu}
              </label>
            ))}
          </div>
          <p className="mt-2">
            Если список пуст, анализ охватывает доступные данные по всем
            материалам.
          </p>
        </details>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy || unavailable}
            className="text-sm text-brand-400 disabled:opacity-40"
            onClick={() =>
              void ask(
                "Подготовь подробный аналитический отчёт по выбранным материалам, с фактами, рисками и сценариями.",
              )
            }
          >
            Обновить анализ
          </button>
          <button
            type="button"
            disabled={busy || unavailable}
            className="text-sm text-brand-400 disabled:opacity-40"
            onClick={() =>
              void ask(
                "Подготовь аналитический отчёт по всем материалам и укажи отсутствующие показатели.",
                true,
              )
            }
          >
            Отчёт по всем металлам
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-500">
          Одинаковый запрос с теми же фактами возвращает сохранённый результат.
          Новые генерации ограничены серверной квотой.
        </p>
      </Panel>
      {supabase &&
        (userEmail ? (
          <div className="mb-4 flex flex-wrap gap-3 text-xs text-ink-400">
            <p>Выполнен вход: {userEmail}</p>
            <button
              type="button"
              className="text-brand-400"
              onClick={() => void supabase?.auth.signOut()}
            >
              Выйти
            </button>
          </div>
        ) : (
          <form
            className="mb-4 flex flex-wrap gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const { error } = await supabase!.auth.signInWithOtp({
                email,
                options: { emailRedirectTo: window.location.origin + "/#ai" },
              });
              setAuthMessage(
                error
                  ? "Не удалось отправить ссылку входа."
                  : "Ссылка для входа отправлена на почту.",
              );
            }}
          >
            <input
              required
              type="email"
              aria-label="Электронная почта"
              placeholder="Электронная почта"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-w-0 max-w-full rounded border border-ink-700 bg-ink-900 p-2"
            />
            <button type="submit" className="text-sm text-brand-400">
              Получить ссылку входа
            </button>
            <p role="status" className="text-xs text-ink-400">
              {authMessage || "Для чата требуется вход в систему."}
            </p>
          </form>
        ))}
      <Panel className="flex min-h-[480px] flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-ink-800 px-5 py-4">
          <Bot size={20} className="text-brand-400" />
          <div>
            <p className="text-sm font-semibold">Чат ALFA ANALYTICS</p>
            <p className="text-xs text-ink-400">Анализ подтверждённых данных</p>
          </div>
        </div>
        <div className="max-h-[65vh] flex-1 space-y-5 overflow-y-auto p-4 md:p-6">
          {!messages.length && (
            <p className="text-sm text-ink-400">
              Выберите металл и период. После входа и подключения бесплатного
              провайдера здесь появится настоящий ответ модели. Производственные
              показатели и рыночные события без источника не подставляются.
            </p>
          )}
          {messages.map((m) => (
            <ChatBubble key={m.id} message={m} />
          ))}
          {busy && (
            <p aria-label="Ответ формируется" className="text-sm text-ink-400">
              Сервер проверяет данные и формирует ответ…
            </p>
          )}
          <div ref={endRef} />
        </div>
        <div className="flex flex-wrap gap-2 border-t border-ink-800 p-4">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy || unavailable}
              onClick={() => void ask(s)}
              className="rounded-full border border-ink-700 px-3 py-1.5 text-xs text-ink-300 disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={submit}
          className="flex gap-3 border-t border-ink-800 p-4"
        >
          <input
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Вопрос ИИ-аналитику"
            placeholder="Вопрос о металле, периоде или источниках"
            className="min-w-0 flex-1 rounded border border-ink-700 bg-ink-950 p-3 text-sm"
          />
          <button
            type="submit"
            aria-label="Отправить вопрос"
            disabled={!draft.trim() || busy || unavailable}
            className={cn(
              "shrink-0 rounded p-3",
              draft.trim() && !busy && !unavailable
                ? "bg-brand-500 text-ink-950"
                : "bg-ink-800 text-ink-500",
            )}
          >
            <Send size={18} />
          </button>
        </form>
      </Panel>
    </>
  );
}
