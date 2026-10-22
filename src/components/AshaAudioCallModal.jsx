import { useState, useEffect, useRef } from "react"
import {
  getAshaActiveCall,
  decideAshaCall,
  endAshaCall,
  getAshaAuthToken,
  getAuthRole,
  API_BASE_URL,
} from "../lib/api.js"
import { WebRTCManager } from "../lib/webrtc.js"
import { startIncomingRingtone, stopIncomingRingtone } from "../lib/phoneRingtone.js"

/**
 * AyushLink — ASHA Incoming Audio Call Modal & Active Call Overlay
 *
 * Automatically monitors authenticated ASHA worker incoming audio calls.
 * Displays real-time incoming call alert with ringtone, handles Accept/Decline,
 * and maintains two-way WebRTC audio connection when connected.
 */

export default function AshaAudioCallModal({ lang = "en" }) {
  const [activeCall, setActiveCall] = useState(null)
  const [callStage, setCallStage] = useState("idle") // "idle" | "incoming" | "in_call"
  const [isMuted, setIsMuted] = useState(false)
  const [duration, setDuration] = useState(0)
  const [connectionState, setConnectionState] = useState("connecting")
  const [errorMessage, setErrorMessage] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const webrtcManagerRef = useRef(null)
  const websocketRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const durationTimerRef = useRef(null)
  const isCallEndedRef = useRef(false)
  const currentCallIdRef = useRef(null)

  currentCallIdRef.current = activeCall?.call_id

  // -------------------------------------------------------------
  // 1. Polling for ASHA incoming calls (~1.5s interval)
  // -------------------------------------------------------------
  useEffect(() => {
    let isMounted = true
    let pollTimer = null

    async function pollAshaCall() {
      // Only poll if currently logged in as ASHA
      const ashaToken = getAshaAuthToken()
      if (!ashaToken && getAuthRole() !== "asha") return

      try {
        const call = await getAshaActiveCall()
        if (!isMounted) return

        if (!call) {
          // If a call was ringing but now disappeared (patient cancelled or 45s timeout elapsed)
          if (callStage === "incoming") {
            stopIncomingRingtone()
            setActiveCall(null)
            setCallStage("idle")
          } else if (callStage === "in_call") {
            handleCallCleanup()
          }
          return
        }

        if (call.status === "requested") {
          if (callStage !== "incoming" && callStage !== "in_call") {
            setActiveCall(call)
            setCallStage("incoming")
            startIncomingRingtone()
          }
        } else if (call.status === "accepted") {
          // If we were incoming and now accepted, move to in_call
          if (callStage === "incoming") {
            stopIncomingRingtone()
            setActiveCall(call)
          }
        } else if (["rejected", "cancelled", "missed", "ended"].includes(call.status)) {
          if (callStage === "incoming" || callStage === "in_call") {
            handleCallCleanup()
          }
        }
      } catch (err) {
        // Silent catch for network hiccup
      }
    }

    pollTimer = setInterval(pollAshaCall, 1500)
    pollAshaCall() // Initial immediate check

    return () => {
      isMounted = false
      if (pollTimer) clearInterval(pollTimer)
      stopIncomingRingtone()
    }
  }, [callStage])

  // -------------------------------------------------------------
  // 2. Call duration timer during in_call
  // -------------------------------------------------------------
  useEffect(() => {
    if (callStage === "in_call") {
      setDuration(0)
      durationTimerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1)
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
  }, [callStage])

  // -------------------------------------------------------------
  // 3. Clean up all media, WebSockets, and timers
  // -------------------------------------------------------------
  const handleCallCleanup = () => {
    isCallEndedRef.current = true
    stopIncomingRingtone()

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

    setActiveCall(null)
    setCallStage("idle")
    setIsMuted(false)
    setDuration(0)
    setErrorMessage(null)
    setIsProcessing(false)
  }

  // -------------------------------------------------------------
  // 4. Accept Incoming Call
  // -------------------------------------------------------------
  const handleAcceptCall = async () => {
    if (!activeCall?.call_id || isProcessing) return
    setIsProcessing(true)
    stopIncomingRingtone()
    setErrorMessage(null)

    try {
      const accepted = await decideAshaCall(activeCall.call_id, { action: "accept" })
      setActiveCall(accepted)
      setCallStage("in_call")
      setConnectionState("connecting")

      // Initialize WebRTC audio-only connection
      await startAudioConnection(accepted)
    } catch (err) {
      console.error("[AshaCallModal] Accept error:", err)
      setErrorMessage(err.message || "Failed to accept call.")
      handleCallCleanup()
    } finally {
      setIsProcessing(false)
    }
  }

  // -------------------------------------------------------------
  // 5. Decline Incoming Call
  // -------------------------------------------------------------
  const handleDeclineCall = async () => {
    if (!activeCall?.call_id || isProcessing) return
    setIsProcessing(true)
    stopIncomingRingtone()

    try {
      await decideAshaCall(activeCall.call_id, {
        action: "reject",
        reason: "Decline by ASHA",
      })
    } catch (err) {
      console.warn("[AshaCallModal] Decline error:", err)
    } finally {
      handleCallCleanup()
    }
  }

  // -------------------------------------------------------------
  // 6. End Active Call
  // -------------------------------------------------------------
  const handleEndCall = async () => {
    if (!activeCall?.call_id) {
      handleCallCleanup()
      return
    }

    try {
      if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
        websocketRef.current.send(JSON.stringify({ type: "call-ended" }))
      }
      await endAshaCall(activeCall.call_id, true)
    } catch (err) {
      console.warn("[AshaCallModal] End call error:", err)
    } finally {
      handleCallCleanup()
    }
  }

  // -------------------------------------------------------------
  // 7. Toggle Microphone Mute
  // -------------------------------------------------------------
  const handleToggleMute = () => {
    if (webrtcManagerRef.current?.localStream?.getAudioTracks()?.length > 0) {
      const isAudioActive = webrtcManagerRef.current.toggleAudio()
      setIsMuted(!isAudioActive)
    } else {
      setIsMuted((prev) => !prev)
    }
  }

  // -------------------------------------------------------------
  // 8. WebRTC Connection Setup (Audio-Only)
  // -------------------------------------------------------------
  const startAudioConnection = async (callData) => {
    isCallEndedRef.current = false
    const sessionId = callData?.call_session?.room_id || `room_asha_${callData.call_id.toLowerCase()}`
    const token = getAshaAuthToken()

    try {
      const webrtc = new WebRTCManager({
        onLocalStream: (stream) => {
          // Local microphone acquired
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
          setErrorMessage("Microphone access was denied. Please allow microphone permissions and try again.")
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

      ws.onopen = () => {
        console.log("[ASHA Audio WS] Connected to room:", sessionId)
      }

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data)

          if (msg.type === "peer-joined") {
            // Patient joined room; create audio-only offer
            const offer = await webrtc.createOffer({ video: false })
            ws.send(JSON.stringify({ type: "offer", sdp: offer }))
          } else if (msg.type === "offer") {
            // Received offer from patient; create answer
            const answer = await webrtc.createAnswer(msg.sdp)
            ws.send(JSON.stringify({ type: "answer", sdp: answer }))
          } else if (msg.type === "answer") {
            await webrtc.handleAnswer(msg.sdp)
          } else if (msg.type === "ice-candidate" && msg.candidate) {
            await webrtc.addIceCandidate(msg.candidate)
          } else if (msg.type === "call-ended" || msg.type === "peer-left") {
            handleCallCleanup()
          }
        } catch (e) {
          console.warn("[ASHA Audio WS] Signaling message error:", e)
        }
      }

      ws.onerror = (err) => {
        console.error("[ASHA Audio WS] Socket error:", err)
      }

      ws.onclose = () => {
        console.log("[ASHA Audio WS] Socket closed")
        if (!isCallEndedRef.current) {
          handleCallCleanup()
        }
      }
    } catch (err) {
      console.error("[AshaCallModal] Connection error:", err)
      setErrorMessage("Microphone permission denied or connection failure.")
    }
  }

  // Format seconds into mm:ss
  const formatTimer = (sec) => {
    const mins = Math.floor(sec / 60)
    const secs = sec % 60
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }

  // Render nothing when completely idle
  if (callStage === "idle") {
    return <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
  }

  return (
    <>
      {/* Hidden audio element to render peer sound */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* ========================================================= */}
      {/* 1. INCOMING CALL MODAL POPUP                              */}
      {/* ========================================================= */}
      {callStage === "incoming" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-rose-100 bg-white p-6 text-center shadow-2xl">
            {/* Pulsing ring indicator */}
            <div className="relative mx-auto mb-4 flex h-24 w-24 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-30" />
              <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
                <PhoneIncomingIcon className="h-10 w-10 animate-bounce" />
              </span>
            </div>

            <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
              Incoming Voice Call
            </span>

            <h2 className="mt-3 text-2xl font-black text-slate-800">
              {activeCall?.patient_name || "Patient"}
            </h2>

            <p className="mt-1 text-sm font-semibold text-slate-500">
              Village: {activeCall?.patient_village || "Chandapur"}
            </p>

            {activeCall?.reason && (
              <div className="mt-3 rounded-2xl bg-slate-50 p-2.5 text-xs text-slate-600 border border-slate-100 italic">
                "{activeCall.reason}"
              </div>
            )}

            {/* Accept / Decline controls */}
            <div className="mt-6 flex items-center justify-center gap-4">
              {/* Decline Button */}
              <button
                type="button"
                onClick={handleDeclineCall}
                disabled={isProcessing}
                className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl bg-rose-50 py-3 text-rose-700 font-bold border border-rose-200 transition hover:bg-rose-100 active:scale-95 disabled:opacity-50"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-600 text-white shadow-md shadow-rose-600/30">
                  <PhoneHangupIcon className="h-6 w-6" />
                </span>
                <span className="text-xs">Decline</span>
              </button>

              {/* Accept Button */}
              <button
                type="button"
                onClick={handleAcceptCall}
                disabled={isProcessing}
                className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl bg-emerald-50 py-3 text-emerald-700 font-bold border border-emerald-200 transition hover:bg-emerald-100 active:scale-95 disabled:opacity-50"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md shadow-emerald-600/30">
                  <PhoneAnswerIcon className="h-6 w-6" />
                </span>
                <span className="text-xs">Accept</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. ACTIVE IN-CALL OVERLAY                                 */}
      {/* ========================================================= */}
      {callStage === "in_call" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 p-6 text-center text-white shadow-2xl">
            {/* Header Status */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                {connectionState === "connected" ? "Live Voice Call" : "Connecting audio..."}
              </span>
              <span className="font-mono text-sm font-bold text-slate-300">
                {formatTimer(duration)}
              </span>
            </div>

            {/* Patient Identity & Live Wave */}
            <div className="my-8 flex flex-col items-center">
              <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-xl shadow-blue-500/20">
                <UserIcon className="h-14 w-14 text-white" />
                {/* Audio pulse ripples */}
                <span className="absolute -inset-2 rounded-full border border-blue-400/30 animate-ping opacity-40" />
              </div>

              <h3 className="mt-4 text-2xl font-extrabold text-white">
                {activeCall?.patient_name || "Patient"}
              </h3>
              <p className="text-sm text-slate-400">
                Village: {activeCall?.patient_village || "Chandapur"}
              </p>

              {/* Audio wave indicator */}
              <div className="mt-4 flex items-center gap-1.5 h-6">
                <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-3" />
                <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.4s_ease-in-out_infinite] h-6" />
                <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.7s_ease-in-out_infinite] h-4" />
                <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.5s_ease-in-out_infinite] h-5" />
                <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-3" />
              </div>
            </div>

            {errorMessage && (
              <p className="mb-4 text-xs font-medium text-rose-400 bg-rose-950/60 p-2.5 rounded-xl border border-rose-800">
                {errorMessage}
              </p>
            )}

            {/* Controls */}
            <div className="flex items-center justify-center gap-6 pt-2">
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
          </div>
        </div>
      )}
    </>
  )
}

/* --- Inline SVGs --- */

function PhoneIncomingIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 2v6h6" />
      <path d="M21 3l-6 6" />
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function PhoneAnswerIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function PhoneHangupIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="22" y1="2" x2="2" y2="22" />
    </svg>
  )
}

function UserIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function MicIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}

function MicOffIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}
