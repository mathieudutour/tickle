import { defineConfig } from "vite";

// The logic shared with the iOS app, as one script JavaScriptCore can evaluate (see src/native/core.ts).
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "ios/Tickle/Resources",
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: "src/native/core.ts",
      formats: ["iife"],
      name: "TickleCoreBundle",
      fileName: () => "core.js",
    },
  },
});
