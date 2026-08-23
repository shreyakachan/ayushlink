import { useCallback, useEffect, useRef, useState } from "react"

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]

function pickSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") return null
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported?.(type)) || ""
}

/**
 * Records raw audio from the device microphone using MediaRecorder — no
 * network, no cloud speech API. Designed for an ASHA worker to capture a
 * patient describing symptoms in their own language (Marathi/Hindi/etc.)
 * as a plain audio file, to be reviewed or synced later.
 *
 * States: "idle" | "requesting" | "recording" | "processing" | "error"
 */
export default function useAudioRecorder() {
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const startedAtRef = useRef(0)
  const timerRef = useRef(null)

  const [state, setState] = useState("idle")
  const [error, setError] = useState(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const cleanupStream = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const start = useCallback(async () => {
    setError(null)
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("error")
      setError("Microphone recording isn't supported in this browser.")
      return
    }
    setState("requesting")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = pickSupportedMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorderRef.current = recorder
      recorder.start()

      startedAtRef.current = Date.now()
      setElapsedSeconds(0)
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000))
      }, 250)

      setState("recording")
    } catch (err) {
      setState("error")
      if (err?.name === "NotAllowedError") {
        setError("Microphone permission was denied. Allow mic access to record the patient's symptoms.")
      } else if (err?.name === "NotFoundError") {
        setError("No microphone was found on this device.")
      } else {
        setError("Couldn't access the microphone. Please try again.")
      }
      cleanupStream()
    }
  }, [cleanupStream])

  /** Stops recording and resolves with the recorded audio, or null if nothing was recording. */
  const stop = useCallback(() => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current
      if (!recorder || recorder.state === "inactive") {
        resolve(null)
        return
      }
      setState("processing")
      recorder.onstop = () => {
        const durationSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
        const mimeType = recorder.mimeType || "audio/webm"
        const blob = new Blob(chunksRef.current, { type: mimeType })
        cleanupStream()
        setState("idle")
        resolve({ blob, mimeType, durationSeconds })
      }
      recorder.stop()
    })
  }, [cleanupStream])

  /** Discards the in-progress recording without saving it. */
  const cancel = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null
      recorder.stop()
    }
    cleanupStream()
    chunksRef.current = []
    setState("idle")
    setElapsedSeconds(0)
  }, [cleanupStream])

  useEffect(() => cancel, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { state, error, elapsedSeconds, start, stop, cancel }
}
