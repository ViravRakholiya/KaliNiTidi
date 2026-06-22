import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build output goes to app/client/dist, which the Node/Express server serves in
// production. In dev, proxy the realtime + API endpoints to the game server so
// `npm run dev` works against a locally running backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/socket.io": { target: "http://localhost:3000", ws: true },
      "/health": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
