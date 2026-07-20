import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Lab is a static SPA. In production it deploys to its own Vercel project and
// `/api/lab/*` is rewritten to the Cloud Run server (see vercel.json). In dev we proxy
// the same paths to a locally running apps/server so relative fetches work unchanged —
// the app never needs to know an absolute API host.
const SERVER = process.env.LAB_API_ORIGIN || "http://localhost:4100";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4200,
    proxy: {
      "/api/lab": { target: SERVER, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
