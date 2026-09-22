import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { sunbirdSVG, sunSVG } from "./src/game/Sunbird";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Build modes:
//   VITE_SINGLEFILE=true   → inline all JS/CSS into index.html (itch.io + portal zips)
//   VITE_PORTAL_TARGET=poki → the portal build (single-file: the zip must be
//                              self-contained); "none" is the direct/web build.
//   default                → chunked output (Vercel CDN, HTTP caching, PWA)
const PORTAL = (process.env.VITE_PORTAL_TARGET ?? "none").toLowerCase() || "none";
const VALID_PORTALS = ["none", "poki"];
if (!VALID_PORTALS.includes(PORTAL)) {
  // Fail the build loudly — a typo'd portal target would silently ship a
  // build with the wrong SDK/monetization profile.
  throw new Error(`VITE_PORTAL_TARGET must be one of ${VALID_PORTALS.join("|")}, got "${PORTAL}"`);
}
const singleFile = process.env.VITE_SINGLEFILE === "true" || PORTAL !== "none";
const paymentAdapter = PORTAL !== "none" ? path.resolve(__dirname, "src/game/Payments.portal.ts") : undefined;

// Stub out non-target portal adapters at module resolution. Vite's
// resolve.alias matches import source strings, not resolved filesystem
// paths, so we register a tiny plugin that intercepts "./poki" /
// "./crazygames" relative imports from platform.ts and redirects them
// to _shim.ts when building for a different target. Without this the
// real adapter modules (with their "PokiSDK" / "shareableURL" method
// names / script URLs) end up in non-target bundles — inert, but flagged
// by portal scanners.
function portalShimPlugin(): Plugin {
  const shim = path.resolve(__dirname, "src/sdk/_shim.ts");
  return {
    name: "sunbird-portal-shim",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer) return null;
      // Match exactly the relative imports used by src/sdk/platform.ts (and
      // any other module under src/sdk) to pull in the portal adapters.
      // Using path-absolute comparison is robust against ./ vs no-ext etc.
      const base = path.basename(source);
      const dir = path.basename(path.dirname(importer));
      // Per-target edition strings (display name, portal-note, labels). Same
      // reasoning as the adapters: a shared ternary on the runtime portal name
      // embeds EVERY portal's name in EVERY bundle, and scanners flag a
      // competitor's name even in dead code. Each build gets exactly one file.
      if (base === "edition" || base === "edition.ts") {
        if (dir !== "game") return null;
        // One portal now: the Poki build gets the Poki strings, and the
        // direct/web build gets the neutral ones.
        return PORTAL === "poki" ? path.resolve(__dirname, "src/game/edition.poki.ts") : null;
      }
      // Per-target realtime transport. The Poki build must build a Netlib
      // (WebRTC P2P) client and every other edition must build the WebSocket
      // relay client; swapping the module keeps that decision out of shared
      // code, so no build can name — or bundle — another platform's transport.
      if (base === "net-transport" || base === "net-transport.ts") {
        if (dir !== "game") return null;
        return PORTAL === "poki" ? path.resolve(__dirname, "src/game/net-transport.poki.ts") : null;
      }
      if (dir !== "sdk") return null;
      if (base === "poki" || base === "poki.ts") {
        if (PORTAL !== "poki") return shim;
      }
      return null;
    },
  };
}

// Stamp the service worker cache key per build so each deploy busts stale caches.
const BUILD_ID = Date.now().toString(36);

