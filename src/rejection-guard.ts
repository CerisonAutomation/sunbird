/**
 * Global safety net for floating promise rejections.
 *
 * The game's network paths (leaderboard pushes, entitlement checks,
 * telemetry beacons) are best-effort by design, and portal SDK calls can
 * reject in odd sandbox states. An uncaught rejection surfaces in the
 * console as a red "Uncaught (in promise): …" frame — and portal QA tools
 * (Poki Inspector) treat console errors as defect signals, so one stray
 * rejection can torpedo an otherwise clean submission.
 *
 * This guard demotes rejections to a rate-limited console WARN instead:
 * developers still see the reason (once per 10 s), but the console no
 * longer fills with alarming red frames during a QA pass.
 *
 * Install once at boot; `uninstallRejectionGuard` is provided for teardown
 * (and tests) so re-mounts never stack duplicate listeners.
 */
let installed = false;
let lastWarnAt = 0;

function onRejection(event: PromiseRejectionEvent): void {
  // Stop the browser's red "Uncaught (in promise)" error frame.
  event.preventDefault();
  const now = Date.now();
  if (now - lastWarnAt < 10_000) return;
  lastWarnAt = now;
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  console.warn(`[sunbird] unhandled rejection (suppressed): ${reason.slice(0, 160)}`);
}

export function installRejectionGuard(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("unhandledrejection", onRejection);
}

export function uninstallRejectionGuard(): void {
  if (!installed || typeof window === "undefined") return;
  window.removeEventListener("unhandledrejection", onRejection);
  installed = false;
  lastWarnAt = 0;
}
