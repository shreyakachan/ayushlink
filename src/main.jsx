import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App.jsx"
import ErrorBoundary from "./components/ErrorBoundary.jsx"
import "./index.css"

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// In development, unregister any active Service Workers and clear caches so
// Vite HMR and dynamic module updates work instantly without stale cache / blank screens.
if (import.meta.env.DEV) {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().catch(() => {})
      }
    }).catch(() => {})
  }
  if ("caches" in window) {
    caches.keys().then((keys) => {
      for (const key of keys) {
        caches.delete(key).catch(() => {})
      }
    }).catch(() => {})
  }
} else if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // Register the PWA service worker in production builds only
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({ immediate: true })
    })
    .catch(() => {})
}
