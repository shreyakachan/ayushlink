import { useEffect, useRef, useState } from "react"
import { patientT } from "../lib/patientI18n.js"
import { sendEmergencySOS, getAuthUser } from "../lib/api.js"
import { buildEmergencyPacket, simulateTransmission, LORA_STAGES } from "../lib/loraSimulator.js"

/**
 * AyushLink — Emergency SOS (Software-Only LoRa Emergency Flow)
 * React + Tailwind CSS
 *
 * Simulates end-to-end LoRa Emergency response for rural patients:
 * 1. Hold-to-confirm safety trigger
 * 2. Authenticated emergency creation via POST /api/emergency/sos
 * 3. Compact simulated 865MHz LoRa packet assembly with CRC16 checksum
 * 4. Simulated RF propagation to village Gateway node
 * 5. Downlink Gateway ACK & real-time ASHA/PHC dispatch notification
 */

const NEARBY_FACILITIES = [
  { id: "F-1", name: "Chandapur Primary Health Centre", distance: "1.2 km", type: "PHC", eta: "6 min", phone: "108" },
  { id: "F-2", name: "Nandgaon Community Hospital", distance: "4.8 km", type: "Hospital", eta: "14 min", phone: "108" },
  { id: "F-3", name: "108 Emergency Ambulance", distance: "—", type: "Ambulance", eta: "8 min", phone: "108" },
]

const HOLD_DURATION = 5000

/* ---------- Inline Icons ---------- */
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
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  )
}

function RadioTowerIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
      <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
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

function AlertTriangleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function SpinnerIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

const TYPE_ICON = {
  PHC: HospitalIcon,
  Hospital: HospitalIcon,
  Ambulance: AmbulanceIcon,
}

