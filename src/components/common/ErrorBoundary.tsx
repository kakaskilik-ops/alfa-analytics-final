import { Component, type ReactNode } from "react";
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    console.error("application_render_failed");
  }
  render() {
    return this.state.failed ? (
      <div role="alert" className="p-8 text-ink-200">
        <h1 className="text-xl mb-4">Не удалось открыть страницу</h1>
        <button className="text-brand-400" onClick={() => location.reload()}>
          Перезагрузить
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
