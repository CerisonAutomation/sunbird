import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Build mode:
//   VITE_SINGLEFILE=true  → inline all assets into a single HTML (itch.io upload)
//   default               → normal chunked output (Vercel CDN, PWA caching)
const singleFile = process.env.VITE_SINGLEFILE === "true";

// Stamp the service worker cache key at build time so each deploy busts stale caches.
const BUILD_ID = Date.now().toString(36);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(singleFile ? [viteSingleFile()] : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  define: {
    // Injected into sw.js via replace at build time (sw.js is not bundled by Vite,
    // so we expose the value for the Vite copy-public step via the env variable too).
    __SW_BUILD_ID__: JSON.stringify(BUILD_ID),
    // Expose to app code for display in debug overlays, if needed.
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(BUILD_ID),
  },
});
