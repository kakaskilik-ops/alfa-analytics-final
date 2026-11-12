import { lazy, Suspense, useEffect, useState } from "react";
const AnalyticsPage = lazy(() => import("@/pages/AnalyticsPage"));
const AiAnalystPage = lazy(() => import("@/pages/AiAnalystPage"));
const MarketPage = lazy(() => import("@/pages/MarketPage"));
const MetalsPage = lazy(() => import("@/pages/MetalsPage"));
const SourcesPage = lazy(() => import("@/pages/SourcesPage"));
import Sidebar, { type Section } from "@/components/layout/Sidebar";
import { useFavorites } from "@/hooks/useFavorites";
import { loadLiveMarketData, type LiveMarketData } from "@/services/liveData";

export default function App() {
  const readSection = (): Section =>
    ["market", "metals", "sources", "ai", "analytics"].includes(
      location.hash.slice(1),
    )
      ? (location.hash.slice(1) as Section)
      : "market";
  const [section, setSection] = useState<Section>(readSection);
  const [loading, setLoading] = useState(true);
  const refresh = () => {
    setLoading(true);
    loadLiveMarketData(true)
      .then((data) => {
        setLiveData(data);
        setUpdatedAt(new Date());
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    const listener = () => setSection(readSection());
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const favorites = useFavorites();
  const [liveData, setLiveData] = useState<LiveMarketData | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      loadLiveMarketData(true).then((data) => {
        if (active) {
          setLiveData(data);
          setUpdatedAt(new Date());
          setLoading(false);
        }
      });
    void load();
    const timer = setInterval(load, 300000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        active={section}
        onChange={(next) => {
          location.hash = next;
          setSection(next);
        }}
      />

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 md:px-10 md:py-10">
        <div
          className="mx-auto max-w-7xl mb-4 flex items-center gap-3 text-xs text-ink-400"
          role="status"
        >
          <span>
            {loading
              ? "Загрузка котировок…"
              : (liveData?.error ??
                (liveData?.quotes.size
                  ? "Данные источников загружены"
                  : "Нет подтверждённых котировок"))}
          </span>
          <button
            disabled={loading}
            onClick={refresh}
            className="text-brand-400 disabled:opacity-40"
          >
            Обновить
          </button>
        </div>
        <Suspense
          fallback={<p className="text-sm text-ink-400">Загрузка страницы…</p>}
        >
          <div key={section} className="mx-auto max-w-7xl animate-fade-up">
            {section === "analytics" && (
              <AnalyticsPage updatedAt={updatedAt} liveData={liveData} />
            )}
            {section === "market" && (
              <MarketPage
                updatedAt={updatedAt}
                favorites={favorites}
                liveData={liveData}
              />
            )}
            {section === "metals" && (
              <MetalsPage
                updatedAt={updatedAt}
                favorites={favorites}
                liveData={liveData}
              />
            )}
            {section === "sources" && (
              <SourcesPage updatedAt={updatedAt} liveData={liveData} />
            )}
            {section === "ai" && <AiAnalystPage updatedAt={updatedAt} />}
          </div>
        </Suspense>
      </main>
    </div>
  );
}
