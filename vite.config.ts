import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // la bibliothèque PDF (~1,2 Mo) n'est chargée qu'à la génération d'un document dans l'administration
    chunkSizeWarningLimit: 1600,
  },
  test: {
    include: ["src/**/*.test.ts", "netlify/**/*.test.ts"],
  },
} as never);
