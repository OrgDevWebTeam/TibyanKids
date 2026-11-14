import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: /^@noor\/contracts\/(.*)$/,
        replacement: fromHere("../../packages/contracts/src/") + "$1",
      },
      {
        find: /^@noor\/contracts$/,
        replacement: fromHere("../../packages/contracts/src/index.ts"),
      },
      { find: /^@\/(.*)$/, replacement: fromHere("./src/") + "$1" },
    ],
  },
  server: {
    port: 3000,
    proxy: {
      // Same-origin API calls in development, so no CORS setup is needed locally. The API
      // (apps/api) listens on PORT, 5000 by default.
      "/api": "http://127.0.0.1:5000",
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
