import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Shared "listen" hook for patient-side screens.
 *
 * Wraps the browser's native SpeechSynthesis API — fully offline, no
 * backend TTS call, no network needed. Every patient screen that wants a
 * "listen" / audio-first experience for low-literacy users should use this
 * hook (via <PatientListenButton />) instead of re-implementing the same
 * speak/stop/voice-availability logic.
 *
 * IMPORTANT: many Android/Windows browsers ship English and Hindi voices
 * but NOT Marathi. Unlike a graceful accent swap, some TTS engines produce
 * total silence when `utterance.lang` doesn't match any installed voice —
 * they don't fall back on their own. So instead of only setting `.lang`
 * (which is what caused Marathi to silently do nothing), this hook always
 * picks and assigns an explicit `.voice`, walking a fallback chain: exact
 * language match -> same-language prefix -> Hindi (closest available
 * substitute for Marathi text, since devices almost always have it) ->
 * whatever voice the device defaults to. That guarantees audio plays even
 * when the ideal voice isn't installed.
 */

// BCP-47 codes for the SpeechSynthesis API, one per supported patient language.
const VOICE_LANG_BY_UI_LANG = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" }
// Two-letter prefix used to check installed-voice availability (voice.lang
// is reported inconsistently across browsers/OSes as e.g. "hi-IN" or "hi").
const VOICE_PREFIX_BY_UI_LANG = { en: "en", hi: "hi", mr: "mr" }
// If the patient's language has no installed voice at all, fall back to
// this language's voice rather than silently failing. Hindi is the
// closest widely-installed voice for Marathi's Devanagari script.
const FALLBACK_PREFIX_BY_UI_LANG = { mr: "hi", hi: "en", en: null }

function pickVoice(voices, lang) {
  if (!voices || voices.length === 0) return { voice: null, isFallback: false }

  const exactLang = VOICE_LANG_BY_UI_LANG[lang] || "en-IN"
  const prefix = VOICE_PREFIX_BY_UI_LANG[lang] || "en"

  // 1) Exact BCP-47 match (e.g. "mr-IN")
  let voice = voices.find((v) => v.lang?.toLowerCase() === exactLang.toLowerCase())
  if (voice) return { voice, isFallback: false }

  // 2) Same-language prefix match (e.g. any "mr*" voice)
  voice = voices.find((v) => v.lang?.toLowerCase().startsWith(prefix))
  if (voice) return { voice, isFallback: false }

  // 3) Fallback language (e.g. Hindi voice reading Marathi text — still
  // intelligible since both use Devanagari script and share phonetics)
  const fallbackPrefix = FALLBACK_PREFIX_BY_UI_LANG[lang]
  if (fallbackPrefix) {
    voice = voices.find((v) => v.lang?.toLowerCase().startsWith(fallbackPrefix))
    if (voice) return { voice, isFallback: true }
  }

  // 4) Device default voice — better than staying silent
  voice = voices.find((v) => v.default) || voices[0]
  return { voice: voice || null, isFallback: true }
}

export default function usePatientSpeech(lang = "en") {
  const [speaking, setSpeaking] = useState(false)
  const [supported, setSupported] = useState(true)
  const [voiceAvailable, setVoiceAvailable] = useState(true)
  const utteranceRef = useRef(null)
  const cancelTimerRef = useRef(null)

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window)
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  // Check whether the device actually has a voice installed for the
  // currently-selected language. getVoices() can return an empty list until
  // the browser finishes loading them, so we also listen for that event.
  useEffect(() => {
    if (!supported) return
    const prefix = VOICE_PREFIX_BY_UI_LANG[lang] || "en"

    const checkVoices = () => {
      const voices = window.speechSynthesis.getVoices()
      if (voices.length === 0) return // not loaded yet — wait for voiceschanged
      setVoiceAvailable(voices.some((v) => v.lang?.toLowerCase().startsWith(prefix)))
    }

    checkVoices()
    window.speechSynthesis.addEventListener("voiceschanged", checkVoices)
    return () => window.speechSynthesis.removeEventListener("voiceschanged", checkVoices)
  }, [supported, lang])

  // Stop any in-progress playback whenever the patient switches language or
  // navigates to a different screen, so audio never overlaps or keeps
  // speaking about a screen that's no longer visible.
  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel()
      if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current)
    }
  }, [lang, supported])

  const speak = useCallback(
    (text) => {
      if (!supported || !text) return
      window.speechSynthesis.cancel()
      if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current)

      // Chrome has a known bug where speak() called synchronously right
      // after cancel() gets silently dropped. A short delay avoids it.
      cancelTimerRef.current = setTimeout(() => {
        const voices = window.speechSynthesis.getVoices()
        const { voice } = pickVoice(voices, lang)

        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = voice?.lang || VOICE_LANG_BY_UI_LANG[lang] || "en-IN"
        if (voice) utterance.voice = voice
        utterance.rate = 0.95
        utterance.onend = () => setSpeaking(false)
        utterance.onerror = () => setSpeaking(false)
        utteranceRef.current = utterance
        window.speechSynthesis.speak(utterance)
        setSpeaking(true)
      }, 60)
    },
    [lang, supported],
  )

  const stop = useCallback(() => {
    if (!supported) return
    if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current)
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  return { speak, stop, speaking, supported, voiceAvailable }
}
