import PageHeader from "@/components/layout/PageHeader";
import MarketMonitor from "@/components/market/MarketMonitor";
export default function MonitorPage() {
  return (
    <>
      <PageHeader
        title="Монитор рынка"
        description="Подтверждённые закупки и контрактные документы. Автоматические публикации без обязательного участия ИИ."
      />
      <MarketMonitor />
    </>
  );
}
