/** Retire only Sunbird's old worker/cache; don't erase other apps on portal origins. */
if ("serviceWorker" in navigator) {
  const workerUrl = new URL("./sw.js", location.href).href;
  void navigator.serviceWorker.getRegistrations().then(regs => {
    for (const reg of regs) {
      const script = (reg.active ?? reg.waiting ?? reg.installing)?.scriptURL;
      if (script === workerUrl) void reg.unregister();
    }
  }).catch(() => {});
}
if ("caches" in window) {
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
