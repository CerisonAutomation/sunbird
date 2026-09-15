/** One priority slot for text that competes with flight/landing visibility. */
export function feedbackSlot(s: { countdown: number; finishRemaining: number; launchBannerT: number; goalPop: string }): string {
  return s.countdown > 0 ? "countdown"
    : s.finishRemaining > 0 && s.finishRemaining < 900 ? "finish"
    : s.launchBannerT > 0 ? "launch"
    : s.goalPop ? "goal" : "hint";
}
