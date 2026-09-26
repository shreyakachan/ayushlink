import { useEffect, useRef, useState } from "react"
import {
  endConsultationCall,
  getAuthUser,
  getAuthToken,
  API_BASE_URL,
} from "../lib/api.js"
import { WebRTCManager } from "../lib/webrtc.js"

export default function DoctorVideoCallModal({
  consultation,
  onClose,
  onProceedToConsultation,
}) {
  const doctor = getAuthUser()
  const patientName = consultation?.patient_name || "Patient"
  const patientId = consultation?.patient_id || "P-4559"
  const sessionId = consultation?.call_session?.room_id || consultation?.consultation_id || "room_default"

  // WebRTC Media Refs & State
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const webrtcManagerRef = useRef(null)
  const websocketRef = useRef(null)

  const [callDuration, setCallDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [connectionState, setConnectionState] = useState("connecting") // "connecting" | "connected" | "ended"
  const [permissionError, setPermissionError] = useState(null)
  const [patientJoined, setPatientJoined] = useState(false)
  const [showClinicalDrawer, setShowClinicalDrawer] = useState(false)

  // Call timer
  useEffect(() => {
    if (connectionState === "ended") return
    const timer = setInterval(() => setCallDuration((prev) => prev + 1), 1000)
    return () => clearInterval(timer)
  }, [connectionState])

  // Initialize WebRTC & WebSocket on mount
  useEffect(() => {
    let isMounted = true

    async function initDoctorVideoSession() {
      try {
        const token = getAuthToken()
        const webrtc = new WebRTCManager({
          onLocalStream: (stream) => {
            if (localVideoRef.current && isMounted) {
              localVideoRef.current.srcObject = stream
            }
          },
          onRemoteStream: (remoteStream) => {
            if (remoteVideoRef.current && isMounted) {
              remoteVideoRef.current.srcObject = remoteStream
              setPatientJoined(true)
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
            if (isMounted) {
              if (state === "connected") {
                setConnectionState("connected")
              } else if (state === "disconnected" || state === "failed") {
                setConnectionState("disconnected")
              }
            }
          },
          onError: (err) => {
            if (isMounted) {
              setPermissionError("Camera/Microphone permission was denied. Please allow access and retry.")
            }
          },
        })

        webrtcManagerRef.current = webrtc
        const localStream = await webrtc.getLocalMedia({ video: true, audio: true })
        if (!localStream || !isMounted) return

        // Connect to WebSocket signaling server
        let wsHost = window.location.host
        let wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:"

        if (API_BASE_URL && /^https?:\/\//i.test(API_BASE_URL)) {
          try {
            const urlObj = new URL(API_BASE_URL)
            wsHost = urlObj.host
            wsProtocol = urlObj.protocol === "https:" ? "wss:" : "ws:"
          } catch {}
        }

        const wsUrl = `${wsProtocol}//${wsHost}/api/ws/teleconsultation/${sessionId}?token=${encodeURIComponent(token || "")}`

        const ws = new WebSocket(wsUrl)
        websocketRef.current = ws

        ws.onopen = () => {
          console.log("[Doctor WebRTC WS] Connected to session:", sessionId)
        }

        ws.onmessage = async (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === "peer-joined") {
              setPatientJoined(true)
              // Doctor creates offer if patient joined after doctor
              const offer = await webrtc.createOffer()
              ws.send(JSON.stringify({ type: "offer", sdp: offer }))
            } else if (msg.type === "offer") {
              const answer = await webrtc.createAnswer(msg.sdp)
              ws.send(JSON.stringify({ type: "answer", sdp: answer }))
            } else if (msg.type === "answer") {
              await webrtc.handleAnswer(msg.sdp)
            } else if (msg.type === "ice-candidate" && msg.candidate) {
              await webrtc.addIceCandidate(msg.candidate)
            } else if (msg.type === "call-ended" || msg.type === "peer-left") {
              handleEndCall()
            }
          } catch (e) {
            console.warn("[Doctor WebRTC WS] Message error:", e)
          }
        }

        ws.onerror = (err) => {
          console.error("[Doctor WebRTC WS] Error:", err)
        }
      } catch (err) {
        console.error("Doctor media permission error:", err)
        if (isMounted) {
          setPermissionError("Camera or microphone permission is required for teleconsultation.")
        }
      }
    }

    initDoctorVideoSession()

    return () => {
      isMounted = false
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.cleanup()
        webrtcManagerRef.current = null
      }
      if (websocketRef.current) {
        try {
          websocketRef.current.close()
        } catch {}
      }
    }
  }, [sessionId])

  const handleToggleMute = () => {
    if (webrtcManagerRef.current) {
      const active = webrtcManagerRef.current.toggleAudio()
      setIsMuted(!active)
    }
  }

  const handleToggleCamera = () => {
    if (webrtcManagerRef.current) {
      const active = webrtcManagerRef.current.toggleVideo()
      setIsCameraOff(!active)
    }
  }

  const handleEndCall = async () => {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      try {
        websocketRef.current.send(JSON.stringify({ type: "call-ended" }))
        websocketRef.current.close()
      } catch {}
    }

    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.cleanup()
      webrtcManagerRef.current = null
    }

    if (consultation?.consultation_id) {
      try {
        await endConsultationCall(consultation.consultation_id)
      } catch {}
    }

    setConnectionState("ended")
  }

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md">
      <div className="relative flex h-full w-full max-w-6xl max-h-[96vh] flex-col overflow-hidden rounded-3xl bg-black border border-slate-800 shadow-2xl">
        {/* Call Ended State */}
        {connectionState === "ended" ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-slate-900 text-white">
            <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-600/20 text-blue-400 mb-5">
              <CheckCircleIcon className="h-10 w-10" />
            </span>
            <h2 className="text-2xl font-bold">Video Consultation Completed</h2>
            <p className="mt-2 text-sm text-slate-400">
              Session with <strong className="text-white">{patientName}</strong> lasted{" "}
              <strong className="text-white">{formatTimer(callDuration)}</strong>.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => {
                  onProceedToConsultation?.({
                    id: patientId,
                    name: patientName,
                    patient_id: patientId,
                    consultation_id: consultation?.consultation_id,
                    reason: consultation?.reason,
                  })
                }}
                className="flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition active:scale-95"
              >
                <StethoscopeIcon className="h-4.5 w-4.5" />
                <span>Proceed to Clinical Consultation & Prescribe</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border border-slate-700 bg-slate-800 px-6 py-3.5 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition active:scale-95"
              >
                Close & Return to Dashboard
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Top Bar Header */}
            <div className="absolute top-4 inset-x-4 flex items-center justify-between rounded-2xl bg-black/50 backdrop-blur-md px-5 py-3 text-white z-30">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-white">{patientName}</h3>
                    <span className="font-mono text-xs text-blue-300">({patientId})</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    {consultation?.patient_village || "Chandapur"} • Live WebRTC Session
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-white/10 px-3 py-1 font-mono font-bold text-emerald-300 text-sm">
                  {formatTimer(callDuration)}
                </span>
                <button
                  type="button"
                  onClick={() => setShowClinicalDrawer((prev) => !prev)}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    showClinicalDrawer ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  <FileTextIcon className="h-3.5 w-3.5" />
                  <span>{showClinicalDrawer ? "Hide Details" : "Clinical Details"}</span>
                </button>
              </div>
            </div>

            {/* Main Video View Area */}
            <div className="relative flex-1 w-full bg-slate-950 flex items-center justify-center overflow-hidden">
              {/* Remote Video (Patient) */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="h-full w-full object-cover"
              />

              {!patientJoined && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 p-6 text-center z-10">
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-600/20 border border-blue-500/30 text-blue-400 mb-4 animate-pulse">
                    <UserIcon className="h-10 w-10" />
                  </div>
                  <p className="text-lg font-bold text-white">Connecting with {patientName}...</p>
                  <p className="text-xs text-slate-400 mt-1">Waiting for patient video stream to initialize.</p>
                </div>
              )}

              {permissionError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 p-6 text-center z-20">
                  <div className="max-w-md rounded-3xl bg-red-950/80 border border-red-500/40 p-6 text-red-200">
                    <p className="text-base font-bold text-white mb-2">Camera / Microphone Access Required</p>
                    <p className="text-xs">{permissionError}</p>
                    <button
                      type="button"
                      onClick={onClose}
                      className="mt-5 rounded-2xl bg-slate-800 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-700"
                    >
                      Close Session
                    </button>
                  </div>
                </div>
              )}

              {/* Floating Picture-in-Picture Local Video (Doctor Stream) */}
              <div className="absolute bottom-24 right-5 z-20 h-48 w-36 overflow-hidden rounded-2xl border-2 border-white/40 shadow-2xl bg-slate-900">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`h-full w-full object-cover ${isCameraOff ? "hidden" : "block"}`}
                />
                {isCameraOff && (
                  <div className="flex h-full w-full items-center justify-center bg-slate-800 text-slate-400 text-xs">
                    Camera Off
                  </div>
                )}
                <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                  You (Doctor)
                </span>
              </div>

              {/* Clinical Quick Details Slide-over Drawer */}
              {showClinicalDrawer && (
                <div className="absolute top-20 right-5 bottom-24 w-80 rounded-3xl bg-slate-900/95 border border-slate-700/80 p-5 shadow-2xl backdrop-blur-md overflow-y-auto text-xs z-30 flex flex-col gap-3.5">
                  <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                    <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">Patient Vitals & Complaint</h4>
                    <button
                      type="button"
                      onClick={() => setShowClinicalDrawer(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="rounded-2xl bg-slate-800/80 p-3 border border-slate-700">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Chief Reason</p>
                    <p className="mt-0.5 font-semibold text-white">{consultation?.reason || "General health consultation"}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-xl bg-slate-800/60 p-2.5">
                      <p className="text-slate-400">Age / Gender</p>
                      <p className="font-bold text-white mt-0.5">{consultation?.patient_age || 20} yrs • {consultation?.patient_gender || "Female"}</p>
                    </div>
                    <div className="rounded-xl bg-slate-800/60 p-2.5">
                      <p className="text-slate-400">Village</p>
                      <p className="font-bold text-white mt-0.5">{consultation?.patient_village || "Chandapur"}</p>
                    </div>
                  </div>

                  {consultation?.symptoms?.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">Reported Symptoms</p>
                      <div className="flex flex-wrap gap-1.5">
                        {consultation.symptoms.map((s, idx) => (
                          <span key={idx} className="rounded-lg bg-rose-900/40 border border-rose-500/40 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-auto pt-2 border-t border-slate-700">
                    <p className="text-[10px] text-slate-400 text-center">AyushLink Secure Teleconsultation</p>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Toolbar Controls */}
            <div className="h-20 bg-slate-950/95 border-t border-slate-800 px-6 flex items-center justify-center gap-6 z-30">
              {/* Mute Toggle */}
              <button
                type="button"
                onClick={handleToggleMute}
                className={`flex h-12 w-12 items-center justify-center rounded-full transition active:scale-95 ${
                  isMuted ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-slate-800 text-white hover:bg-slate-700"
                }`}
                title={isMuted ? "Unmute Mic" : "Mute Mic"}
              >
                {isMuted ? <MicOffIcon className="h-5 w-5" /> : <MicIcon className="h-5 w-5" />}
              </button>

              {/* End Call Button */}
              <button
                type="button"
                onClick={handleEndCall}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/40 hover:bg-red-700 transition active:scale-90"
                title="End Consultation"
              >
                <PhoneOffIcon className="h-6 w-6" />
              </button>

              {/* Camera Toggle */}
              <button
                type="button"
                onClick={handleToggleCamera}
                className={`flex h-12 w-12 items-center justify-center rounded-full transition active:scale-95 ${
                  isCameraOff ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-slate-800 text-white hover:bg-slate-700"
                }`}
                title={isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
              >
                {isCameraOff ? <CameraOffIcon className="h-5 w-5" /> : <CameraIcon className="h-5 w-5" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* --- Inline Icons --- */

function MicIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )
}

function MicOffIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )
}

function CameraIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  )
}

function CameraOffIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 1.4-.6" />
      <path d="m9.5 4 1-1h3l2.5 3h4a2 2 0 0 1 2 2v6.6" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  )
}

function PhoneOffIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="22" y1="2" x2="2" y2="22" />
    </svg>
  )
}

function CheckCircleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
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

function StethoscopeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.8 2.3A2 2 0 0 0 3 4v6a5 5 0 0 0 10 0V4" />
      <path d="M8 15v1a6 6 0 0 0 12 0v-3" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  )
}

function FileTextIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}
