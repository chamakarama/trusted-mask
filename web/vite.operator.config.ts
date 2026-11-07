import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// PRIVATE operator workbench. Separate entry point and separate static directory (operator-public/, git-ignored),
// so the scanner inventory never enters the public planner build (vite.config.ts builds index.html from public/).
export default defineConfig({
  plugins: [react()],
  base: "./",
  publicDir: false,
  build: { outDir: "dist-operator", emptyOutDir: true, rollupOptions: { input: "operator.html" } },
  server: { port: 5174, strictPort: false, open: "/operator.html" },
});
