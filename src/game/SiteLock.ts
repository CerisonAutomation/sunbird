/**
 * Sitelock — prevents the game from running on unauthorized domains.
 *
 * CrazyGames requires sitelock for monetized builds.
 * Poki requires no other portal branding in the build.
 *
 * In dev mode (localhost / 127.0.0.1), the lock is bypassed.
 */

const ALLOWED_HOSTS: string[] = [
  // CrazyGames
  "developer.crazygames.com",
  "www.crazygames.com",
  "crazygames.com",
  // Poki
  "poki.com",
  "www.poki.com",
  // itch.io
  "itch.io",
  // Newgrounds
  "newgrounds.com",
  "www.newgrounds.com",
  // GamePix
  "gamepix.com",
  // Y8
  "y8.com",
  "www.y8.com",
  // Softgames
  "softgames.com",
  "www.softgames.com",
  // Vercel preview / production
  "sunbird-snowy.vercel.app",
  // Dev
  "localhost",
  "127.0.0.1",
];

export function isAuthorizedHost(): boolean {
  if (typeof location === "undefined") return true; // SSR / worker
  const h = location.hostname;
  // Dev mode — always allowed
  if (h === "localhost" || h === "127.0.0.1") return true;
  // Check against allowlist
  return ALLOWED_HOSTS.some(
    (allowed) => h === allowed || h.endsWith("." + allowed),
  );
}

/**
 * Show a blocking overlay if the game is hosted somewhere unauthorized.
 * Called once at boot; if the host is fine, this is a no-op.
 */
export function enforceSitelock(): void {
  if (isAuthorizedHost()) return;

  // Build the overlay safely — hostname is set via textContent, not innerHTML.
  document.body.innerHTML = "";
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;display:grid;place-items:center;background:#1a1430;color:#fff6e8;font-family:sans-serif;padding:24px;text-align:center";

  const inner = document.createElement("div");
  const icon = document.createElement("div");
  icon.style.cssText = "font-size:42px;margin-bottom:8px";
  icon.textContent = "\u{1F6AB}";

  const h1 = document.createElement("h1");
  h1.style.cssText = "margin:0 0 8px;font-size:22px";
  h1.textContent = "Unauthorized Host";

  const msg = document.createElement("p");
  msg.style.cssText = "opacity:0.7;font-size:14px;max-width:400px;margin:0 auto";
  const prefix = "This game is not authorized to run on ";
  const suffix = ". Please play on the official portal.";
  msg.appendChild(document.createTextNode(prefix));
  const bold = document.createElement("b");
  bold.textContent = location.hostname; // safe: textContent, not innerHTML
  msg.appendChild(bold);
  msg.appendChild(document.createTextNode(suffix));

  inner.append(icon, h1, msg);
  overlay.appendChild(inner);
  document.body.appendChild(overlay);

  throw new Error(`Sitelock: blocked on ${location.hostname}`);
}
