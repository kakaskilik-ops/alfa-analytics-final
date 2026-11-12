import { useState } from "react";
import PageHeader from "@/components/layout/PageHeader";
import Panel from "@/components/common/Panel";
import { METALS, METAL_MAP } from "@/data/metals";
import { REGIONS } from "../../supabase/functions/_shared/universe";
import { NEWS_CATEGORIES } from "../../shared/news";
import { fetchNews } from "@/services/news";
import { useAsyncData } from "@/hooks/useAsyncData";
import { formatDateTime } from "@/lib/format";
import { sendAiRequest } from "@/services/ai";
export default function NewsPage() {
  const [metal, setMetal] = useState(() => {
    try {
      const m = sessionStorage.getItem("news-metal") ?? "";
      return METAL_MAP[m] ? m : "";
    } catch {
      return "";
    }
  });
  const [region, setRegion] = useState(""),
    [category, setCategory] = useState(""),
    [days, setDays] = useState("7");
  const [analysis, setAnalysis] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useAsyncData(
    () =>
      fetchNews({
        metal: metal || undefined,
        region: region || undefined,
        category: category || undefined,
        days: Number(days),
      }),
    JSON.stringify([metal, region, category, days]),
    true,
  );
  async function analyze(
    question: string,
    kind: "news" | "daily" | "weekly",
    newsId?: string,
  ) {
    setBusy(true);
    setAnalysis("");
    try {
      const reply = await sendAiRequest(
        {
          question,
          kind,
          newsId,
          period: kind === "weekly" ? "1W" : "1D",
          metalIds: metal ? [metal] : undefined,
        },
        new Date(),
      );
      setAnalysis(reply.text);
    } catch (e) {
      setAnalysis(
        e instanceof Error ? e.message : "Не удалось получить анализ.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Новости рынка металлов"
        description="Публикации разрешённых источников. Сохраняются ссылки и метаданные, полные статьи не копируются."
      />
      <div className="flex flex-wrap gap-3 mb-4">
        {[
          {
            label: "Металл",
            value: metal,
            onChange: setMetal,
            options: METALS.map((m) => [m.id, m.nameRu]),
          },
          {
            label: "Регион новостей",
            value: region,
            onChange: setRegion,
            options: REGIONS.map((r) => [r, r]),
          },
          {
            label: "Категория новостей",
            value: category,
            onChange: setCategory,
            options: Object.entries(NEWS_CATEGORIES),
          },
        ].map((f) => (
          <label key={f.label} className="text-xs text-ink-400">
            {f.label}
            <select
              aria-label={f.label}
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className="block bg-ink-900 rounded p-2 mt-1 max-w-full"
            >
              <option value="">Все</option>
              {f.options.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="text-xs text-ink-400">
          Период новостей
          <select
            aria-label="Период новостей"
            className="block bg-ink-900 p-2 rounded mt-1"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          >
            <option value="1">За сутки</option>
            <option value="7">За неделю</option>
            <option value="30">За месяц</option>
            <option value="90">За 90 дней</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-4 mb-4 text-sm">
        <button
          disabled={busy}
          className="text-brand-400 disabled:opacity-40"
          onClick={() =>
            analyze(
              "Сформируй ежедневную сводку главных событий и возможных факторов рынка.",
              "daily",
            )
          }
        >
          Сводка за день
        </button>
        <button
          disabled={busy}
          className="text-brand-400 disabled:opacity-40"
          onClick={() =>
            analyze("Сформируй еженедельный обзор событий рынка.", "weekly")
          }
        >
          Обзор за неделю
        </button>
        <button className="text-ink-300" onClick={load.reload}>
          Обновить ленту
        </button>
        <a href="#sources" className="text-ink-400">
          Реестр источников
        </a>
      </div>
      {load.state.status === "loading" && (
        <p role="status">Загрузка новостей…</p>
      )}
      {load.state.status === "error" && (
        <Panel className="p-5 text-sm text-ink-300">
          <p>
            {load.state.message} После настройки БД и развёртывания сборщик
            будет получать новости каждые 30 минут по заданному расписанию.
          </p>
          <button className="text-brand-400 mt-3" onClick={load.reload}>
            Повторить
          </button>
        </Panel>
      )}
      {load.state.status === "ready" && !load.state.data.length && (
        <Panel className="p-8 text-center text-ink-400">
          Подтверждённых публикаций по выбранным фильтрам пока нет.
        </Panel>
      )}
      {(busy || analysis) && (
        <Panel className="p-5 mb-4">
          <h2 className="text-base mb-3 font-semibold">ИИ-анализ</h2>
          <p
            className="whitespace-pre-wrap break-words text-sm text-ink-300"
            role="status"
          >
            {busy ? "Анализ доступных данных…" : analysis}
          </p>
        </Panel>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {load.state.status === "ready" &&
          load.state.data.map((n) => (
            <Panel className="p-5 flex flex-col gap-3" key={n.id}>
              <p className="text-xs text-ink-400">
                {n.sourceName} · {formatDateTime(n.publishedAt)}
              </p>
              <h2 className="text-lg font-semibold">
                {n.titleRu ?? "Публикация ожидает перевода"}
              </h2>
              <p className="text-sm text-ink-300">
                {n.summaryRu ??
                  "Русское резюме ещё не подготовлено. Доступен оригинальный заголовок и ссылка на источник."}
              </p>
              <p className="text-xs text-ink-400">
                Оригинал: {n.originalTitle}
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-brand-400">
                {n.metalIds.map((id) => (
                  <span key={id}>{METAL_MAP[id]?.nameRu}</span>
                ))}
              </div>
              <p className="text-xs text-ink-400">
                {n.regions.join(", ") || "Регион не определён"} ·{" "}
                {n.categories
                  .map(
                    (c) =>
                      NEWS_CATEGORIES[c as keyof typeof NEWS_CATEGORIES] ?? c,
                  )
                  .join(", ")}{" "}
                · Получено {formatDateTime(n.retrievedAt)}
              </p>
              <div className="flex flex-wrap gap-4 mt-auto text-sm">
                <a
                  href={n.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-400"
                >
                  Оригинал публикации
                </a>
                <button
                  disabled={busy}
                  className="text-ink-200 disabled:opacity-40"
                  onClick={() =>
                    analyze(
                      "Проанализируй эту новость: факты, возможное влияние на спрос и предложение, сопоставление с историей цен и неопределённость.",
                      "news",
                      n.id,
                    )
                  }
                >
                  Проанализировать новость
                </button>
              </div>
            </Panel>
          ))}
      </div>
    </>
  );
}
