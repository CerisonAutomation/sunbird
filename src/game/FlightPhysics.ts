import { clamp, lerp } from "./math";
import { ALT_CEILING, ALT_CEILING_FADE } from "./constants";

/** Keep the initial island-transfer arc intact. Long, passive glides gradually
 * shed lift so a powered bird doesn't hang in the air for half a minute.
 * This is shared by players, split-screen racers and AI through Bird.step. */
export function glideLiftScale(airSeconds: number): number {
  return lerp(1, 0.4, clamp((airSeconds - 3) / 5, 0, 1));
}

/**
 * Damp an upward speed as the bird approaches the altitude ceiling.
 *
 * Returns the vertical speed after damping: unchanged below the fade band and
 * scaled toward zero across it. It only ever reduces a CLIMB — descent and
 * level flight pass through untouched, so dives, glides and landings are exactly
 * as they were. Applied inside Bird.step so every lift source is covered by one
 * rule (thermals, the Zenith ascent super-lift, sunflowers, anything added
 * later) instead of each site needing its own clamp it might forget.
 */
export function dampClimbAtCeiling(vy: number, altitude: number): number {
  if (vy <= 0) return vy;
  const fade = clamp((altitude - (ALT_CEILING - ALT_CEILING_FADE)) / ALT_CEILING_FADE, 0, 1);
  return vy * (1 - fade);
}
