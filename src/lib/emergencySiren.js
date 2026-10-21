/**
 * AyushLink — Software Emergency Siren (Browser Web Audio API)
 *
 * Provides a software-synthesized, multi-tone emergency acoustic alert
 * for ASHA workers during inbound simulated LoRa SOS emergencies.
 * 
 * Safety & Quality:
 * - Pure browser Web Audio API (0 external dependencies)
 * - Safe gain levels (capped at 0.25 to protect hearing)
 * - Automatic tone modulation (720 Hz <-> 960 Hz alternating pulse)
 * - Explicit user gesture unlock mechanism (unlockAudioContext)
 * - Persistent, reusable AudioContext across SOS events
 * - Clean resource release on stop/unmount without destroying AudioContext
 */

let audioCtx = null
let sirenOscillator = null
let sirenGain = null
let sirenTimer = null
let isPlaying = false

let shouldPlay = false

/**
 * Check if the current browser environment supports the Web Audio API.
 *
 * @returns {boolean}
 */
export function isSirenSupported() {
  if (typeof window === "undefined") return false
  return Boolean(window.AudioContext || window.webkitAudioContext)
}

/**
 * Lazily initialize and resume the AudioContext from a user gesture.
 * Safe to call multiple times; returns true if the context is running.
 *
 * @returns {Promise<boolean>}
 */
export async function unlockAudioContext() {
  if (!isSirenSupported()) return false

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new AudioContextClass()
    }

    if (audioCtx.state === "suspended") {
      await audioCtx.resume()
    }

    return audioCtx.state === "running"
  } catch (err) {
    console.warn("[EmergencySiren] AudioContext unlock failed:", err)
    return false
  }
}

/**
 * Get current state of the internal AudioContext.
 *
 * @returns {string}
 */
export function getAudioContextState() {
  return audioCtx ? audioCtx.state : "uninitialized"
}

/**
 * Start the software emergency siren tone.
 *
 * @param {Object} [options={}]
 * @param {number} [options.volume=0.18] - Peak gain (0.0 to 1.0)
 * @param {number} [options.lowFreq=720] - Lower modulation frequency in Hz
 * @param {number} [options.highFreq=960] - Upper modulation frequency in Hz
 * @param {number} [options.intervalMs=350] - Interval between tone flips
 * @returns {Promise<{ success: boolean, autoplayBlocked?: boolean, error?: string }>}
 */
export async function startEmergencySiren(options = {}) {
  shouldPlay = true
  if (isPlaying) {
    return { success: true }
  }

  if (!isSirenSupported()) {
    return { success: false, error: "Web Audio API not supported in this environment" }
  }

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new AudioContextClass()
    }

    // Attempt resume if suspended
    if (audioCtx.state === "suspended") {
      try {
        await audioCtx.resume()
      } catch {
        return { success: false, autoplayBlocked: true }
      }
    }

    // If stop was requested while resuming, abort cleanly
    if (!shouldPlay) {
      return { success: false }
    }

    if (audioCtx.state !== "running") {
      return { success: false, autoplayBlocked: true }
    }

    // Clean up any existing oscillator/timer cleanly before starting
    if (sirenTimer) {
      clearInterval(sirenTimer)
      sirenTimer = null
    }
    if (sirenOscillator) {
      try {
        sirenOscillator.stop()
        sirenOscillator.disconnect()
      } catch {}
      sirenOscillator = null
    }
    if (sirenGain) {
      try {
        sirenGain.disconnect()
      } catch {}
      sirenGain = null
    }

    const lowFreq = options.lowFreq || 720
    const highFreq = options.highFreq || 960
    const volume = Math.min(0.25, Math.max(0.05, options.volume || 0.18))
    const intervalMs = options.intervalMs || 350

    // Create oscillator & master gain
    sirenOscillator = audioCtx.createOscillator()
    sirenGain = audioCtx.createGain()

    sirenOscillator.type = "sine"
    sirenOscillator.frequency.setValueAtTime(lowFreq, audioCtx.currentTime)

    // Gentle fade in to avoid click transients
    sirenGain.gain.setValueAtTime(0.01, audioCtx.currentTime)
    sirenGain.gain.exponentialRampToValueAtTime(volume, audioCtx.currentTime + 0.1)

    sirenOscillator.connect(sirenGain)
    sirenGain.connect(audioCtx.destination)

    sirenOscillator.start()
    isPlaying = true

    // Alternate frequencies to create the emergency siren sweep
    let high = false
    sirenTimer = setInterval(() => {
      if (!isPlaying || !sirenOscillator || !audioCtx || audioCtx.state !== "running") return
      high = !high
      const targetFreq = high ? highFreq : lowFreq
      try {
        sirenOscillator.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.08)
      } catch {}
    }, intervalMs)

    return { success: true }
  } catch (err) {
    console.warn("[EmergencySiren] Autoplay or WebAudio initialization error:", err)
    stopEmergencySiren()
    return {
      success: false,
      autoplayBlocked: true,
      error: err.message,
    }
  }
}

/**
 * Stop the emergency siren and cleanly dispose of active nodes immediately.
 */
export function stopEmergencySiren() {
  shouldPlay = false
  isPlaying = false

  if (sirenTimer) {
    clearInterval(sirenTimer)
    sirenTimer = null
  }

  if (sirenGain && audioCtx) {
    try {
      sirenGain.gain.cancelScheduledValues(0)
      sirenGain.gain.setValueAtTime(0, audioCtx.currentTime)
    } catch {}
  }

  if (sirenOscillator) {
    try {
      sirenOscillator.stop(0)
      sirenOscillator.disconnect()
    } catch {}
    sirenOscillator = null
  }

  if (sirenGain) {
    try {
      sirenGain.disconnect()
    } catch {}
    sirenGain = null
  }
}

/**
 * Returns whether the siren is actively synthesizing audio.
 *
 * @returns {boolean}
 */
export function isSirenPlaying() {
  return isPlaying
}

if (typeof window !== "undefined") {
  window.__ayushlink_emergency_siren = {
    unlockAudioContext,
    startEmergencySiren,
    stopEmergencySiren,
    isSirenPlaying,
    getAudioContextState,
    getAudioContext: () => audioCtx,
  }
}


