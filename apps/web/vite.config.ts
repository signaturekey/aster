import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "browser-runtime-boundary",
      generateBundle() {
        const forbidden = Array.from(this.getModuleIds()).filter((id) =>
          /(?:\/apps\/api\/|\/node_modules\/(?:elysia|kysely|pg|pg-pool|pg-protocol|pg-types)\/|^node:|^bun:)/.test(
            id,
          ),
        );
        if (forbidden.length)
          this.error(
            `Server runtime entered browser bundle: ${forbidden.join(", ")}`,
          );
      },
    },
  ],
  resolve: {
    alias: { "@web": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    proxy: {
      // Preserve the browser Origin so the API can enforce its configured trust boundary.
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3000",
        changeOrigin: false,
      },
      "/health": {
        target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3000",
        changeOrigin: false,
      },
    },
  },
});
