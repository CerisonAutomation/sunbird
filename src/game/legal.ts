/**
 * Legal / policy URLs, in one place.
 *
 * Poki's external-resources policy does not merely ask for a privacy policy to
 * exist — it asks for one that is *hosted on a live webpage accessible to all
 * players and linked inside the game* before an external service (AUDS,
 * Netlib) can be approved (see docs/poki/16-submission.md, SUB-06 … SUB-08).
 * The page itself ships in `public/privacy.html`, so the default URL is the
 * standalone deploy's copy of it.
 *
 * Deliberately NOT part of the per-target edition module: every edition —
 * including Poki — links the same policy, and the portal's own `openExternalLink`
 * wrapper is what keeps the link compliant there (Poki opens external links in
 * its own modal instead of navigating the game frame away).
 */
const raw = (import.meta.env.VITE_PRIVACY_URL as string | undefined)?.trim();

/** Live privacy policy page. */
export const PRIVACY_URL = raw && raw.length > 0 ? raw : "https://sunbird-snowy.vercel.app/privacy.html";

/** Terms of service — same hosting, same rules. */
export const TERMS_URL = PRIVACY_URL.replace(/privacy\.html?$/, "terms.html");
