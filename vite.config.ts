import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run)[\\/]/.test(id)) return "vendor-react";
          if (/node_modules[\\/]@supabase[\\/]/.test(id)) return "vendor-supabase";
          if (/node_modules[\\/]@tanstack[\\/]/.test(id)) return "vendor-query";
          if (/node_modules[\\/]@radix-ui[\\/]/.test(id)) return "vendor-radix";
          if (/node_modules[\\/](date-fns|date-fns-tz)[\\/]/.test(id)) return "vendor-date";
          return undefined;
        },
      },
    },
  },
}));
