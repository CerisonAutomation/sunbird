
/** Monday-anchored ISO week key, e.g. `2026-W07`. */
export function weekKey(now = new Date()): string {
  // Local calendar day, matching weekBounds() so keys and windows agree.
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);