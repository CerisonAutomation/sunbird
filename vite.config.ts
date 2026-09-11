import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  server: {
    host: true,
    allowedHosts: true,
    // Real multiplayer: the browser talks to the SAME origin (/mp) and vite
    // tunnels it to the Workers room server. No hardcoded hosts anywhere.
    proxy: {
      "/mp": {
        target: "http://localhost:8787",
        ws: true,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/mp/, ""),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
