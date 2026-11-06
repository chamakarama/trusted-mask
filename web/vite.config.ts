import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Public planner build: only index.html is an entry. public/ holds nothing but synced, hash-verified release
// members and the contract schema (see scripts/sync-release.mjs). The operator view has its own config and is
// never part of this build.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
  server: { port: 5173, strictPort: false },
});
