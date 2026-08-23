import usePatientSpeech from "../hooks/usePatientSpeech.js"
import { patientT } from "../lib/patientI18n.js"

/**
 * AyushLink — Patient Listen Button
 * React + JavaScript + Tailwind CSS
 *
 * A single, consistent floating button placed on every patient screen.
 * One tap reads the whole screen aloud (in the patient's chosen language,
 * fully offline via the browser's native SpeechSynthesis) — for patients
 * who can't read, this replaces having to understand any text on screen at
 * all. Adds zero required taps: it's silent and out of the way until used.
 *
 * Renders nothing if speech synthesis isn't supported on the device, or if
 * there's no text to speak yet.
 */
export default function PatientListenButton({ text, lang = "en" }) {
  const t = patientT(lang)
  const { speak, stop, speaking, supported, voiceAvailable } = usePatientSpeech(lang)

  if (!supported || !text) return null

  return (
    <div className="fixed bottom-5 right-5 z-40 flex max-w-[85vw] flex-col items-end gap-2 sm:bottom-7 sm:right-7">
      {speaking && !voiceAvailable && (
        <span className="max-w-[15rem] rounded-2xl bg-slate-900/90 px-3 py-2 text-right text-xs leading-snug text-white shadow-lg">
          {t.voiceLangUnavailable}
        </span>
      )}
      {speaking && (
        <span className="flex items-center gap-1.5 rounded-full bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
          {t.readingAloud}
        </span>
      )}
      <button
        type="button"
        onClick={() => (speaking ? stop() : speak(text))}
        aria-label={speaking ? t.stopListening : t.listenButtonLabel}
        className={`relative flex h-16 w-16 items-center justify-center rounded-full text-white shadow-xl transition active:scale-95 sm:h-[4.5rem] sm:w-[4.5rem]
          ${speaking ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
      >
        {speaking ? <StopIcon className="h-7 w-7" /> : <SpeakerIcon className="h-7 w-7" />}
        {!speaking && (
          <span className="absolute h-16 w-16 animate-ping rounded-full bg-blue-500/40 sm:h-[4.5rem] sm:w-[4.5rem]" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}

/* --- Inline icons --- */

function SpeakerIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="4,9 8,9 13,4 13,20 8,15 4,15" fill="currentColor" stroke="none" />
      <path d="M16 8.5a4.5 4.5 0 0 1 0 7" />
      <path d="M18.5 6a8 8 0 0 1 0 12" />
    </svg>
  )
}

function StopIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}
