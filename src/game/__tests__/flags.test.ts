import { beforeEach, describe, expect, it } from "vitest";
import { flag, setFlag } from "../Flags";

/**
 * Feature flags — the production kill-switch. These lock the resolution
 * contract (default → persisted override) so a rollout can be held back or
 * force-enabled without a redeploy.
 */
describe("feature flags", () => {
  beforeEach(() => localStorage.clear());

  it("defaults on", () => {
    expect(flag("challengeShare")).toBe(true);
    expect(flag("nativeShare")).toBe(true);
    expect(flag("modeAwareChallenge")).toBe(true);
  });

  it("round-trips a persisted override", () => {
    setFlag("nativeShare", false);
    expect(flag("nativeShare")).toBe(false);
    setFlag("nativeShare", true);
    expect(flag("nativeShare")).toBe(true);
  });

  it("an override never bleeds into a sibling flag", () => {
    setFlag("challengeShare", false);
    expect(flag("challengeShare")).toBe(false);
    expect(flag("nativeShare")).toBe(true);
    expect(flag("modeAwareChallenge")).toBe(true);
  });
});
