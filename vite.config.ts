import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget = process.env["QUIZ_API_PROXY_TARGET"] || "http://127.0.0.1:8081";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    target: "baseline-widely-available",
    rollupOptions: {
      output: {
        // React in a chunk of its own, and the reason is repeat visits rather
        // than the first one. Measured, gzipped: one chunk was 86.48 kB; with
        // the admin panel fetched on demand the entry is 84.82 kB, and with
        // React separated it is 16.81 kB beside React's 68.26 kB.
        //
        // The first load therefore gets very slightly worse — 85.07 kB across
        // two files against 84.82 kB in one, because gzip has less to work with
        // in each. What it buys is every load after a deploy: this app ships on
        // every push to main, and a returning reader then fetches 16.81 kB
        // instead of 84.82 kB, because React's chunk hash has not moved.
        //
        // scheduler comes along because react-dom depends on it and it is as
        // stable as React itself.
        manualChunks: (id: string) =>
          /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id) ? "react" : undefined
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/api": { target: apiProxyTarget, changeOrigin: true }
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4173
  }
});
