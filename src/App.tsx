import { useEffect, useRef, useState } from "react";
import { Game } from "./game/Game";

export default function App() {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let game: Game | null = null;
    let cancelled = false;
    try {
      game = new Game(el);
    } catch (err) {
      console.error("Sunbird failed to boot:", err);
      if (!cancelled) {
        setFailed(err instanceof Error ? err.message : String(err));
      }
    }
    return () => {
      cancelled = true;
      game?.dispose();
    };
  }, []);

  if (failed) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "grid",
          placeItems: "center",
          background: "#1a1430",
          color: "#fff6e8",
          fontFamily: "sans-serif",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 42, marginBottom: 8 }}>🌤</div>
          <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Sunbird can't spread its wings here</h1>
          <p style={{ opacity: 0.7, fontSize: 14, maxWidth: 420, margin: "0 auto 16px" }}>
            This browser couldn't start the 3D renderer (WebGL). Try a recent version of Chrome, Edge,
            Firefox or Safari — or check that hardware acceleration is enabled.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              font: "inherit",
              border: "none",
              borderRadius: 12,
              padding: "10px 18px",
              background: "#ff7a45",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return <div ref={ref} className="game-root" />;
}
