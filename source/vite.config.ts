import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";


export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          'react-vendor': ['react', 'react-dom', 'wouter'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select'],
          'pdf-vendor': ['pdfjs-dist', '@react-pdf-viewer/core', '@react-pdf-viewer/default-layout'],
          'mammoth': ['mammoth'],
          'ai-vendor': ['openai', '@anthropic-ai/sdk'],
        },
      },
    },
    chunkSizeWarningLimit: 1000, // Increase limit to 1MB (current bundle is ~2MB, will optimize with lazy loading)
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
