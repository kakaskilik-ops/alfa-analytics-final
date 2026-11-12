import { useAsyncData } from "@/hooks/useAsyncData";
import { fetchNews } from "@/services/news";
import { formatDateTime } from "@/lib/format";
export default function MetalNews({ metalId }: { metalId: string }) {
  const load = useAsyncData(
    () => fetchNews({ metal: metalId, limit: 3 }),
    metalId,
    true,
  );
  return (
    <section className="rounded-xl border border-ink-800 p-4">
      <h3 className="text-sm font-semibold mb-3">Последние новости</h3>
      {load.state.status === "loading" && (
        <p className="text-xs text-ink-400">Загрузка…</p>
      )}
      {load.state.status === "error" && (
        <p className="text-xs text-ink-400">Новости пока недоступны.</p>
      )}
      {load.state.status === "ready" &&
        (load.state.data.length ? (
          load.state.data.map((n) => (
            <p className="text-sm mb-3" key={n.id}>
              <a
                href={n.url}
                target="_blank"
                rel="noreferrer"
                className="text-brand-400"
              >
                {n.titleRu ?? "Публикация ожидает перевода"}
              </a>
              <span className="block text-xs text-ink-400">
                {n.originalTitle} · {formatDateTime(n.publishedAt)}
              </span>
            </p>
          ))
        ) : (
          <p className="text-xs text-ink-400">
            Подтверждённых публикаций пока нет.
          </p>
        ))}
      <a
        className="inline-block mt-3 text-sm text-brand-400"
        href="#news"
        onClick={() => {
          try {
            sessionStorage.setItem("news-metal", metalId);
          } catch {
            /* Storage may be unavailable. */
          }
        }}
      >
        Все новости материала
      </a>
    </section>
  );
}
