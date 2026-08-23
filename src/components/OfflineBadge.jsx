import { useEffect, useState } from "react"
import useOnlineStatus from "../hooks/useOnlineStatus.js"
import { patientT } from "../lib/patientI18n.js"
import { ashaT } from "../lib/ashaI18n.js"

/**
 * Fixed, app-wide "Offline Mode" badge.
 * Appears the moment the browser loses network connectivity, and briefly
 * shows a "Back online" confirmation when connectivity returns.
 * Rendered once at the App root so it floats above whichever screen is active.
 *
 * `lang` localizes the badge text for the patient side & ASHA worker console.
 */
export default function OfflineBadge({ lang = "en" }) {
  const isOnline = useOnlineStatus()
  const [showReconnected, setShowReconnected] = useState(false)
  const [wasOffline, setWasOffline] = useState(false)
  const pTrans = patientT(lang)
  const aTrans = ashaT(lang)
  const t = {
    ...pTrans,
    ...(aTrans?.common || {}),
  }

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true)
      setShowReconnected(false)
      return
    }
    if (isOnline && wasOffline) {
      setShowReconnected(true)
      const timer = setTimeout(() => {
        setShowReconnected(false)
        setWasOffline(false)
      }, 2500)
      return () => clearTimeout(timer)
    }
  }, [isOnline, wasOffline])

  if (isOnline && !showReconnected) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[100] flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
    >
      <div
        className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur transition
          ${
            showReconnected
              ? "border-emerald-200 bg-emerald-600/95 text-white"
              : "border-amber-200 bg-amber-500/95 text-white"
          }`}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
          {showReconnected ? <WifiIcon className="h-3.5 w-3.5" /> : <OfflineIcon className="h-3.5 w-3.5" />}
        </span>
        {showReconnected ? t.backOnlineBadge : t.offlineModeBadge}
      </div>
    </div>
  )
}

function WifiIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <path d="M12 20h.01" />
    </svg>
  )
}

function OfflineIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <path d="M12 20h.01" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M19 12.55a10.94 10.94 0 0 0-2.28-1.94" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M22.58 9a15.91 15.91 0 0 0-9.44-4.94" />
      <path d="M2 2l20 20" />
    </svg>
  )
}
