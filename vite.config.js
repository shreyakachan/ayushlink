import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false, // we register the SW ourselves in main.jsx
      includeAssets: [
        "icon.svg",
        "apple-touch-icon.png",
        "icon-light-32x32.png",
        "icon-dark-32x32.png",
      ],
      manifest: {
        name: "AyushLink",
        short_name: "AyushLink",
        description: "Healthcare that works even without the Internet.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0d9488",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the full built app shell: JS/CSS bundles, HTML, fonts, and images
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,jpeg,woff,woff2}"],
        // Make sure navigations always resolve to the cached shell when offline
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Any same-origin image not already precached
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: {
        // Disabled in development to prevent stale caching, HMR disruption, and blank-page issues on refresh
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    strictPort: false,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    },
    hmr: {
      overlay: true,
    },
    watch: {
      ignored: [
        "**/backend/**",
        "**/.git/**",
        "**/dist/**",
        "**/node_modules/**",
        "**/.vscode/**",
      ],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
})
