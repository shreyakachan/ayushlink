import { useState, useEffect, useRef } from "react"
import { patientT } from "../lib/patientI18n.js"
import PatientListenButton from "./PatientListenButton.jsx"
import {
  getAshaCallWorkersList,
  requestAshaAudioCall,
  getPatientActiveAshaCall,
  cancelAshaCall,
  endAshaCall,
  getAshaCallDetails,
  getPatientAuthToken,
  API_BASE_URL,
} from "../lib/api.js"
import { WebRTCManager } from "../lib/webrtc.js"

/**
 * AyushLink — Patient "Contact ASHA" Screen
 * Real-time 2-Way Audio Calling with ASHA Worker Selection,
 * Outgoing Calling Ring Screen, WebRTC Audio Exchange, and Phone Dialer Fallback.
 */

const DEFAULT_WORKER = {
  worker_id: "ASHA-340",
  full_name: "Pooja Sharma",
  phone: "9876543210",
  assigned_villages: ["Chandapur"],
  village: "Chandapur",
}

export default function PatientContactAshaScreen({
  worker = DEFAULT_WORKER,
  lang = "en",
  onBack,
}) {
  const t = patientT(lang)
  const [workersList, setWorkersList] = useState([worker])
  const [selectedWorkerId, setSelectedWorkerId] = useState(worker.worker_id)
  const [stage, setStage] = useState("select") // "select" | "calling" | "in_call" | "ended"
  const [activeCall, setActiveCall] = useState(null)
  const [isMuted, setIsMuted] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [connectionState, setConnectionState] = useState("connecting")
  const [callOutcome, setCallOutcome] = useState(null) // "declined" | "missed" | "cancelled" | "ended"
  const [callError, setCallError] = useState(null)
  const [isStartingCall, setIsStartingCall] = useState(false)

  const webrtcManagerRef = useRef(null)
  const websocketRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const durationTimerRef = useRef(null)
  const isEndedRef = useRef(false)
  const activeCallRef = useRef(null)

  activeCallRef.current = activeCall

  const selectedWorker =
    workersList.find((w) => w.worker_id === selectedWorkerId) ||
    workersList[0] ||
    worker

  const cleanPhone = (selectedWorker.phone || "9876543210").replace(/\s+/g, "")
  const telHref = `tel:${cleanPhone}`

  // -------------------------------------------------------------
  // 1. Fetch available ASHA workers and check existing call
  // -------------------------------------------------------------
  useEffect(() => {
    let isMounted = true

    async function loadInitialData() {
      try {
        const workers = await getAshaCallWorkersList()
        if (isMounted && Array.isArray(workers) && workers.length > 0) {
          setWorkersList(workers)
          if (!selectedWorkerId || !workers.find((w) => w.worker_id === selectedWorkerId)) {
            setSelectedWorkerId(workers[0].worker_id)
          }
        }
      } catch (err) {
        console.warn("[PatientContactAsha] Workers list fetch error:", err)
      }

      // Check if patient already has an active or pending call
      try {
        const existing = await getPatientActiveAshaCall()
        if (isMounted && existing) {
          setActiveCall(existing)
          if (existing.status === "requested") {
            setStage("calling")
          } else if (existing.status === "accepted") {
            setStage("in_call")
            startWebRTCAudio(existing)
          }
        }
      } catch {}
    }

    loadInitialData()

    return () => {
      isMounted = false
    }
  }, [])

  // -------------------------------------------------------------
  // 2. Outgoing Call Polling Loop (detects ASHA accept/reject/timeout)
  // -------------------------------------------------------------
  useEffect(() => {
    if (stage !== "calling" || !activeCall?.call_id) return

    let isMounted = true
    let pollTimer = null

    const checkCallStatus = async () => {
      if (!isMounted) return
      try {
        const status = await getPatientActiveAshaCall()
        if (!isMounted) return

        if (!status) {
          // Call no longer returned as active (e.g. timed out to missed or rejected by ASHA)
          try {
            const finalCall = await getAshaCallDetails(activeCall.call_id)
            if (!isMounted) return
            if (finalCall?.status === "rejected") {
              setCallOutcome("declined")
            } else if (finalCall?.status === "missed") {
              setCallOutcome("missed")
            } else if (finalCall?.status === "cancelled") {
              setCallOutcome("cancelled")
            } else {
              setCallOutcome("ended")
            }
            setStage("ended")
          } catch {
            if (isMounted) {
              setCallOutcome("missed")
              setStage("ended")
            }
          }
          return
        }

        if (status.status === "accepted") {
          setActiveCall(status)
          setStage("in_call")
          startWebRTCAudio(status)
        } else if (status.status === "rejected") {
          setCallOutcome("declined")
          setStage("ended")
        } else if (status.status === "missed") {
          setCallOutcome("missed")
          setStage("ended")
        } else if (status.status === "cancelled") {
          setCallOutcome("cancelled")
          setStage("ended")
        }
      } catch {}
    }

    pollTimer = setInterval(checkCallStatus, 1500)

    return () => {
      isMounted = false
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [stage, activeCall?.call_id])

  // -------------------------------------------------------------
  // 3. Call Duration Timer during in_call
  // -------------------------------------------------------------
  useEffect(() => {
    if (stage === "in_call") {
      setCallDuration(0)
      durationTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1)
      }, 1000)
    } else {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current)
        durationTimerRef.current = null
      }
    }

    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current)
        durationTimerRef.current = null
      }
    }
  }, [stage])

  // -------------------------------------------------------------
  // 4. Safe Full Cleanup
  // -------------------------------------------------------------
  const cleanupCall = () => {
    isEndedRef.current = true

    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current)
      durationTimerRef.current = null
    }

    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.cleanup()
      webrtcManagerRef.current = null
    }

    if (websocketRef.current) {
      websocketRef.current.onopen = null
      websocketRef.current.onmessage = null
      websocketRef.current.onerror = null
      websocketRef.current.onclose = null
      try {
        websocketRef.current.close()
      } catch {}
      websocketRef.current = null
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupCall()
    }
  }, [])

  // -------------------------------------------------------------
  // 5. Start In-App Audio Call
  // -------------------------------------------------------------
  const handleStartInAppCall = async () => {
    if (isStartingCall) return
    setIsStartingCall(true)
    setCallError(null)

    try {
      const res = await requestAshaAudioCall({
        target_worker_id: selectedWorker.worker_id,
        reason: "Patient audio consultation",
      })

      if (res) {
        setActiveCall(res)
        if (res.status === "accepted") {
          setStage("in_call")
          startWebRTCAudio(res)
        } else {
          setStage("calling")
        }
      }
    } catch (err) {
      console.error("[PatientContactAsha] Start call error:", err)
      setCallError(err.message || "Unable to initiate call. Please try again.")
    } finally {
      setIsStartingCall(false)
    }
  }

  // -------------------------------------------------------------
  // 6. Cancel Outgoing Call
  // -------------------------------------------------------------
  const handleCancelCall = async () => {
    if (activeCall?.call_id) {
      try {
        await cancelAshaCall(activeCall.call_id)
      } catch {}
    }
    cleanupCall()
    setActiveCall(null)
    setStage("select")
  }

  // -------------------------------------------------------------
  // 7. End Active Call
  // -------------------------------------------------------------
  const handleEndCall = async () => {
    if (activeCall?.call_id) {
      try {
        if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
          websocketRef.current.send(JSON.stringify({ type: "call-ended" }))
        }
        await endAshaCall(activeCall.call_id, false)
      } catch {}
    }
    cleanupCall()
    setCallOutcome("ended")
    setStage("ended")
  }

  // -------------------------------------------------------------
  // 8. Toggle Mute
  // -------------------------------------------------------------
  const handleToggleMute = () => {
    if (webrtcManagerRef.current?.localStream?.getAudioTracks()?.length > 0) {
      const active = webrtcManagerRef.current.toggleAudio()
      setIsMuted(!active)
    } else {
      setIsMuted((prev) => !prev)
    }
  }

  // -------------------------------------------------------------
  // 9. WebRTC Audio-Only Connection Setup
  // -------------------------------------------------------------
  const startWebRTCAudio = async (callData) => {
    isEndedRef.current = false
    setConnectionState("connecting")
    const sessionId = callData?.call_session?.room_id || `room_asha_${callData.call_id.toLowerCase()}`
    const token = getPatientAuthToken()

    try {
      const webrtc = new WebRTCManager({
        onLocalStream: (stream) => {
          // Local mic ready
        },
        onRemoteStream: (remoteStream) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream
            remoteAudioRef.current.play().catch(() => {})
            setConnectionState("connected")
          }
        },
        onIceCandidate: (candidate) => {
          if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
            websocketRef.current.send(
              JSON.stringify({
                type: "ice-candidate",
                candidate: candidate,
              })
            )
          }
        },
        onConnectionStateChange: (state) => {
          if (state === "connected") {
            setConnectionState("connected")
          } else if (state === "disconnected" || state === "failed") {
            setConnectionState("disconnected")
          }
        },
        onError: (err) => {
          setCallError("Microphone permission denied. Please allow microphone access to talk.")
        },
      })

      webrtcManagerRef.current = webrtc

      // Request AUDIO ONLY (video: false)
      const stream = await webrtc.getLocalMedia({ audio: true, video: false })
      if (!stream) return

      // Build WebSocket signaling URL
      let wsHost = window.location.host
      let wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:"

      if (API_BASE_URL && /^https?:\/\//i.test(API_BASE_URL)) {
        try {
          const urlObj = new URL(API_BASE_URL)
          wsHost = urlObj.host
          wsProtocol = urlObj.protocol === "https:" ? "wss:" : "ws:"
        } catch {}
      }

      const wsUrl = `${wsProtocol}//${wsHost}/api/ws/asha-call/${sessionId}?token=${encodeURIComponent(token || "")}`
      const ws = new WebSocket(wsUrl)
      websocketRef.current = ws

      ws.onopen = async () => {
        console.log("[Patient Audio WS] Connected to room:", sessionId)
      }

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data)

          if (msg.type === "peer-joined") {
            // ASHA joined; create audio-only offer
            const offer = await webrtc.createOffer({ video: false })
            ws.send(JSON.stringify({ type: "offer", sdp: offer }))
          } else if (msg.type === "offer") {
            // Received offer from ASHA; create answer
            const answer = await webrtc.createAnswer(msg.sdp)
            ws.send(JSON.stringify({ type: "answer", sdp: answer }))
          } else if (msg.type === "answer") {
            await webrtc.handleAnswer(msg.sdp)
          } else if (msg.type === "ice-candidate" && msg.candidate) {
            await webrtc.addIceCandidate(msg.candidate)
          } else if (msg.type === "call-ended" || msg.type === "peer-left") {
            cleanupCall()
            setCallOutcome("ended")
            setStage("ended")
          }
        } catch (e) {
          console.warn("[Patient Audio WS] Message error:", e)
        }
      }

      ws.onerror = (err) => {
        console.error("[Patient Audio WS] Socket error:", err)
      }

      ws.onclose = () => {
        console.log("[Patient Audio WS] Socket closed")
        if (!isEndedRef.current) {
          cleanupCall()
          setCallOutcome("ended")
          setStage("ended")
        }
      }
    } catch (err) {
      console.error("[PatientContactAsha] Connection error:", err)
      setCallError("Microphone permission denied or connection failure.")
    }
  }

  const formatTimer = (sec) => {
    const mins = Math.floor(sec / 60)
    const secs = sec % 60
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }

  const spokenSummary = `${t.ashaTitle}. ${selectedWorker.full_name || selectedWorker.name}. ${t.village}: ${selectedWorker.assigned_villages?.join(", ") || selectedWorker.village || "Chandapur"}.`

  return (
    <div className="min-h-dvh w-full bg-slate-50 text-slate-800">
      {/* Hidden audio element to render peer sound */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-6 pb-28 sm:px-8">
        {/* Navigation Header */}
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={stage === "select" ? onBack : () => setStage("select")}
            aria-label={t.back}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-slate-50 hover:text-blue-600"
          >
            <BackIcon className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">{t.ashaTitle}</h1>
            <p className="text-sm text-slate-500">{t.ashaSub}</p>
          </div>
        </header>

        {callError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
            {callError}
          </div>
        )}

        {/* ========================================================= */}
        {/* STAGE 1: WORKER SELECTION & CALL ACTIONS                  */}
        {/* ========================================================= */}
        {stage === "select" && (
          <div className="flex flex-col gap-6">
            {/* Worker Selection Card */}
            <section className="flex flex-col gap-4 rounded-3xl border border-rose-100 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Assigned Health Worker
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Available
                </span>
              </div>

              {/* Workers Selector if multiple available */}
              {workersList.length > 1 && (
                <div className="flex flex-col gap-2">
                  <label htmlFor="worker-select" className="text-xs font-semibold text-slate-500">
                    Select ASHA Worker:
                  </label>
                  <select
                    id="worker-select"
                    value={selectedWorkerId}
                    onChange={(e) => setSelectedWorkerId(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
                  >
                    {workersList.map((w) => (
                      <option key={w.worker_id} value={w.worker_id}>
                        {w.full_name || w.name} ({w.assigned_villages?.join(", ") || w.village || "Chandapur"})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Selected Worker Info Box */}
              <div className="flex items-center gap-4 pt-2">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 shadow-sm">
                  <HeadsetIcon className="h-8 w-8" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold text-slate-900 truncate">
                    {selectedWorker.full_name || selectedWorker.name}
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    {t.village}: {selectedWorker.assigned_villages?.join(", ") || selectedWorker.village || "Chandapur"}
                  </p>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">
                    ID: {selectedWorker.worker_id}
                  </p>
                </div>
              </div>

              {/* Primary Action: In-App Audio Call */}
              <button
                type="button"
                onClick={handleStartInAppCall}
                disabled={isStartingCall}
                className="mt-3 flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 py-4 text-base font-extrabold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
              >
                <PhoneIcon className="h-5 w-5" />
                {isStartingCall ? "Connecting..." : "In-App Voice Call"}
              </button>

              {/* Secondary Fallback Action: Regular Phone Call */}
              <a
                href={telHref}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]"
              >
                <DialerIcon className="h-4 w-4 text-slate-500" />
                Direct Phone Call ({cleanPhone})
              </a>
            </section>
          </div>
        )}

        {/* ========================================================= */}
        {/* STAGE 2: OUTGOING CALL RINGING / WAITING                  */}
        {/* ========================================================= */}
        {stage === "calling" && (
          <section className="flex flex-col items-center gap-6 rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-lg">
            {/* Animated Ringing Pulse Avatar */}
            <div className="relative flex h-28 w-28 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-25" />
              <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/30">
                <HeadsetIcon className="h-12 w-12 animate-pulse" />
              </span>
            </div>

            <div>
              <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                Ringing...
              </span>
              <h2 className="mt-2 text-2xl font-black text-slate-900">
                Calling {selectedWorker.full_name || selectedWorker.name}
              </h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Village: {selectedWorker.assigned_villages?.join(", ") || selectedWorker.village || "Chandapur"}
              </p>
              <p className="mt-3 text-xs text-slate-400">
                Waiting for ASHA worker to accept the call (times out in 45s)
              </p>
            </div>

            {/* Cancel Call Button */}
            <button
              type="button"
              onClick={handleCancelCall}
              className="mt-2 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-rose-50 py-3.5 text-sm font-extrabold text-rose-700 border border-rose-200 shadow-sm transition hover:bg-rose-100 active:scale-95"
            >
              <PhoneHangupIcon className="h-4 w-4" />
              Cancel Call
            </button>
          </section>
        )}

        {/* ========================================================= */}
        {/* STAGE 3: ACTIVE 2-WAY AUDIO CALL                          */}
        {/* ========================================================= */}
        {stage === "in_call" && (
          <section className="flex flex-col items-center gap-6 rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center text-white shadow-2xl">
            <div className="flex w-full items-center justify-between border-b border-slate-800 pb-3">
              <span className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                {connectionState === "connected" ? "Connected" : "Connecting..."}
              </span>
              <span className="font-mono text-sm font-bold text-slate-300">
                {formatTimer(callDuration)}
              </span>
            </div>

            <div className="flex flex-col items-center">
              <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-xl shadow-emerald-500/20">
                <HeadsetIcon className="h-14 w-14 text-white" />
                <span className="absolute -inset-2 rounded-full border border-emerald-400/30 animate-ping opacity-40" />
              </div>

              <h2 className="mt-4 text-2xl font-black text-white">
                {selectedWorker.full_name || selectedWorker.name}
              </h2>
              <p className="text-sm text-slate-400">
                {selectedWorker.assigned_villages?.join(", ") || selectedWorker.village || "Chandapur"} &middot; ASHA Worker
              </p>

              {/* Audio Wave Visualizer */}
              <div className="mt-5 flex items-center gap-1.5 h-6">
                <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-3" />
                <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.4s_ease-in-out_infinite] h-6" />
                <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.7s_ease-in-out_infinite] h-4" />
                <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.5s_ease-in-out_infinite] h-5" />
                <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-3" />
              </div>
            </div>

            {/* In-Call Controls */}
            <div className="mt-4 flex items-center justify-center gap-6">
              {/* Mute Button */}
              <button
                type="button"
                onClick={handleToggleMute}
                className={`flex h-14 w-14 items-center justify-center rounded-full border transition active:scale-95 ${
                  isMuted
                    ? "border-amber-500 bg-amber-500/20 text-amber-400"
                    : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                }`}
                title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
              >
                {isMuted ? <MicOffIcon className="h-6 w-6" /> : <MicIcon className="h-6 w-6" />}
              </button>

              {/* End Call Button */}
              <button
                type="button"
                onClick={handleEndCall}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg shadow-rose-600/40 transition hover:bg-rose-700 active:scale-95"
                title="End Call"
              >
                <PhoneHangupIcon className="h-8 w-8" />
              </button>
            </div>
          </section>
        )}

        {/* ========================================================= */}
        {/* STAGE 4: CALL ENDED / OUTCOME FEEDBACK                    */}
        {/* ========================================================= */}
        {stage === "ended" && (
          <section className="flex flex-col items-center gap-4 rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-lg">
            <span
              className={`flex h-16 w-16 items-center justify-center rounded-full ${
                callOutcome === "declined" || callOutcome === "missed"
                  ? "bg-amber-50 text-amber-600"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              <PhoneIcon className="h-8 w-8" />
            </span>

            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {callOutcome === "declined"
                  ? "Call Declined"
                  : callOutcome === "missed"
                  ? "Call Missed / No Answer"
                  : "Call Ended"}
              </h2>
              <p className="mt-2 text-sm text-slate-500 max-w-sm">
                {callOutcome === "declined"
                  ? "The ASHA worker declined the call. She may be in a field visit or another consultation."
                  : callOutcome === "missed"
                  ? "The call timed out after 45 seconds. A missed-call notification has been sent to her dashboard."
                  : `Call finished. Duration: ${formatTimer(callDuration)}.`}
              </p>
            </div>

            <div className="mt-4 flex w-full max-w-xs flex-col gap-3">
              <a
                href={telHref}
                className="flex items-center justify-center gap-2 rounded-2xl bg-rose-600 py-3.5 text-sm font-bold text-white shadow-md shadow-rose-600/25 transition hover:bg-rose-700 active:scale-95"
              >
                <PhoneIcon className="h-4 w-4" />
                Call Phone ({cleanPhone})
              </a>

              <button
                type="button"
                onClick={() => {
                  setStage("select")
                  setCallOutcome(null)
                }}
                className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Back to ASHA Contacts
              </button>
            </div>
          </section>
        )}
      </div>

      <PatientListenButton text={spokenSummary} lang={lang} />
    </div>
  )
}

/* --- Inline SVGs --- */

function BackIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  )
}

function HeadsetIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <path d="M21 14a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2z" />
      <path d="M3 14a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" />
      <path d="M17 18v1a2 2 0 0 1-2 2h-3" />
    </svg>
  )
}

function PhoneIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function PhoneHangupIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="22" y1="2" x2="2" y2="22" />
    </svg>
  )
}

function DialerIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  )
}

function MicIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}

function MicOffIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}
