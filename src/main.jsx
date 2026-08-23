import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { registerSW } from "virtual:pwa-register"
import App from "./App.jsx"
import "./index.css"

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register the service worker that precaches the app shell (HTML, JS, CSS,
// icons) so AyushLink loads instantly and works with no network connection.
// `autoUpdate` means a new build is fetched quietly in the background and
// swapped in on the next load — no user prompt needed.
if ("serviceWorker" in navigator) {
  registerSW({ immediate: true })
}
