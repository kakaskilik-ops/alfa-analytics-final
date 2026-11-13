import MarketControls from "@/components/market/MarketControls";
import { DISPLAY_MODES } from "@/data/displayModes";
import { regionalView } from "@/services/liveData";
import { lazy, Suspense, useEffect, useState } from "react";
const AnalyticsPage = lazy(() => import("@/pages/AnalyticsPage"));
const AiAnalystPage = lazy(() => import("@/pages/AiAnalystPage"));
const MarketPage = lazy(() => import("@/pages/MarketPage"));
const MetalsPage = lazy(() => import("@/pages/MetalsPage"));
const NewsPage = lazy(() => import("@/pages/NewsPage"));
const SourcesPage = lazy(() => import("@/pages/SourcesPage"));
import Sidebar, { type Section } from "@/components/layout/Sidebar";
import { useFavorites } from "@/hooks/useFavorites";
import { loadLiveMarketData, type LiveMarketData } from "@/services/liveData";

export default function App() {
  const readSection = (): Section =>
    ["market", "metals", "sources", "ai", "analytics", "news"].includes(
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

  const [region, setRegion] = useState("Европа");
  const [mode, setMode] = useState("USD/kg");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const display = DISPLAY_MODES.find((m) => m.id === mode)!;
  const scopedData = regionalView(
    liveData,
    region,
    choices,
    display.currency,
    display.unit,
  );
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
                (scopedData?.quotes.size
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
        {["market", "metals", "analytics"].includes(section) && (
          <MarketControls
            region={region}
            onRegion={setRegion}
            mode={mode}
            onMode={setMode}
            choices={choices}
            onChoice={(id, key) => setChoices((v) => ({ ...v, [id]: key }))}
            data={liveData}
          />
        )}
        <Suspense
          fallback={<p className="text-sm text-ink-400">Загрузка страницы…</p>}
        >
          <div key={section} className="mx-auto max-w-7xl animate-fade-up">
            {section === "news" && <NewsPage />}
            {section === "analytics" && (
              <AnalyticsPage updatedAt={updatedAt} liveData={scopedData} />
            )}
            {section === "market" && (
              <MarketPage
                updatedAt={updatedAt}
                favorites={favorites}
                liveData={scopedData}
              />
            )}
            {section === "metals" && (
              <MetalsPage
                updatedAt={updatedAt}
                favorites={favorites}
                liveData={scopedData}
              />
            )}
            {section === "sources" && (
              <SourcesPage updatedAt={updatedAt} liveData={scopedData} />
            )}
            {section === "ai" && <AiAnalystPage updatedAt={updatedAt} />}
          </div>
        </Suspense>
      </main>
    </div>
  );
}
