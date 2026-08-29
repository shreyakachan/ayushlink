import { useEffect, useRef, useState } from "react"
import { patientT } from "../lib/patientI18n.js"
import {
  requestConsultation,
  getPatientActiveVideoRequest,
  getAvailableDoctors,
  endConsultationCall,
  updateConsultationStatus,
  getAuthUser,
  getAuthToken,
  API_BASE_URL,
} from "../lib/api.js"
import { WebRTCManager } from "../lib/webrtc.js"

export default function PatientCallScreen({ lang = "en", onBack }) {
  const t = patientT(lang)
  const authUser = getAuthUser()

  // Stages: 'request' | 'waiting' | 'accepted' | 'in_call' | 'ended'
  const [stage, setStage] = useState("request")
  const [activeConsultation, setActiveConsultation] = useState(null)

  // Doctor selection & request fields
  const [doctorsList, setDoctorsList] = useState([])
  const [selectedDoctorId, setSelectedDoctorId] = useState("DOC-101")
  const [reason, setReason] = useState("Medical consultation & symptom evaluation")
  const [urgency, setUrgency] = useState("routine")
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState(null)

  // WebRTC Media & Connection State
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const webrtcManagerRef = useRef(null)
  const websocketRef = useRef(null)

  const [callDuration, setCallDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [connectionState, setConnectionState] = useState("connecting") // "connecting" | "connected" | "disconnected"
  const [permissionError, setPermissionError] = useState(null)
  const [doctorJoined, setDoctorJoined] = useState(false)

  // 1. Initial Load: Fetch available doctors and check for active existing request (Zero automatic creation)
  useEffect(() => {
    let isMounted = true

    async function loadInitialData() {
      try {
        const [docsRes, activeReq] = await Promise.allSettled([
          getAvailableDoctors(),
          getPatientActiveVideoRequest(),
        ])

        if (!isMounted) return

        if (docsRes.status === "fulfilled" && Array.isArray(docsRes.value) && docsRes.value.length > 0) {
          setDoctorsList(docsRes.value)
          setSelectedDoctorId(docsRes.value[0].doctor_id || "DOC-101")
        }

        if (activeReq.status === "fulfilled" && activeReq.value) {
          const req = activeReq.value
          setActiveConsultation(req)
          if (req.status === "requested") {
            setStage("waiting")
          } else if (req.status === "accepted") {
            setStage("accepted")
          } else if (req.status === "in_progress") {
            setStage("accepted")
          }
        }
      } catch (err) {
        console.error("Error checking initial video state:", err)
      }
    }

    loadInitialData()
    return () => {
      isMounted = false
    }
  }, [])

  // 2. Polling for Doctor Acceptance during 'waiting' stage
  useEffect(() => {
    if (stage !== "waiting") return

    const intervalId = setInterval(async () => {
      try {
        const activeReq = await getPatientActiveVideoRequest()
        if (activeReq) {
          setActiveConsultation(activeReq)
          if (activeReq.status === "accepted" || activeReq.status === "in_progress") {
            setStage("accepted")
          } else if (activeReq.status === "rejected") {
            setRequestError("Doctor is currently occupied or declined the request. Please choose another doctor.")
            setStage("request")
          }
        }
      } catch (err) {
        console.error("Error polling consultation state:", err)
      }
    }, 2500)

    return () => clearInterval(intervalId)
  }, [stage])

  // 3. Call Duration Timer during active call
  useEffect(() => {
    if (stage !== "in_call") return
    const timerId = setInterval(() => {
      setCallDuration((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timerId)
  }, [stage])

  // 4. Handle Patient Requesting Consultation (Explicit User Click Only)
  const handleSendRequest = async () => {
    setRequesting(true)
    setRequestError(null)
    try {
      const selectedDoc = doctorsList.find((d) => d.doctor_id === selectedDoctorId)
      const res = await requestConsultation({
        doctor_id: selectedDoctorId,
        reason: reason.trim() || "Video consultation request",
        urgency: urgency,
        symptoms: authUser?.condition ? [authUser.condition] : [],
      })

      if (res) {
        setActiveConsultation(res)
        if (res.status === "accepted") {
          setStage("accepted")
        } else {
          setStage("waiting")
        }
      }
    } catch (err) {
      console.error("Error creating video request:", err)
      setRequestError(err.message || "Failed to submit request. Please try again.")
    } finally {
      setRequesting(false)
    }
  }

  // 5. Handle Cancel Request
  const handleCancelRequest = async () => {
    if (activeConsultation?.consultation_id) {
      try {
        await updateConsultationStatus(activeConsultation.consultation_id, "cancelled")
      } catch {}
    }
    setActiveConsultation(null)
    setStage("request")
  }

  // 6. Join Video Consultation & WebRTC Signaling Lifecycle (Requested on explicit click)
  const handleJoinVideoConsultation = async () => {
    setPermissionError(null)
    setStage("in_call")
    setConnectionState("connecting")

    const sessionId = activeConsultation?.call_session?.room_id || activeConsultation?.consultation_id || "room_default"
    const token = getAuthToken()

    try {
      // Step A: Request real camera & microphone permissions
      const webrtc = new WebRTCManager({
        onLocalStream: (stream) => {
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream
          }
        },
        onRemoteStream: (remoteStream) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream
            setDoctorJoined(true)
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
          setPermissionError("Camera and microphone permission is required to participate in the video consultation.")
        },
      })

      webrtcManagerRef.current = webrtc
      const localStream = await webrtc.getLocalMedia({ video: true, audio: true })
      if (!localStream) return

      // Step B: Connect to WebSocket signaling server
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:"
      const apiHost = API_BASE_URL.replace(/^https?:\/\//, "").replace(/\/api\/?$/, "")
      const wsUrl = `${wsProtocol}//${apiHost}/api/ws/teleconsultation/${sessionId}?token=${token}`

      const ws = new WebSocket(wsUrl)
      websocketRef.current = ws

      ws.onopen = async () => {
        console.log("[WebRTC WS] Connected to room:", sessionId)
      }

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === "peer-joined") {
            setDoctorJoined(true)
            // If patient is in room first, create offer for doctor
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
            handleHangup()
          }
        } catch (e) {
          console.warn("[WebRTC WS] Message handling error:", e)
        }
      }

      ws.onerror = (err) => {
        console.error("[WebRTC WS] Connection error:", err)
      }

      ws.onclose = () => {
        console.log("[WebRTC WS] Socket closed")
      }
    } catch (err) {
      console.error("Error joining video session:", err)
      setPermissionError("Camera or microphone permission was denied or is unavailable. Please allow access and retry.")
    }
  }

  // 7. Toggle Audio & Video
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

  // 8. Hangup & End Call
  const handleHangup = async () => {
    // Notify peer
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      try {
        websocketRef.current.send(JSON.stringify({ type: "call-ended" }))
        websocketRef.current.close()
      } catch {}
    }

    // Cleanup WebRTC & camera/mic tracks
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.cleanup()
      webrtcManagerRef.current = null
    }

    // Update backend call status
    if (activeConsultation?.consultation_id) {
      try {
        await endConsultationCall(activeConsultation.consultation_id)
      } catch {}
    }

    setStage("ended")
  }

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
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
  }, [])

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const doctorDisplayName = activeConsultation?.doctor_name || doctorsList.find((d) => d.doctor_id === selectedDoctorId)?.full_name || "Dr. Ramesh Gupta"

  return (
    <div className="flex min-h-dvh w-full flex-col bg-slate-900 text-white select-none">
      {/* ------------------------------------------------------------- */}
      {/* STAGE 1: Request Video Consultation */}
      {/* ------------------------------------------------------------- */}
      {stage === "request" && (
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-between p-6">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-6 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onBack}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800 text-slate-400 hover:text-white transition"
                >
                  <BackIcon className="h-5 w-5" />
                </button>
                <div>
                  <h1 className="text-lg font-bold text-white">Video Consultation</h1>
                  <p className="text-xs text-slate-400">Connect with an AYUSH medical officer</p>
                </div>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-600/20 text-blue-400">
                <VideoIcon className="h-5 w-5" />
              </span>
            </div>

            {/* Doctor Picker */}
            <div className="mt-6">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Select Available Doctor
              </label>
              <div className="flex flex-col gap-2.5">
                {(doctorsList.length > 0
                  ? doctorsList
                  : [
                      { doctor_id: "DOC-101", full_name: "Dr. Ramesh Gupta", specialization: "General Physician & AYUSH Consultant" },
                      { doctor_id: "DOC-102", full_name: "Dr. Anjali Rao", specialization: "Pediatrics & Child Health" },
                      { doctor_id: "DOC-501", full_name: "Dr. Arvind Varma", specialization: "General Medicine" },
                    ]
                ).map((doc) => {
                  const isSelected = selectedDoctorId === doc.doctor_id
                  return (
                    <button
                      key={doc.doctor_id}
                      type="button"
                      onClick={() => setSelectedDoctorId(doc.doctor_id)}
                      className={`flex items-center justify-between p-4 rounded-2xl border transition text-left ${
                        isSelected
                          ? "bg-blue-600/15 border-blue-500 shadow-md"
                          : "bg-slate-800/60 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`flex h-11 w-11 items-center justify-center rounded-xl font-bold text-sm ${isSelected ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300"}`}>
                          {doc.full_name.replace("Dr. ", "").charAt(0)}
                        </span>
                        <div>
                          <p className="font-bold text-sm text-white">{doc.full_name}</p>
                          <p className="text-xs text-slate-400">{doc.specialization || "AYUSH Consultant"}</p>
                        </div>
                      </div>
                      <span className={`h-4 w-4 rounded-full border flex items-center justify-center ${isSelected ? "border-blue-500 bg-blue-500" : "border-slate-600"}`}>
                        {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Reason / Complaint Input */}
            <div className="mt-6">
              <label htmlFor="reason-input" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Reason for Consultation
              </label>
              <textarea
                id="reason-input"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe your symptoms or reason for speaking with the doctor..."
                className="w-full rounded-2xl border border-slate-800 bg-slate-800/80 p-3.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none transition"
              />
            </div>

            {/* Urgency */}
            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs text-slate-400">Urgency:</span>
              <button
                type="button"
                onClick={() => setUrgency("routine")}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition ${urgency === "routine" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"}`}
              >
                Routine
              </button>
              <button
                type="button"
                onClick={() => setUrgency("urgent")}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition ${urgency === "urgent" ? "bg-red-600 text-white" : "bg-slate-800 text-slate-400"}`}
              >
                Urgent / SOS
              </button>
            </div>

            {requestError && (
              <p className="mt-4 rounded-xl bg-red-500/20 p-3 text-xs text-red-300 border border-red-500/30">
                ⚠️ {requestError}
              </p>
            )}
          </div>

          <div className="pt-6">
            <button
              type="button"
              onClick={handleSendRequest}
              disabled={requesting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-base font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 disabled:opacity-50 transition active:scale-98"
            >
              <VideoIcon className="h-5 w-5" />
              <span>{requesting ? "Submitting Request..." : "Request Video Consultation"}</span>
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STAGE 2: Waiting for Doctor Approval */}
      {/* ------------------------------------------------------------- */}
      {stage === "waiting" && (
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-between p-6 text-center">
          <div className="w-full flex items-center justify-between pb-6 border-b border-slate-800">
            <span className="text-xs font-mono font-bold text-blue-400">
              {activeConsultation?.consultation_id || "REQUEST"}
            </span>
            <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 border border-amber-500/30">
              Pending Approval
            </span>
          </div>

          <div className="my-auto flex flex-col items-center">
            {/* Animated Pulse Avatar */}
            <div className="relative mb-6">
              <span className="absolute -inset-4 animate-ping rounded-full bg-blue-600/20 duration-1000" />
              <span className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-blue-600 text-white shadow-2xl shadow-blue-600/50">
                <VideoIcon className="h-10 w-10 animate-pulse" />
              </span>
            </div>

            <h2 className="text-xl font-bold text-white">Video consultation request sent</h2>
            <p className="mt-2 text-sm text-slate-400 max-w-xs">
              Waiting for <strong className="text-white">{doctorDisplayName}</strong> to accept your consultation request.
            </p>

            <div className="mt-6 flex items-center gap-2 rounded-2xl bg-slate-800/80 px-4 py-2 text-xs text-slate-300 border border-slate-700">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <span>Live connection active • Ready to join once accepted</span>
            </div>
          </div>

          <div className="w-full pt-6">
            <button
              type="button"
              onClick={handleCancelRequest}
              className="w-full rounded-2xl border border-slate-700 bg-slate-800 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition"
            >
              Cancel Request
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STAGE 3: Doctor Accepted & Ready to Join */}
      {/* ------------------------------------------------------------- */}
      {stage === "accepted" && (
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-between p-6 text-center">
          <div className="w-full flex items-center justify-between pb-6 border-b border-slate-800">
            <span className="text-xs font-mono font-bold text-emerald-400">
              {activeConsultation?.consultation_id || "READY"}
            </span>
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 border border-emerald-500/30">
              Request Accepted
            </span>
          </div>

          <div className="my-auto flex flex-col items-center">
            <span className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-emerald-600 text-white shadow-2xl shadow-emerald-600/40 animate-bounce">
              <CheckCircleIcon className="h-12 w-12" />
            </span>

            <h2 className="text-2xl font-bold text-white">Doctor accepted your request!</h2>
            <p className="mt-2 text-sm text-slate-300">
              <strong className="text-white">{doctorDisplayName}</strong> is ready for your clinical audio/video consultation.
            </p>

            {permissionError && (
              <div className="mt-5 rounded-2xl bg-red-500/20 p-4 text-xs text-red-200 border border-red-500/30 text-left">
                <p className="font-bold">⚠️ Permission Notice:</p>
                <p className="mt-0.5">{permissionError}</p>
              </div>
            )}
          </div>

          <div className="w-full pt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleJoinVideoConsultation}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-700 transition active:scale-98"
            >
              <VideoIcon className="h-5 w-5" />
              <span>Join Video Consultation</span>
            </button>
            <button
              type="button"
              onClick={onBack}
              className="py-2 text-xs text-slate-400 hover:text-slate-300"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STAGE 4: Active Real-Time WebRTC Call */}
      {/* ------------------------------------------------------------- */}
      {stage === "in_call" && (
        <div className="relative flex h-dvh w-full flex-col bg-black overflow-hidden">
          {/* Main Remote Video (Doctor Stream) */}
          <div className="relative flex-1 w-full bg-slate-950 flex items-center justify-center">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />

            {!doctorJoined && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 p-6 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-600/30 border border-blue-500/40 text-blue-400 mb-4 animate-pulse">
                  <UserIcon className="h-10 w-10" />
                </div>
                <p className="text-lg font-bold text-white">Connecting with {doctorDisplayName}...</p>
                <p className="text-xs text-slate-400 mt-1">Please keep this window open while the media connection initializes.</p>
              </div>
            )}

            {/* Top Overlay Banner */}
            <div className="absolute top-4 inset-x-4 flex items-center justify-between rounded-2xl bg-black/40 backdrop-blur-md px-4 py-2.5 text-xs text-white z-20">
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <div>
                  <p className="font-bold">{doctorDisplayName}</p>
                  <p className="text-[10px] text-slate-300">Live Video Consultation</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-white/10 px-2.5 py-1 font-mono font-bold text-emerald-300">
                  {formatTimer(callDuration)}
                </span>
              </div>
            </div>

            {/* Floating Picture-in-Picture Local Video (Patient Stream) */}
            <div className="absolute bottom-24 right-4 z-20 h-44 w-32 overflow-hidden rounded-2xl border-2 border-white/40 shadow-2xl bg-slate-900">
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
              <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                You
              </span>
            </div>
          </div>

          {/* Floating Call Controls */}
          <div className="h-20 bg-slate-950/95 border-t border-slate-800/80 px-6 flex items-center justify-center gap-5 z-30">
            {/* Mute Toggle */}
            <button
              type="button"
              onClick={handleToggleMute}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition active:scale-95 ${
                isMuted ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-slate-800 text-white hover:bg-slate-700"
              }`}
              title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
            >
              {isMuted ? <MicOffIcon className="h-5 w-5" /> : <MicIcon className="h-5 w-5" />}
            </button>

            {/* End Call Button */}
            <button
              type="button"
              onClick={handleHangup}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/40 hover:bg-red-700 transition active:scale-90"
              title="End Call"
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
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STAGE 5: Call Ended Summary */}
      {/* ------------------------------------------------------------- */}
      {stage === "ended" && (
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center p-6 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-800 text-blue-400 mb-5">
            <CheckCircleIcon className="h-10 w-10" />
          </span>
          <h2 className="text-xl font-bold text-white">Consultation Ended</h2>
          <p className="mt-1 text-sm text-slate-400">
            Duration: <strong className="text-white">{formatTimer(callDuration)}</strong> with {doctorDisplayName}
          </p>
          <p className="mt-4 text-xs text-slate-500 max-w-xs">
            Any digital prescriptions generated during this consultation will be viewable in your Prescriptions section.
          </p>

          <button
            type="button"
            onClick={onBack}
            className="mt-8 w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-md hover:bg-blue-700 transition active:scale-98"
          >
            Return to Dashboard
          </button>
        </div>
      )}
    </div>
  )
}

/* --- Inline Clean SVG Icons --- */

function BackIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  )
}

function VideoIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 8-6 4 6 4V8Z" />
      <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
    </svg>
  )
}

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
