import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/common/ErrorBoundary";
import OwnerKeyGate from "./components/auth/OwnerKeyGate";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <OwnerKeyGate>
        <App />
      </OwnerKeyGate>
    </ErrorBoundary>
  </StrictMode>,
);
