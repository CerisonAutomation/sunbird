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
//   VITE_PORTAL_TARGET=*   → portal build (always single-file: zips must be self-contained)
//   default                → chunked output (Vercel CDN, HTTP caching, PWA)
const PORTAL = (process.env.VITE_PORTAL_TARGET ?? "none").toLowerCase() || "none";
const VALID_PORTALS = ["none", "poki", "crazy", "crazygames", "generic"];
if (!VALID_PORTALS.includes(PORTAL)) {
  // Fail the build loudly — a typo'd portal target would silently ship a
  // build with the wrong SDK/monetization profile.
  throw new Error(`VITE_PORTAL_TARGET must be one of ${VALID_PORTALS.join("|")}, got "${PORTAL}"`);
}
const singleFile = process.env.VITE_SINGLEFILE === "true" || PORTAL !== "none";
const paymentAdapter = PORTAL !== "none" ? path.resolve(__dirname, "src/game/Payments.portal.ts") : undefined;

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
        return html.replace("<!-- BOOT_SUN -->", sunSVG({ size: 84, className: "boot-sun" }))
          .replace("<!-- BOOT_BIRD -->", sunbirdSVG({ width: 58, className: "boot-bird", animateWings: true }));
      },
    },
    react(),
    tailwindcss(),
    ...(singleFile ? [viteSingleFile()] : []),
    ...(singleFile ? [] : [copyrightBanner()]),
  ],
  server: {
    host: true,
    allowedHosts: true,
    // Real multiplayer: the browser talks to the SAME origin (/mp) and vite
    // tunnels it to the Rust room server (sunbird-server) listening on the
    // legacy `/ws` socket. No hardcoded hosts anywhere.
    proxy: {
      "/mp": {
        target: process.env.MULTIPLAYER_PROXY_TARGET || "http://127.0.0.1:8080",
        ws: true,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/mp/, "/ws"),
      },
      // Social server (friends/clubs/chat) — same pattern as /mp: the browser
      // talks same-origin, vite tunnels to the PGlite server on :8788.
      "/social": {
        target: process.env.SOCIAL_PROXY_TARGET || "http://127.0.0.1:8788",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/social/, ""),
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
                net: [
                  "./src/game/Realtime.ts",
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
