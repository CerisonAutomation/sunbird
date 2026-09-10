import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Check for SW updates every 60 seconds so new deploys reach users fast.
        setInterval(() => {
          reg.update().catch(() => undefined);
        }, 60_000);
      })
      .catch(() => undefined);
  });
}