export default function EmergencySOSScreen({ lang = "en", onBack }) {
  const t = patientT(lang)

  // Screen status: "idle" | "holding" | "transmitting" | "sent" | "error"
  const [status, setStatus] = useState("idle")
  const [progress, setProgress] = useState(0)
  const [currentStage, setCurrentStage] = useState(null)
  const [stageMessage, setStageMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState(null)
  const [emergencyResult, setEmergencyResult] = useState(null)
  const [ackResult, setAckResult] = useState(null)

  const holdStart = useRef(null)
  const rafId = useRef(null)
  const isExecutingRef = useRef(false)

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current)
    }
  }, [])

  /**
   * Execute Real Software LoRa Emergency Flow:
   * 1. Check connectivity
   * 2. POST /api/emergency/sos (auth patient)
   * 3. Assemble simulated LoRa packet + CRC16
   * 4. simulateTransmission() -> POST /api/lora/gateway/packet
   * 5. Verify Gateway ACK & display confirmation
   */
  const executeEmergencySos = async () => {
    if (isExecutingRef.current) return
    isExecutingRef.current = true

    setStatus("transmitting")
    setErrorMessage(null)
    setCurrentStage(LORA_STAGES.PREPARING)
    setStageMessage(t.sosStagePreparingText || "Preparing emergency signal & checksum...")

    try {
      // 1. Trigger Authoritative Emergency Alert via Backend API
      const authUser = getAuthUser()
      const payload = {
        emergency_type: "general_sos",
        emergency_notes: "Emergency SOS triggered by patient from AyushLink PWA",
        gps_coordinates: { lat: 19.9975, lng: 73.7898 },
        simulated_telemetry: {
          frequency: "865.2 MHz (IN865 Band - SIMULATED)",
          spreading_factor: "SF10 (SIMULATED)",
          bandwidth: "125 kHz (SIMULATED)",
        },
      }

      const sosResponse = await sendEmergencySOS(payload)
      setEmergencyResult(sosResponse)

      // 2. Construct Software-simulated LoRa RF packet
      const packet = buildEmergencyPacket({
        alert_id: sosResponse.alert_id,
        patient_id: sosResponse.patient_id,
        village: sosResponse.village,
        emergency_type: sosResponse.emergency_type,
      })

      // 3. Simulate LoRa transmission with live stage tracking
      const ack = await simulateTransmission(packet, (prog) => {
        setCurrentStage(prog.stage)
        if (prog.stage === LORA_STAGES.PREPARING) {
          setStageMessage(t.sosStagePreparingText || prog.message)
        } else if (prog.stage === LORA_STAGES.TRANSMITTING) {
          setStageMessage(t.sosStageTransmittingText || prog.message)
        } else if (prog.stage === LORA_STAGES.RECEIVING) {
          setStageMessage(t.sosStageReceivingText || prog.message)
        } else if (prog.stage === LORA_STAGES.ACK) {
          setStageMessage(t.sosStageAckText || prog.message)
        }
      })

      // 4. Verify Downlink ACK
      if (ack && (ack.ack === true || ack.dispatch_ticket_id)) {
        setAckResult(ack)
        setStatus("sent")
      } else {
        throw new Error("Gateway acknowledgment was rejected or invalid.")
      }
    } catch (err) {
      console.error("[EmergencySOSScreen] Error during SOS transmission:", err)
      setStatus("error")
      let msg = err.message || "Failed to transmit emergency signal. Please retry or call directly."
      if (err.status === 401 || err.status === 403) {
        msg = "Authentication expired. Please sign in to verify patient identity."
      } else if (err.isOffline || (err.message && err.message.includes("offline"))) {
        msg = t.sosOfflineError || "Emergency service requires a connection to the AyushLink server."
      }
      setErrorMessage(msg)
    } finally {
      isExecutingRef.current = false
    }
  }

  // Hold-to-confirm safety timer (5.0 seconds required)
  const tick = () => {
    if (!holdStart.current) return
    const elapsed = Date.now() - holdStart.current
    const pct = Math.min(100, (elapsed / HOLD_DURATION) * 100)
    setProgress(pct)
    if (pct >= 100) {
      if (rafId.current) cancelAnimationFrame(rafId.current)
      holdStart.current = null
      executeEmergencySos()
      return
    }
    rafId.current = requestAnimationFrame(tick)
  }

  const startHold = (e) => {
    if (e && e.button !== undefined && e.button !== 0) return
    if (status === "transmitting" || status === "sent" || isExecutingRef.current) return
    setStatus("holding")
    setProgress(0)
    holdStart.current = Date.now()
    rafId.current = requestAnimationFrame(tick)
  }

  const cancelHold = () => {
    if (status !== "holding") return
    if (rafId.current) cancelAnimationFrame(rafId.current)
    holdStart.current = null
    setStatus("idle")
    setProgress(0)
  }

  const reset = () => {
    setStatus("idle")
    setProgress(0)
    setCurrentStage(null)
    setErrorMessage(null)
    setEmergencyResult(null)
    setAckResult(null)
    isExecutingRef.current = false
  }

  return (
    <main className="min-h-dvh w-full bg-gradient-to-b from-red-50/70 via-white to-slate-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-red-100 bg-white/95 px-4 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              disabled={status === "transmitting"}
              aria-label={t.goBack || "Go Back"}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95 disabled:opacity-50"
            >
              <BackIcon className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600 shadow-md shadow-red-600/30">
                <SosIcon className="h-5 w-5 text-white" />
              </span>
              <div>
                <h1 className="text-base font-bold leading-tight text-slate-800">{t.sosHeaderTitle || "Emergency SOS"}</h1>
                <p className="text-xs text-slate-500">{t.sosHeaderSub || "Alert the nearest facility instantly"}</p>
              </div>
            </div>
          </div>

          {/* Software Simulation Badge */}
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100/80 px-2.5 py-1 text-[11px] font-semibold text-red-700">
            <RadioTowerIcon className="h-3.5 w-3.5" />
            IN865 LoRa
          </span>
        </header>

        <div className="flex flex-1 flex-col gap-6 px-4 py-6">
          {/* STATE: IDLE, HOLDING & SENT (SAME SOS SCREEN) */}
          {status !== "transmitting" && status !== "error" && (
            <>
              {/* Hold-to-send / Sent confirmation button */}
              <section className="flex flex-col items-center gap-4 rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
                <p className={`text-sm font-medium ${status === "sent" ? "text-emerald-700 font-bold" : "text-slate-500"}`}>
                  {status === "sent"
                    ? (t.sosSentConfirmation || "Emergency alert sent successfully. ASHA has been notified.")
                    : status === "holding"
                    ? `${t.sosKeepHolding || "Hold for 5 seconds..."} (${Math.max(1, Math.ceil((5000 - (progress * 50)) / 1000))}s)`
                    : (t.sosHoldPrompt || "Press and hold the button for 5 seconds to send an emergency SOS")}
                </p>

                {status === "sent" ? (
                  /* Sent State: Non-clickable clear confirmation */
                  <div
                    aria-label={t.sosSentButton || "✓ SOS SENT"}
                    className="relative flex h-48 w-48 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl shadow-emerald-600/35 select-none"
                  >
                    <span className="flex flex-col items-center gap-1.5 pointer-events-none">
                      <CheckCircleIcon className="h-12 w-12 text-white" />
                      <span className="text-base font-extrabold uppercase tracking-wide">
                        {t.sosSentButton || "✓ SOS SENT"}
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-100 uppercase tracking-wider">
                        {t.sosSentSubTitle || "ASHA NOTIFIED"}
                      </span>
                    </span>
                  </div>
                ) : (
                  /* Idle / Holding State */
                  <button
                    type="button"
                    onPointerDown={startHold}
                    onPointerUp={cancelHold}
                    onPointerLeave={cancelHold}
                    onPointerCancel={cancelHold}
                    onContextMenu={(e) => e.preventDefault()}
                    aria-label={t.sosHoldPrompt || "Hold for 5 seconds"}
                    className="relative flex h-48 w-48 items-center justify-center rounded-full bg-red-600 text-white shadow-xl shadow-red-600/35 transition active:scale-95 select-none touch-none"
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
                        style={{ transition: status === "holding" ? "none" : "stroke-dashoffset 0.15s ease-out" }}
                      />
                    </svg>
                    <span className="flex flex-col items-center gap-1.5 pointer-events-none">
                      <SosIcon className="h-11 w-11" />
                      <span className="text-sm font-extrabold uppercase tracking-wide">
                        {status === "holding"
                          ? `${Math.max(1, Math.ceil((5000 - (progress * 50)) / 1000))}s`
                          : t.sosHoldButton || "HOLD FOR 5 SECONDS"}
                      </span>
                      <span className="text-[10px] font-semibold text-red-100 uppercase">
                        {status === "holding" ? (t.sosKeepHolding || "HOLDING...") : "5 SECONDS"}
                      </span>
                    </span>
                  </button>
                )}

                {status === "holding" && (
                  <div className="w-48 bg-red-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-red-600 h-2.5 rounded-full transition-all duration-75"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}

                <p className="text-xs text-slate-400">
                  {status === "sent"
                    ? (t.sosSentSub || "Responders have received your location and medical context.")
                    : (t.sosShareNote || "Release at any time before 5 seconds to cancel.")}
                </p>
              </section>

              {/* Nearby facilities */}
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {t.nearbyFacilitiesHeading || "Nearby facilities"}
                </h2>
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
                            {f.distance} &middot; {t.etaLabel || "ETA"} {f.eta}
                          </p>
                        </div>
                        <a
                          href={`tel:${f.phone}`}
                          aria-label={`${t.callLabel || "Call"} ${f.name}`}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100"
                        >
                          <PhoneIcon className="h-4.5 w-4.5" />
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </section>
            </>
          )}

          {/* STATE 2: TRANSMITTING (SIMULATION IN PROGRESS) */}
          {status === "transmitting" && (
            <section className="flex flex-1 flex-col items-center justify-center gap-6 rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-red-50 text-red-600">
                <SpinnerIcon className="h-12 w-12 animate-spin text-red-600" />
                <span className="absolute">
                  <RadioTowerIcon className="h-6 w-6 text-red-600" />
                </span>
              </div>

              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  {t.sosRequestInProgress || "Emergency request in progress..."}
                </h2>
                <p className="mt-2 text-sm font-medium text-red-600">
                  {stageMessage}
                </p>
              </div>

              {/* Progress Stage Tracker */}
              <div className="w-full max-w-sm rounded-2xl bg-slate-50 p-4 text-left">
                <div className="space-y-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full ${currentStage ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                      ✓
                    </span>
                    <span className="font-medium text-slate-700">1. {t.sosStepRegistered || "Emergency registered in AyushLink"}</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full ${currentStage && currentStage !== LORA_STAGES.PREPARING ? "bg-emerald-600 text-white" : "bg-red-100 text-red-700 animate-pulse"}`}>
                      {currentStage && currentStage !== LORA_STAGES.PREPARING ? "✓" : "•"}
                    </span>
                    <span className="font-medium text-slate-700">2. {t.sosStepTransmitted || "Simulated IN865 packet transmitted"}</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full ${currentStage === LORA_STAGES.RECEIVING || currentStage === LORA_STAGES.ACK ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                      {currentStage === LORA_STAGES.RECEIVING || currentStage === LORA_STAGES.ACK ? "✓" : "•"}
                    </span>
                    <span className="font-medium text-slate-700">3. {t.sosStepGatewayReceived || "Village Gateway received & verified"}</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full ${currentStage === LORA_STAGES.ACK ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                      {currentStage === LORA_STAGES.ACK ? "✓" : "•"}
                    </span>
                    <span className="font-medium text-slate-700">4. {t.sosStepNotified || "ASHA worker & Medical Officer notified"}</span>
                  </div>
                </div>
              </div>

              <span className="text-[11px] font-medium text-slate-400">
                {t.sosSimulationBadge || "Software-Only LoRa Simulation (IN865 Band)"}
              </span>
            </section>
          )}

          {/* STATE 4: ERROR / RETRY */}
          {status === "error" && (
            <section className="flex flex-1 flex-col items-center justify-center gap-5 rounded-3xl border border-rose-200 bg-rose-50/60 p-6 sm:p-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                <AlertTriangleIcon className="h-9 w-9" />
              </span>

              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  {t.emergencyErrorTitle || "Emergency Alert Failed"}
                </h2>
                <p className="mt-1 text-sm text-slate-600 max-w-sm">
                  {errorMessage || "Unable to reach AyushLink emergency gateway. Please retry or call emergency services directly."}
                </p>
              </div>

              <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={executeEmergencySos}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-600/25 transition hover:bg-red-700"
                >
                  <RadioTowerIcon className="h-4.5 w-4.5" />
                  {t.sosRetry || "Retry SOS"}
                </button>
                <a
                  href="tel:108"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-6 py-3.5 text-sm font-bold text-red-600 transition hover:bg-red-50"
                >
                  <PhoneIcon className="h-4.5 w-4.5" />
                  {t.callLabel || "Call"} 108
                </a>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  {t.cancelAlert || "Cancel"}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}
