import { clamp, lerp } from "./math";

/** Keep the initial island-transfer arc intact. Long, passive glides gradually
 * shed lift so a powered bird doesn't hang in the air for half a minute.
 * This is shared by players, split-screen racers and AI through Bird.step. */
export function glideLiftScale(airSeconds: number): number {
  return lerp(1, 0.4, clamp((airSeconds - 3) / 5, 0, 1));
}
