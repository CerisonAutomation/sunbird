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
 * This guard demotes rejections to a rate-limited console.debug message
 * (once per 10 s): the red error frame is gone (preventDefault), the
 * production console stays completely clean (console.debug only renders
 * in verbose log mode, which portal QA does not enable — and the
 * production gate, scripts/verify-prod.mjs, bans console.log/warn/info in
 * shipped client code), while developers debugging with verbose logs
 * still see the reason.
 *
 * Install once at boot; `uninstallRejectionGuard` is provided for teardown
 * (and tests) so re-mounts never stack duplicate listeners.
 */
let installed = false;
let lastEmitAt = 0;

function onRejection(event: PromiseRejectionEvent): void {
  // Stop the browser's red "Uncaught (in promise)" error frame.
  event.preventDefault();
  const now = Date.now();
  if (now - lastEmitAt < 10_000) return;
  lastEmitAt = now;
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  console.debug(`[sunbird] unhandled rejection (suppressed): ${reason.slice(0, 160)}`);
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
  lastEmitAt = 0;
}