// Stamp a short copyright notice onto every emitted chunk. Rollup's
// `output.banner` is not honoured through Vite's output pipeline (verified: it
// produced no notice at all), so do it explicitly. This is an honest legal
// notice plus a mild deterrent — it is NOT a substitute for real protection,
// which is not achievable for client-side JS.
function copyrightBanner(): Plugin {
  const notice =
    "/*! Sunbird \u00a9 Cerison. All rights reserved. Unauthorised copying, redistribution or resale is prohibited. */";
  return {
    name: "sunbird-copyright-banner",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === "chunk") file.code = `${notice}\n${file.code}`;
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // Relative base: portals (Poki GDN, CrazyGames CDN) serve builds from deep
  // subpaths — any absolute /asset URL 404s there. "./" works everywhere.
  base: "./",
  plugins: [
    {
      name: "sunbird-boot-mark",
      transformIndexHtml(html) {
        // Inline the SAME artwork as the menu before any JS or assets arrive.
        let out = html
          .replace("<!-- BOOT_SUN -->", sunSVG({ size: 84, className: "boot-sun" }))
          .replace("<!-- BOOT_BIRD -->", sunbirdSVG({ width: 58, className: "boot-bird", animateWings: true }));
        // Portal builds: strip the itch.io og:url meta so the bundle is
        // self-contained with no third-party host references. Inspector
        // scans the HTML; a stray meta pointing off-portal can trigger the
        // External Resources warning even though it's never fetched.
        if (PORTAL !== "none") {
          out = out.replace(/<meta\s+property=["']og:url["'][^>]*>/i, "");
          out = out.replace(/<link[^>]*rel=["'](?:preload|canonical|alternate)["'][^>]*href=["']https?:\/\/[^>]+>/gi, "");
        }
        return out;
      },
    },
    react(),
    tailwindcss(),
    portalShimPlugin(),
    ...(singleFile ? [viteSingleFile()] : []),
    ...(singleFile ? [] : [copyrightBanner()]),
  ],
  server: {
    host: true,
    allowedHosts: true,
    // Real multiplayer + social: the browser talks to the SAME origin and
    // vite tunnels to the Sunbird social server (server/, default :8791).
    // Identity paths: that server mounts legacy + v1 under /mp and the
    // legacy social REST under /social. No hardcoded hosts anywhere —
    // MULTIPLAYER_PROXY_TARGET / SOCIAL_PROXY_TARGET override per machine.
    proxy: {
      "/mp": {
        target: process.env.MULTIPLAYER_PROXY_TARGET || "http://127.0.0.1:8790",
        ws: true,
        changeOrigin: true,
      },
      "/social": {
        target: process.env.SOCIAL_PROXY_TARGET || "http://127.0.0.1:8790",
        changeOrigin: true,
      },
      // Global leaderboard & score-submission endpoints live at the social
      // server root. Proxy them so dev can hit the board without CORS fuss.
      "/board": {
        target: process.env.SOCIAL_PROXY_TARGET || "http://127.0.0.1:8790",
        changeOrigin: true,
      },
      "/score": {
        target: process.env.SOCIAL_PROXY_TARGET || "http://127.0.0.1:8790",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      ...(paymentAdapter ? { "./Payments": paymentAdapter } : {}),
    },
  },
  define: {
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(BUILD_ID),
    // Freeze the portal target to a compile-time constant so Rollup can
    // statically fold `TARGET === "poki"` / `TARGET === "crazy"` branches
    // and strip non-target SDK URLs / branches (e.g. Poki Netlib dynamic
    // import) from the output entirely.
    "import.meta.env.VITE_PORTAL_TARGET": JSON.stringify(PORTAL),
    // Inline SELL_AD_REMOVAL so Rollup/Terser DCEs IAP purchase UI from portal
    // builds (Poki REQ-20). Must stay in sync with edition.*.ts values.
    // NOTE: We define the bare identifier too (not just import.meta.env.*) so
    // Rollup replaces every reference in expressions before bundling. The
    // cross-module import form is not constant-folded by Rollup, leaving dead
    // strings ("Remove breaks", "No sponsored breaks") in the bundle.
    // preventAssignment:true (Vite default) means import/export bindings are
    // NOT replaced, only expression usages — so edition exports still compile.
    "import.meta.env.VITE_SELL_AD_REMOVAL": JSON.stringify(PORTAL === "none"),
  },
  build: {
    // Keep production bundles lean and avoid publishing source maps that
    // expose the original project structure to casual scrapers.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Portal/itch builds are inlined into a single HTML file by
        // vite-plugin-singlefile, so splitting there is pointless at best and
        // breaks the self-contained artefact at worst. Only the chunked
        // (Vercel/CDN) build gets a vendor split — three.js alone is the bulk
        // of the bundle, so isolating it lets app-only deploys reuse the
        // cached vendor chunk instead of re-downloading everything.
        ...(singleFile
          ? {}
          : {
              manualChunks: {
                three: ["three"],
                react: ["react", "react-dom"],
                audio: [
                  "./src/game/Audio.ts",
                  "./src/game/Music.ts",
                ],
                // Net bundle: only the WebSocket multiplayer transport and
                // MassRace (which consumes it). Deliberately excludes
                // src/sdk/platform.ts and src/game/PokiNetlib.ts so that
                // portal-specific code (Poki SDK strings, @poki/netlib)
                // stays in its own chunks and Rollup's DCE can strip the
                // unused adapter path for each build target.
                net: [
                  "./src/game/Realtime.ts",
                  "./src/game/PokiMpUtils.ts",
                  "./src/game/MassRace.ts",
                  "./src/game/GhostNet.ts",
                  "./src/game/bufferUpdates.ts",
                ],
                social: [
                  "./src/game/Leaderboard.ts",
                  "./src/game/Squad.ts",
                  "./src/game/Tournaments.ts",
                ],
              },
            }),
      },
    },
  },
});
