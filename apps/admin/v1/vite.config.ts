import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const LOCAL_SERVER = {
  port: 5173,
  strictPort: true,
  headers: { "Cross-Origin-Opener-Policy": "same-origin-allow-popups" },
  proxy: {
    "/api": {
      target: "http://127.0.0.1:4001",
      changeOrigin: false,
      xfwd: true,
    },
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: LOCAL_SERVER,
  preview: LOCAL_SERVER,
  build: { sourcemap: false },
});
