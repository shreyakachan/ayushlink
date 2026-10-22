/**
 * AyushLink — Incoming Call Phone Ringtone (Web Audio API)
 *
 * Synthesizes a pleasant, authentic telephone ringtone for incoming ASHA calls.
 * Completely client-side, zero external assets required.
 *
 * Pattern:
 * - Dual-frequency sinusoidal telephone tone (440 Hz + 480 Hz)
 * - Cadence: 1.6s ring burst (with soft rise and fall), 2.0s silence
 * - Safe gain capped at 0.12 to protect hearing
 * - Immediate, clean release on accept, decline, cancel, or timeout
 */

let ringtoneAudioCtx = null
let ringtoneOsc1 = null
let ringtoneOsc2 = null
let ringtoneGain = null
let ringtoneTimer = null
let isRinging = false
let burstTimeout = null

function getAudioContext() {
  if (typeof window === "undefined") return null
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null
  if (!ringtoneAudioCtx || ringtoneAudioCtx.state === "closed") {
    ringtoneAudioCtx = new AudioContextClass()
  }
  return ringtoneAudioCtx
}

export function isRingtonePlaying() {
  return isRinging
}

/**
 * Start the repeating incoming telephone ringtone.
 */
export async function startIncomingRingtone() {
  if (isRinging) return { success: true }
  const ctx = getAudioContext()
  if (!ctx) return { success: false }

  try {
    if (ctx.state === "suspended") {
      await ctx.resume()
    }
  } catch (err) {
    console.warn("[PhoneRingtone] AudioContext resume failed (user gesture required):", err)
    return { success: false, autoplayBlocked: true }
  }

  isRinging = true

  const playToneBurst = () => {
    if (!isRinging || !ctx || ctx.state === "closed") return

    try {
      // Create dual oscillators for classic telephone bell frequency
      const now = ctx.currentTime
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const burstGain = ctx.createGain()

      osc1.type = "sine"
      osc1.frequency.setValueAtTime(440, now)

      osc2.type = "sine"
      osc2.frequency.setValueAtTime(480, now)

      // Soft envelope to avoid speaker clicks
      burstGain.gain.setValueAtTime(0.001, now)
      burstGain.gain.exponentialRampToValueAtTime(0.12, now + 0.08)
      burstGain.gain.setValueAtTime(0.12, now + 1.45)
      burstGain.gain.exponentialRampToValueAtTime(0.001, now + 1.6)

      osc1.connect(burstGain)
      osc2.connect(burstGain)
      burstGain.connect(ctx.destination)

      osc1.start(now)
      osc2.start(now)
      osc1.stop(now + 1.65)
      osc2.stop(now + 1.65)

      ringtoneOsc1 = osc1
      ringtoneOsc2 = osc2
      ringtoneGain = burstGain
    } catch (e) {
      console.warn("[PhoneRingtone] Burst error:", e)
    }
  }

  // Play initial burst
  playToneBurst()

  // Repeat every 3.6 seconds (1.6s ring + 2.0s pause)
  ringtoneTimer = setInterval(() => {
    if (!isRinging) {
      clearInterval(ringtoneTimer)
      return
    }
    playToneBurst()
  }, 3600)

  return { success: true }
}

/**
 * Stop the incoming ringtone immediately and release all tone nodes.
 */
export function stopIncomingRingtone() {
  isRinging = false

  if (ringtoneTimer) {
    clearInterval(ringtoneTimer)
    ringtoneTimer = null
  }
  if (burstTimeout) {
    clearTimeout(burstTimeout)
    burstTimeout = null
  }

  try {
    if (ringtoneGain && ringtoneAudioCtx && ringtoneAudioCtx.state === "running") {
      const now = ringtoneAudioCtx.currentTime
      ringtoneGain.gain.cancelScheduledValues(now)
      ringtoneGain.gain.setValueAtTime(0.0001, now)
    }
    if (ringtoneOsc1) {
      ringtoneOsc1.stop()
      ringtoneOsc1.disconnect()
      ringtoneOsc1 = null
    }
    if (ringtoneOsc2) {
      ringtoneOsc2.stop()
      ringtoneOsc2.disconnect()
      ringtoneOsc2 = null
    }
  } catch {}
}
