/**
 * Resolution-stepping policy for the adaptive quality loop.
 *
 * Kept pure and dependency-free so it can be unit-tested without a WebGL
 * context: Game.ts imports Three.js and the whole game, which is far too heavy
 * to pull into a test just to exercise an arithmetic decision.
 */

/** Frame time above this means the 60 fps budget is blown: step down. */
export const STEP_DOWN_FRAME_SECONDS = 1 / 40;
/** Frame time below this means there is real headroom: step up. */
export const STEP_UP_FRAME_SECONDS = 1 / 57;
/** Size of one resolution step, in devicePixelRatio units. */
export const DPR_STEP = 0.25;
/** Lowest resolution we will ever drop to — below 1 is blurry and pointless. */
export const DPR_FLOOR = 1;
/** Seconds between adaptive-quality decisions. */
export const QUALITY_WINDOW_SECONDS = 2.5;
/** Resolution changes are locked out for this long after any change. */
export const DPR_COOLDOWN_SECONDS = 5;

/**
 * Decide the next devicePixelRatio for the adaptive quality loop.
 *
 * `target` is the ceiling reported by `preferredDpr()`. The result is always
 * clamped to [DPR_FLOOR, target], and never changes while `cooldown > 0`.
 *
 * Two failure modes this deliberately avoids:
 *  - A single bad moment (a GC pause, a background sync) permanently degrading
 *    the rest of the session — the old loop only ever stepped down.
 *  - A single good frame bouncing the resolution straight back up into another
 *    bad frame — hence the dead band and the caller-side cooldown.
 */
export function nextDpr(current: number, target: number, frameEma: number, cooldown: number): number {
  const ceiling = Math.max(DPR_FLOOR, target);
  const clamped = Math.min(Math.max(current, DPR_FLOOR), ceiling);
  if (cooldown > 0) return clamped;
  if (frameEma > STEP_DOWN_FRAME_SECONDS) return Math.max(DPR_FLOOR, clamped - DPR_STEP);
  if (frameEma < STEP_UP_FRAME_SECONDS && clamped < ceiling) {
    return Math.min(ceiling, clamped + DPR_STEP);
  }
  return clamped;
}
