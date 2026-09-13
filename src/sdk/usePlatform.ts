import { useEffect, useState } from "react";
import { initPlatform, type PlatformAdapter } from "./platform";

/**
 * React hook that initializes the platform SDK adapter.
 *
 * Returns null until the SDK is ready — the Game class should guard
 * ad calls with `if (adapter)`.
 *
 * onAdOpened / onAdClosed are called on every ad break and should
 * mute audio + disable input.
 */
export function usePlatform(onAdOpened: () => void, onAdClosed: () => void) {
  const [adapter, setAdapter] = useState<PlatformAdapter | null>(null);

  useEffect(() => {
    let live = true;
    initPlatform({ onAdOpened, onAdClosed }).then((a) => {
      if (live) setAdapter(a);
    });
    return () => {
      live = false;
    };
  }, []);

  return adapter;
}
