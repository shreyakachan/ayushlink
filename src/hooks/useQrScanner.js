import { useCallback, useEffect, useRef, useState } from "react"
import jsQR from "jsqr"

/**
 * Drives a live camera preview and continuously scans frames for a QR code
 * using jsQR — a pure-JS decoder that runs entirely on-device (no network,
 * no external API), which is what makes this usable in the field with zero
 * connectivity.
 *
 * Returns refs to attach to a <video> and hidden <canvas>, plus scanner
 * state ("idle" | "starting" | "scanning" | "found" | "error") and the
 * decoded text once a code is found.
 */
export default function useQrScanner({ onDecode } = {}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const stoppedRef = useRef(false)

  const [state, setState] = useState("idle")
  const [error, setError] = useState(null)

  const stop = useCallback(() => {
    stoppedRef.current = true
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const scanFrame = useCallback(() => {
    if (stoppedRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current

    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      // Downscale for speed — full camera resolution isn't needed to read a QR
      const scale = Math.min(1, 480 / video.videoWidth)
      const w = Math.max(1, Math.round(video.videoWidth * scale))
      const h = Math.max(1, Math.round(video.videoHeight * scale))
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d", { willReadFrequently: true })
      ctx.drawImage(video, 0, 0, w, h)

      try {
        const imageData = ctx.getImageData(0, 0, w, h)
        const result = jsQR(imageData.data, w, h, { inversionAttempts: "attemptBoth" })
        if (result?.data) {
          setState("found")
          stop()
          onDecode?.(result.data)
          return
        }
      } catch {
        // A frame occasionally fails to read (e.g. mid-resize) — just retry
      }
    }
    rafRef.current = requestAnimationFrame(scanFrame)
  }, [onDecode, stop])

  const start = useCallback(async () => {
    setError(null)
    setState("starting")
    stoppedRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setState("scanning")
      rafRef.current = requestAnimationFrame(scanFrame)
    } catch (err) {
      setState("error")
      if (err?.name === "NotAllowedError") {
        setError("Camera permission was denied. Allow camera access to scan the QR code.")
      } else if (err?.name === "NotFoundError") {
        setError("No camera was found on this device.")
      } else {
        setError("Couldn't access the camera. You can upload a photo of the QR code instead.")
      }
    }
  }, [scanFrame])

  useEffect(() => stop, [stop])

  return { videoRef, canvasRef, state, error, start, stop }
}
