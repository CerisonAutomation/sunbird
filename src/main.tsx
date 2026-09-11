import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// PWA shell cache — web builds only. Portal builds (Poki/CrazyGames) run in
// a cross-origin iframe where a service worker is useless at best and can
// fight the portal's own caching at worst. Same for any embedded context.
const isPortal = (import.meta.env.VITE_PORTAL_TARGET ?? "none") !== "none";
let embedded = false;
try {
  embedded = window.self !== window.top;
} catch {
  embedded = true; // cross-origin parent throws — definitely embedded
}
if ("serviceWorker" in navigator && !isPortal && !embedded) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
