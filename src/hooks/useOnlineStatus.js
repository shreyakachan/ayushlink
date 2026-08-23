import { useEffect, useState } from "react"

/**
 * Tracks the browser's real network connectivity via the online/offline
 * events and navigator.onLine. This reflects actual network reachability
 * (not a mocked toggle), so it works the same everywhere in the app.
 */
export default function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  )

  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)

    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)

    return () => {
      window.removeEventListener("online", goOnline)
      window.removeEventListener("offline", goOffline)
    }
  }, [])

  return isOnline
}
