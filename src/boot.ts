// Mirrors the TARGET check in sdk/platform.ts, but written here so the
// minifier can fully constant-fold it: vite inlines VITE_PORTAL_TARGET as a
// literal, and `"poki" !== "none"` folds to a constant — DCE then strips the
// whole retirement pass from portal bundles. Portals serve the game in
// iframes where workers are not allowed, and their scanners flag any
// service-worker API reference. (Builds only succeed with the lowercase
// values validated in vite.config.ts, so no toLowerCase is needed here.)
const IS_PORTAL = (import.meta.env.VITE_PORTAL_TARGET ?? "none") !== "none";

/** Retire only Sunbird's old worker/cache; don't erase other apps on portal origins. */
if (!IS_PORTAL && "serviceWorker" in navigator) {
  const workerUrl = new URL("./sw.js", location.href).href;
  void navigator.serviceWorker.getRegistrations().then(regs => {
    for (const reg of regs) {
      const script = (reg.active ?? reg.waiting ?? reg.installing)?.scriptURL;
      if (script === workerUrl) void reg.unregister();
    }
  }).catch(() => {});
}
if (!IS_PORTAL && "caches" in window) {
  void caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("sunbird-shell-")).map(k => caches.delete(k)))).catch(() => {});
}

const boot = document.getElementById("boot");
const copy = document.getElementById("boot-copy");
const retry = document.getElementById("boot-retry");
if (boot && copy && retry) {
  retry.addEventListener("click", () => location.reload());
  const timer = setTimeout(() => {
    if (!boot.isConnected) return;
    copy.textContent = "Still warming up. Slow connection? You can reload and try again.";
    retry.style.display = "block";
  }, 20000);
  window.addEventListener("sunbird-ready", () => clearTimeout(timer), { once: true });
  window.addEventListener("error", () => {
    if (!boot.isConnected) return;
    boot.classList.add("is-error");
    copy.textContent = "Sunbird could not start. Reload to try again.";
  }, { once: true });
}
