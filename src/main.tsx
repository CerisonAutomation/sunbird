import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// The game shell is intentionally network-served. A stale service worker can
// keep an older menu bundle alive after a deploy, so new builds do not install
// an app-shell worker. Existing workers self-clean in public/sw.js.
