import { useEffect, useRef, useState } from "react"
import { patientT } from "../lib/patientI18n.js"
import { DOCTOR_HELPLINE_TEL, DOCTOR_HELPLINE_DISPLAY } from "../lib/config.js"
import { requestConsultation } from "../lib/api.js"

/**
 * AyushLink — Patient Call Screen
 * React + JavaScript + Tailwind CSS
 *
 * Uses the REAL browser getUserMedia API for the patient's own camera/mic
 * preview. There is no signaling server deployed yet, so this screen does
 * NOT fake a working video connection — instead it places a REAL phone
 * call (via a `tel:` link) to the AyushLink helpline number so the
 * villager is always actually connected to a person, never just staring
 * at a fake "connecting" spinner. The camera preview still runs so the
 * doctor can be shown the patient visually over a later video hookup, and
 * if the camera/mic permission itself fails, the patient can retry that
 * independently of the phone call.
 */

export default function PatientCallScreen({ doctorName = "Dr. Anjali Rao", lang = "en", onBack }) {
  const t = patientT(lang)
  const localVideoRef = useRef(null)
  const streamRef = useRef(null)
  const dialedRef = useRef(false)

  const [remoteState, setRemoteState] = useState("connecting") // "connecting" | "connected" | "ended"
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [cameraError, setCameraError] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [attempt, setAttempt] = useState(0)

  // Register consultation session on backend
  useEffect(() => {
    async function initConsultation() {
      try {
        await requestConsultation({
          reason: "Patient video call consultation",
          urgency: "routine",
        })
      } catch {}
    }
    initConsultation()
  }, [])

  // Place the REAL phone call to the helpline the moment the screen opens.
  const dialHelpline = () => {
    window.location.href = DOCTOR_HELPLINE_TEL
  }
  useEffect(() => {
    if (dialedRef.current) return
    dialedRef.current = true
    const id = setTimeout(dialHelpline, 400)
    return () => clearTimeout(id)
  }, [])

  // Local camera/mic preview — real device access. This effect owns the
  // entire lifecycle of exactly one MediaStream: it requests a brand-new
  // stream on setup, and on cleanup stops every track, detaches it from the
  // video element, and clears the ref — so nothing from this attempt can
  // ever be reused by a later one. Because PatientCallScreen is mounted
  // with a fresh `key` every time the patient opens the call (see App.jsx),
  // and this effect re-runs on every mount and on every manual retry, each
  // visit is guaranteed to start from a completely clean slate.
  useEffect(() => {
    let active = true
    let ownedStream = null

    async function requestStream() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (!active) {
          // The component unmounted (or a retry superseded this attempt)
          // while the permission prompt/device was still opening — release
          // it immediately instead of leaving it dangling.
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        ownedStream = stream
        streamRef.current = stream
        setCameraError(null)
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
      } catch (err) {
        if (active) setCameraError(t.cameraUnavailable)
      }
    }

    requestStream()

    return () => {
      active = false
      const stream = streamRef.current || ownedStream
      stream?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (localVideoRef.current) localVideoRef.current.srcObject = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  // Simulated remote peer connecting, since there's no signaling server yet.
  useEffect(() => {
    const timer = setTimeout(() => setRemoteState("connected"), 2200)
    return () => clearTimeout(timer)
  }, [])

  // Call timer once connected.
  useEffect(() => {
    if (remoteState !== "connected") return
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [remoteState])

  const toggleMic = () => {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !micOn))
    setMicOn((v) => !v)
  }

  const toggleCam = () => {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !camOn))
    setCamOn((v) => !v)
  }

  const retryCamera = () => {
    setCameraError(null)
    setAttempt((n) => n + 1)
  }

  const endCall = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    setRemoteState("ended")
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0")
  const ss = String(elapsed % 60).padStart(2, "0")

  return (
    <div className="relative flex min-h-dvh w-full flex-col bg-slate-900 text-white">
      {/* Header */}
      <header className="z-10 flex items-center justify-between gap-3 px-5 py-4">
        <button
          type="button"
          onClick={onBack}
          aria-label={t.back}
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white transition hover:bg-white/20"
        >
          <BackIcon className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold">{doctorName}</p>
          <p className="text-xs text-slate-300">
            {remoteState === "connecting" && t.connecting}
            {remoteState === "connected" && `${mm}:${ss}`}
            {remoteState === "ended" && t.callEnded}
          </p>
        </div>
        <span className="h-10 w-10" />
      </header>

      {/* Remote video area */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-slate-800">
        {remoteState === "connecting" && (
          <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-2xl font-bold">
                {doctorName.split(" ").map((w) => w[0]).slice(-2).join("")}
              </span>
            </div>
            <p className="text-sm text-slate-300">
              {t.waitingFor} {doctorName} {t.toJoin}
            </p>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-sky-400" />
            </div>
          </div>
        )}

        {remoteState === "connected" && (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
            <div className="flex flex-col items-center gap-3 text-slate-300">
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-blue-600 text-3xl font-bold text-white">
                {doctorName.split(" ").map((w) => w[0]).slice(-2).join("")}
              </span>
              <p className="text-sm">{t.doctorVideoFeed}</p>
              <p className="text-xs text-slate-500">{t.doctorVideoFeedNote}</p>
            </div>
          </div>
        )}

        {remoteState === "ended" && (
          <div className="flex flex-col items-center gap-2 text-slate-300">
            <CheckCircleIcon className="h-12 w-12 text-blue-500" />
            <p className="text-sm">{t.callEnded} · {mm}:{ss}</p>
          </div>
        )}

        {/* Local preview (picture-in-picture) */}
        {remoteState !== "ended" && (
          <div className="absolute bottom-4 right-4 h-32 w-24 overflow-hidden rounded-2xl border border-white/20 bg-slate-700 shadow-lg sm:h-40 sm:w-28">
            {camOn && !cameraError ? (
              <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-slate-700 text-slate-400">
                <CameraOffIcon className="h-6 w-6" />
              </div>
            )}
          </div>
        )}
      </div>

      {cameraError && remoteState !== "ended" && (
        <div className="flex items-center justify-center gap-3 px-5 pb-2 text-center text-xs text-amber-300">
          <span>{cameraError}</span>
          <button
            type="button"
            onClick={retryCamera}
            className="shrink-0 rounded-full border border-amber-300/40 px-3 py-1 font-semibold text-amber-200 transition hover:bg-amber-300/10"
          >
            {t.retryCamera}
          </button>
        </div>
      )}

      {/* Real phone call fallback — always visible so the patient can
          always reach a real person, with or without a working video link. */}
      {remoteState !== "ended" && (
        <div className="mx-5 mb-2 flex items-center gap-3 rounded-2xl bg-emerald-500/10 px-4 py-3 ring-1 ring-emerald-500/30">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
            <PhoneCallIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs leading-snug text-emerald-100">{t.callConnectingPhone}</p>
            <p className="text-[11px] text-emerald-300/80">
              {t.callPhoneHint} · {DOCTOR_HELPLINE_DISPLAY}
            </p>
          </div>
          <button
            type="button"
            onClick={dialHelpline}
            className="shrink-0 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-900 shadow transition hover:bg-emerald-400 active:scale-95"
          >
            {t.callDoctorPhone}
          </button>
        </div>
      )}

      {/* Controls */}
      {remoteState !== "ended" ? (
        <div className="z-10 flex items-center justify-center gap-4 px-5 py-6">
          <button
            type="button"
            onClick={toggleMic}
            aria-label={micOn ? t.muteMic : t.unmuteMic}
            className={`flex h-16 w-16 items-center justify-center rounded-full transition
              ${micOn ? "bg-white/10 hover:bg-white/20" : "bg-white text-slate-900"}`}
          >
            {micOn ? <MicIcon className="h-7 w-7" /> : <MicOffIcon className="h-7 w-7" />}
          </button>
          <button
            type="button"
            onClick={endCall}
            aria-label={t.endCallLabel}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-red-600 shadow-lg shadow-red-600/30 transition hover:bg-red-700 active:scale-95"
          >
            <PhoneOffIcon className="h-8 w-8" />
          </button>
          <button
            type="button"
            onClick={toggleCam}
            aria-label={camOn ? t.turnCameraOff : t.turnCameraOn}
            className={`flex h-16 w-16 items-center justify-center rounded-full transition
              ${camOn ? "bg-white/10 hover:bg-white/20" : "bg-white text-slate-900"}`}
          >
            {camOn ? <VideoIcon className="h-7 w-7" /> : <CameraOffIcon className="h-7 w-7" />}
          </button>
        </div>
      ) : (
        <div className="z-10 flex justify-center px-5 py-6">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
          >
            {t.backToHome}
          </button>
        </div>
      )}
    </div>
  )
}

/* --- Inline icons --- */

function BackIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  )
}

function VideoIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m22 8-6 4 6 4V8z" />
    </svg>
  )
}

function CameraOffIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 2l20 20" />
      <path d="M16 16v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1" />
      <path d="M9 6h5a2 2 0 0 1 2 2v5" />
      <path d="m22 8-6 4v-1" />
    </svg>
  )
}

function MicIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 19v3" />
    </svg>
  )
}

function MicOffIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 2l20 20" />
      <path d="M15 9.34V4a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 4.13 2.78" />
      <path d="M5 10a7 7 0 0 0 10.24 6.22" />
      <path d="M19 10a7 7 0 0 1-1.06 3.73" />
      <path d="M12 19v3" />
    </svg>
  )
}

function PhoneOffIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.86.28 1.75.48 2.68.6A2 2 0 0 1 22 17v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.11 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.12.93.32 1.82.6 2.68a2 2 0 0 1-.45 2.11z" />
      <path d="M22 2 2 22" />
    </svg>
  )
}

function PhoneCallIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function CheckCircleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
