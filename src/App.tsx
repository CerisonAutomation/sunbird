import { Component, type ErrorInfo, type ReactNode, useEffect, useRef, useState } from "react";
// Type-only import: erased at compile time, so it does NOT drag the game (or
// Three.js) into the initial bundle. The runtime module is fetched by the
// dynamic import inside the mount effect, behind the inline boot loader.
import type { Game } from "./game/Game";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error): { error: string } {
    return { error: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Sunbird error boundary:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
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
            <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Something went wrong</h1>
            <p style={{ opacity: 0.7, fontSize: 14, maxWidth: 420, margin: "0 auto 16px" }}>
              {this.state.error}
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
    return this.props.children;
  }
}

export default function App() {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // Portal ad-banner host: the CrazyGames adapter mounts its 320x50 banner
  // into this container once the SDK is ready. Rendered only when a banner
  // placement id is configured (portal builds), so direct/PWA builds carry
  // no extra node.
  const bannerId = import.meta.env.VITE_CRAZY_BANNER_ID ?? "";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let game: Game | null = null;
    let cancelled = false;
    let readyFrame = 0;

    // The game is code-split on purpose: the renderer, terrain, audio engine and
    // the whole Three.js graph now load AFTER first paint instead of blocking it.
    // The inline boot loader in index.html covers the gap.
    const boot = async (): Promise<void> => {
      try {
        const { Game: GameCtor } = await import("./game/Game");
        if (cancelled) return;
        game = new GameCtor(el);
        readyFrame = requestAnimationFrame(() => {
          if (cancelled) return;
          document.getElementById("boot-shell")?.remove();
          window.dispatchEvent(new Event("sunbird-ready"));
        });
      } catch (err) {
        console.error("Sunbird failed to boot:", err);
        if (cancelled) return;
        // Defer: setState synchronously inside an effect body forces a
        // cascading re-render; a microtask keeps the boot-failure path clean.
        const msg = err instanceof Error ? err.message : String(err);
        queueMicrotask(() => {
          if (!cancelled) {
            document.getElementById("boot-shell")?.remove();
            window.dispatchEvent(new Event("sunbird-ready"));
            setFailed(msg);
          }
        });
      }
    };
    void boot();

    return () => {
      // Also covers the StrictMode mount/unmount/mount cycle while the chunk is
      // still in flight: the stale run constructs nothing, and anything it did
      // construct before cleanup is disposed here.
      cancelled = true;
      cancelAnimationFrame(readyFrame);
      game?.dispose();
    };
  }, []);

  if (failed) {
    const chunkFailed = /fetch|import|module|chunk|network|load failed/i.test(failed);
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
          <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>{chunkFailed ? "The flight download was interrupted" : "Sunbird can’t spread its wings here"}</h1>
          <p style={{ opacity: 0.7, fontSize: 14, maxWidth: 420, margin: "0 auto 16px" }}>
            {chunkFailed
              ? "Check your connection, then try again. A new game version may have arrived while this page was open."
              : "The game could not start. Try reloading, or check that your browser supports WebGL and hardware acceleration is enabled."}
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

  return (
    <ErrorBoundary>
      <div ref={ref} className="game-root" />
      {bannerId ? <div id={bannerId} className="portal-banner" aria-hidden="true" /> : null}
    </ErrorBoundary>
  );
}
