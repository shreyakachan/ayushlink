import { useEffect, useRef, useState } from "react"
import { patientT } from "../lib/patientI18n.js"
import { ashaT } from "../lib/ashaI18n.js"

/**
 * AyushLink — Emergency SOS
 * React + JavaScript + Tailwind CSS
 * Lets a health worker trigger an emergency alert to the nearest facility,
 * with hold-to-confirm safety, nearby facility list and live status.
 */

const NEARBY_FACILITIES = [
  { id: "F-1", name: "Chandapur Primary Health Centre", distance: "1.2 km", type: "PHC", eta: "6 min" },
  { id: "F-2", name: "Nandgaon Community Hospital", distance: "4.8 km", type: "Hospital", eta: "14 min" },
  { id: "F-3", name: "108 Ambulance Service", distance: "—", type: "Ambulance", eta: "9 min" },
]

const HOLD_DURATION = 1800

/* ---------- Inline icons (matches app's existing icon style) ---------- */
function BackIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  )
}
function SosIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  )
}
function HospitalIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 21V7l8-4 8 4v14" />
      <path d="M9 21v-4h6v4" />
      <path d="M12 8v4M10 10h4" />
    </svg>
  )
}
function AmbulanceIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 17V8a1 1 0 0 1 1-1h9l4 4h3a1 1 0 0 1 1 1v5" />
      <path d="M3 17h1m16 0h1" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
      <path d="M9 8v6M6 11h6" />
    </svg>
  )
}
function PhoneIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  )
}
function MapPinIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}
function CheckCircleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.2 2.2L16 9.8" />
    </svg>
  )
}
function XIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

const TYPE_ICON = {
  PHC: HospitalIcon,
  Hospital: HospitalIcon,
  Ambulance: AmbulanceIcon,
}

export default function EmergencySOSScreen({ lang = "en", onBack }) {
  const ashaTrans = ashaT(lang)
  const patientTrans = patientT(lang)
  const t = {
    ...patientTrans,
    ...(ashaTrans?.sos || {}),
    goBack: ashaTrans?.common?.goBack || patientTrans.goBack,
  }
  const [status, setStatus] = useState("idle") // idle | holding | sent
  const [progress, setProgress] = useState(0)
  const [sentTo, setSentTo] = useState(null)
  const holdStart = useRef(null)
  const rafId = useRef(null)

  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current)
    }
  }, [])

  const tick = () => {
    const elapsed = Date.now() - holdStart.current
    const pct = Math.min(100, (elapsed / HOLD_DURATION) * 100)
    setProgress(pct)
    if (pct >= 100) {
      setStatus("sent")
      setSentTo(NEARBY_FACILITIES[0])
      return
    }
    rafId.current = requestAnimationFrame(tick)
  }

  const startHold = () => {
    if (status === "sent") return
    setStatus("holding")
    holdStart.current = Date.now()
    rafId.current = requestAnimationFrame(tick)
  }

  const cancelHold = () => {
    if (status !== "holding") return
    if (rafId.current) cancelAnimationFrame(rafId.current)
    setStatus("idle")
    setProgress(0)
  }

  const reset = () => {
    setStatus("idle")
    setProgress(0)
    setSentTo(null)
  }

  const callFacility = (facility) => {
    setSentTo(facility)
    setStatus("sent")
  }

  return (
    <main className="min-h-dvh w-full bg-gradient-to-b from-red-50/60 via-white to-slate-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-red-100 bg-white/90 px-4 py-4 backdrop-blur">
          <button
            type="button"
            onClick={onBack}
            aria-label={t.goBack}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95"
          >
            <BackIcon className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600 shadow-lg shadow-red-600/25">
              <SosIcon className="h-5 w-5 text-white" />
            </span>
            <div>
              <h1 className="text-base font-bold leading-tight text-slate-800">{t.sosHeaderTitle}</h1>
              <p className="text-xs text-slate-500">{t.sosHeaderSub}</p>
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 px-4 py-6">
          {status !== "sent" ? (
            <>
              {/* Hold-to-send button */}
              <section className="flex flex-col items-center gap-4 rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
                <p className="text-sm font-medium text-slate-500">{t.sosHoldPrompt}</p>
                <button
                  type="button"
                  onPointerDown={startHold}
                  onPointerUp={cancelHold}
                  onPointerLeave={cancelHold}
                  aria-label={t.sosHoldPrompt}
                  className="relative flex h-40 w-40 items-center justify-center rounded-full bg-red-600 text-white shadow-xl shadow-red-600/30 transition active:scale-95 select-none touch-none"
                >
                  <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="6" />
                    <circle
                      cx="50"
                      cy="50"
                      r="46"
                      fill="none"
                      stroke="white"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 46}
                      strokeDashoffset={2 * Math.PI * 46 * (1 - progress / 100)}
                      style={{ transition: status === "holding" ? "none" : "stroke-dashoffset 0.2s ease-out" }}
                    />
                  </svg>
                  <span className="flex flex-col items-center gap-1">
                    <SosIcon className="h-10 w-10" />
                    <span className="text-sm font-bold uppercase tracking-wide">
                      {status === "holding" ? t.sosKeepHolding : t.sosHoldButton}
                    </span>
                  </span>
                </button>
                <p className="text-xs text-slate-400">{t.sosShareNote}</p>
              </section>

              {/* Nearby facilities */}
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{t.nearbyFacilitiesHeading}</h2>
                <ul className="flex flex-col gap-3">
                  {NEARBY_FACILITIES.map((f) => {
                    const Icon = TYPE_ICON[f.type] || HospitalIcon
                    return (
                      <li
                        key={f.id}
                        className="flex items-center gap-4 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm"
                      >
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                          <Icon className="h-6 w-6" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800">{f.name}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                            <MapPinIcon className="h-3.5 w-3.5" />
                            {f.distance} &middot; {t.etaLabel} {f.eta}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => callFacility(f)}
                          aria-label={`${t.callLabel} ${f.name}`}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100"
                        >
                          <PhoneIcon className="h-4.5 w-4.5" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            </>
          ) : (
            <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl border border-emerald-200 bg-emerald-50/60 p-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                <CheckCircleIcon className="h-8 w-8" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-800">{t.alertSentTitle}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {sentTo?.name} {t.alertSentNotified} {sentTo?.eta}.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  <XIcon className="h-4 w-4" />
                  {t.cancelAlert}
                </button>
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-red-600/25 transition hover:bg-red-700"
                >
                  {t.returnHome}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}
