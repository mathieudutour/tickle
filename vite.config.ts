import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    // Runs the Worker and the space Durable Objects in the dev server, and builds them alongside the app.
    cloudflare(),
    // Offline support is for the app only, not the Worker build.
    ...VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon.png",
        "badge-96.png",
        "push-sw.js",
        "og.jpg",
      ],
      manifest: {
        name: "Tickle",
        short_name: "Tickle",
        description: "Tes rappels et tes listes, partagés en direct, avec des alertes à l’heure.",
        lang: "fr",
        start_url: "/",
        display: "standalone",
        background_color: "#f2f2f7",
        theme_color: "#f2f2f7",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // The space API is always live, never served from the offline cache.
        navigateFallbackDenylist: [/^\/api\//],
        // Illustrations too (about 15 KB each), so empty states look right offline.
        globPatterns: ["**/*.{js,css,html,webp}"],
        // Push notifications.
        importScripts: ["push-sw.js"],
      },
    }).map((plugin) => ({
      ...plugin,
      applyToEnvironment: (environment: { name: string }) => environment.name === "client",
    })),
  ],
});
