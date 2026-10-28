import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    // Two independent entry points: index.html is the full studio (Electron
    // app / internal use), customize.html is the lean customer-facing
    // editor (CustomerEditor.tsx only — never imports Studio.tsx, so none
    // of the full studio's UI/code ships in that bundle).
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        customize: path.resolve(__dirname, "customize.html"),
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
