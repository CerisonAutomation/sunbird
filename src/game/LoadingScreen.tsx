import { useEffect, useState, useMemo } from "react";

/**
 * Beautiful loading screen with progress bar and tips.
 * Shows while the game initializes (WebGL, audio, assets).
 */
export function LoadingScreen({ progress = 0 }: { progress?: number }) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  // Rotate through helpful tips
  const tips = useMemo(() => [
    "Hold to dive · Release to soar",
    "Perfect landings give bonus speed",
    "Collect coins to unlock new skins",
    "Try to reach the highest altitude",
    "Use thermals to gain height",
    "Fever mode gives 2× points",
    "Share your score with friends",
    "Complete daily challenges for rewards",
  ], []);

  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((i) => (i + 1) % tips.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [tips.length]);

  // Calculate loading stage text
  const getStageText = (p: number): string => {
    if (p < 20) return "Initializing WebGL";
    if (p < 40) return "Loading audio system";
    if (p < 60) return "Generating terrain";
    if (p < 80) return "Preparing biomes";
    if (p < 95) return "Almost ready";
    return "Ready to fly!";
  };

  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-bird">🐦</div>
        <h1 className="loading-title">Sunbird</h1>
        <p className="loading-subtitle">{getStageText(progress)}{dots}</p>
        <div className="loading-bar-container">
          <div className="loading-bar" style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
        <p className="loading-progress">{Math.round(progress)}%</p>
        <p className="loading-tip">{tips[tipIndex]}</p>
      </div>
    </div>
  );
}
