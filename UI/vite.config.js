// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy /api requests to our Express backend during development.
    // This avoids CORS issues during development.
    // In production, use nginx or a reverse proxy.
    proxy: {
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
      },
    },
  },
});
