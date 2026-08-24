import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget = process.env.QUIZ_API_PROXY_TARGET || "http://127.0.0.1:8081";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    target: "baseline-widely-available"
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/api": { target: apiProxyTarget, changeOrigin: true },
      "/actuator": { target: apiProxyTarget, changeOrigin: true }
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4173
  }
});
