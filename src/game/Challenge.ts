/**
 * Rival challenge links — the zero-server viral loop.
 *
 * A challenge is just `#rival=<seed>.<distance>.<name>` appended to any
 * URL of the game. The recipient flies the SAME seed (same hills, same
 * thermals, same weather) against the sender's posted distance. No backend,
 * no account, no expiry — the world generator IS the referee, because a
 * seed reproduces the exact same course on every device.
 */

export type RivalChallenge = {
  seed: string;
  distance: number;
  name: string;
  /** Optional game mode the challenger flew — the recipient races the same
   *  hills in the same mode, not a default daytrip. */
  mode?: string;
};

const KEY = "rival";
const MODE_KEY = "mode";

/** Consuming the hash is destructive, and React StrictMode double-mounts the
 * Game — the first (throwaway) instance would swallow the link and the real
 * one would see nothing. The parsed challenge lives here for the session. */
let consumed: RivalChallenge | null = null;

/** Parses (and consumes) a challenge from the current URL, if present. */
export function readChallengeFromUrl(): RivalChallenge | null {
  if (consumed) return consumed;
  try {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const raw = params.get(KEY);
    if (!raw) return null;
    const [seed, dist, ...nameParts] = raw.split(".");
    const distance = Math.floor(Number(dist));
    if (!seed || !/^[a-z0-9-]{1,40}$/i.test(seed)) return null;
    if (!Number.isFinite(distance) || distance <= 0 || distance > 1_000_000) return null;
    const name = decodeURIComponent(nameParts.join(".")).replace(/[^\p{L}\p{N} _.-]/gu, "").slice(0, 14) || "A rival";
    // Optional companion mode, carried as a sibling hash param so old links
    // (three-dot `seed.distance.name`) keep working unchanged.
    const mode = (params.get(MODE_KEY) ?? "").replace(/[^a-z0-9-]/g, "").slice(0, 20) || undefined;
    // Consume the hash so refresh/share of the page doesn't re-trigger it.
    params.delete(KEY);
    params.delete(MODE_KEY);
    const rest = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ""}`);
    consumed = { seed, distance, name, mode };
    return consumed;
  } catch {
    return null;
  }
}

/** Builds a shareable challenge URL for the given run, optionally pinning the mode. */
export function buildChallengeUrl(seed: string, distance: number, name: string, mode?: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  const payload = `${seed}.${Math.floor(distance)}.${encodeURIComponent(name)}`;
  return `${base}#${KEY}=${payload}${mode ? `&${MODE_KEY}=${encodeURIComponent(mode)}` : ""}`;
}
