import { useState, useEffect, useRef, useMemo } from "react"
import useAudioRecorder from "../hooks/useAudioRecorder.js"
import { saveVoiceNote, listVoiceNotes, deleteVoiceNote } from "../lib/audioStore.js"
import { ASHA_LANGUAGES, ashaT } from "../lib/ashaI18n.js"

/**
 * AISymptomChecker - AyushLink
 * React + JavaScript + Tailwind CSS
 * Premium AI diagnosis screen with voice input and risk assessment.
 */

/* ---------------- Icons ---------------- */
function BackIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  )
}
function SparkIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M19 15l.7 1.9L21.6 17.6 19.7 18.3 19 20.2 18.3 18.3 16.4 17.6 18.3 16.9 19 15z" />
    </svg>
  )
}
function MicIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v5" />
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
function TrashIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}
function ClockIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}
function GlobeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" />
    </svg>
  )
}
function PillIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(45 12 12)" />
      <path d="M8.5 8.5l7 7" />
    </svg>
  )
}
function HospitalIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 21V7l8-4 8 4v14" />
      <path d="M9 21v-4h6v4" />
      <path d="M12 8v4M10 10h4" />
    </svg>
  )
}
function AlertIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}
function CheckIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
function StethoscopeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 3v6a5 5 0 0 0 10 0V3" />
      <path d="M9 14v2a6 6 0 0 0 12 0v-2" />
      <circle cx="21" cy="10" r="2" />
    </svg>
  )
}

/* ---------------- Config ---------------- */
const ACCENT = {
  emerald: {
    card: "border-emerald-200 bg-emerald-50",
    chip: "bg-emerald-600 text-white",
    ring: "ring-emerald-200",
    text: "text-emerald-800",
    icon: "text-emerald-600",
    bar: "bg-emerald-500",
  },
  amber: {
    card: "border-amber-200 bg-amber-50",
    chip: "bg-amber-500 text-white",
    ring: "ring-amber-200",
    text: "text-amber-800",
    icon: "text-amber-600",
    bar: "bg-amber-500",
  },
  red: {
    card: "border-red-200 bg-red-50",
    chip: "bg-red-600 text-white",
    ring: "ring-red-200",
    text: "text-red-800",
    icon: "text-red-600",
    bar: "bg-red-500",
  },
}

/* ---------------- Helpers ---------------- */
function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds || 0))
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${String(secs).padStart(2, "0")}`
}

function formatTimestamp(ms) {
  return new Date(ms).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/* ---------------- Field wrapper ---------------- */
function Field({ label, htmlFor, children, hint }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-700">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export default function AISymptomChecker({ lang = "en", onLangChange, onBack, onEmergency, onReferPHC }) {
  const [symptoms, setSymptoms] = useState("")
  const [language, setLanguage] = useState(lang)
  const [duration, setDuration] = useState("")
  const [severity, setSeverity] = useState("mild")
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const resultRef = useRef(null)
  const t = ashaT(lang)

  // Synchronize internal language state when prop changes
  useEffect(() => {
    setLanguage(lang)
  }, [lang])

  const durations = [
    { value: "", label: t.aiSymptom.durations[""] || "Select duration" },
    { value: "<1d", label: t.aiSymptom.durations["<1d"] },
    { value: "1-3d", label: t.aiSymptom.durations["1-3d"] },
    { value: "4-7d", label: t.aiSymptom.durations["4-7d"] },
    { value: "1-2w", label: t.aiSymptom.durations["1-2w"] },
    { value: ">2w", label: t.aiSymptom.durations[">2w"] },
  ]

  const severities = [
    { value: "mild", label: t.aiSymptom.severities.mild, tone: "text-emerald-700 border-emerald-200 bg-emerald-50" },
    { value: "moderate", label: t.aiSymptom.severities.moderate, tone: "text-amber-700 border-amber-200 bg-amber-50" },
    { value: "severe", label: t.aiSymptom.severities.severe, tone: "text-red-700 border-red-200 bg-red-50" },
  ]

  // Real microphone recording — captures the patient's own words as raw
  // audio (e.g. Marathi/Hindi) and saves them to IndexedDB, entirely offline.
  const recorder = useAudioRecorder()
  const [voiceNotes, setVoiceNotes] = useState([])
  const [notesLoading, setNotesLoading] = useState(true)
  const [savingNote, setSavingNote] = useState(false)

  const refreshVoiceNotes = async () => {
    try {
      const notes = await listVoiceNotes()
      setVoiceNotes(notes)
    } finally {
      setNotesLoading(false)
    }
  }

  useEffect(() => {
    refreshVoiceNotes()
  }, [])

  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [result])

  const handleLanguageChange = (newLang) => {
    setLanguage(newLang)
    onLangChange?.(newLang)
  }

  const handleMicClick = async () => {
    if (recorder.state === "recording") {
      const recording = await recorder.stop()
      if (recording) {
        setSavingNote(true)
        try {
          await saveVoiceNote({
            language,
            durationSeconds: recording.durationSeconds,
            mimeType: recording.mimeType,
            blob: recording.blob,
            symptomsSnapshot: symptoms.trim(),
          })
          await refreshVoiceNotes()
        } finally {
          setSavingNote(false)
        }
      }
      return
    }
    if (recorder.state === "idle" || recorder.state === "error") {
      recorder.start()
    }
  }

  const handleDeleteNote = async (id) => {
    await deleteVoiceNote(id)
    await refreshVoiceNotes()
  }

  const analyze = () => {
    if (!symptoms.trim()) return
    setAnalyzing(true)
    setResult(null)
    setTimeout(() => {
      const preset = t.aiSymptom.presets[severity]
      setResult({
        ...preset,
        accent: severity === "mild" ? "emerald" : severity === "moderate" ? "amber" : "red",
        refer: severity !== "mild",
        emergency: severity === "severe",
        confidence: severity === "mild" ? 82 : severity === "moderate" ? 74 : 91,
      })
      setAnalyzing(false)
    }, 1600)
  }

  const reset = () => {
    setSymptoms("")
    setDuration("")
    setSeverity("mild")
    setResult(null)
  }

  const accent = result ? ACCENT[result.accent] : ACCENT.emerald

  return (
    <main className="min-h-dvh w-full bg-gradient-to-b from-blue-50 via-white to-sky-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-blue-100 bg-white/90 px-4 py-4 backdrop-blur">
          <button
            type="button"
            onClick={onBack}
            aria-label={t.common.goBack}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95"
          >
            <BackIcon className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/25">
              <SparkIcon className="h-5 w-5 text-white" />
            </span>
            <div>
              <h1 className="text-lg font-bold leading-tight text-slate-800">{t.aiSymptom.title}</h1>
              <p className="text-xs text-slate-500">{t.aiSymptom.subtitle}</p>
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-5 px-4 py-5">
          {/* Input card */}
          <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-5">
              {/* Symptoms + voice */}
              <Field label={t.aiSymptom.symptomsLabel} htmlFor="symptoms" hint={t.aiSymptom.symptomsHint}>
                <div className="relative">
                  <textarea
                    id="symptoms"
                    rows={4}
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    placeholder={t.aiSymptom.symptomsPlaceholder}
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 pr-14 text-base text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={handleMicClick}
                    disabled={recorder.state === "requesting" || recorder.state === "processing"}
                    aria-label={recorder.state === "recording" ? t.aiSymptom.stopRecording : t.aiSymptom.recordSymptoms}
                    className={
                      "absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-xl transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 " +
                      (recorder.state === "recording"
                        ? "animate-pulse bg-red-600 text-white shadow-lg shadow-red-600/30"
                        : "bg-blue-600 text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700")
                    }
                  >
                    {recorder.state === "requesting" || recorder.state === "processing" ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : recorder.state === "recording" ? (
                      <StopIcon className="h-4 w-4" />
                    ) : (
                      <MicIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
                {recorder.state === "recording" ? (
                  <p className="flex items-center gap-2 text-sm font-medium text-red-600">
                    <span className="h-2 w-2 animate-ping rounded-full bg-red-600" />
                    {t.aiSymptom.recordingIn} {ASHA_LANGUAGES.find((l) => l.code === language)?.native || language}… {formatDuration(recorder.elapsedSeconds)}
                  </p>
                ) : recorder.state === "requesting" ? (
                  <p className="text-sm font-medium text-slate-500">{t.aiSymptom.openingMic}</p>
                ) : recorder.state === "processing" || savingNote ? (
                  <p className="text-sm font-medium text-slate-500">{t.aiSymptom.savingVoiceNote}</p>
                ) : recorder.state === "error" ? (
                  <p className="text-sm font-medium text-amber-600">{recorder.error}</p>
                ) : (
                  <p className="text-xs text-slate-400">
                    {t.aiSymptom.tapMicHint}
                  </p>
                )}
              </Field>

              {/* Language + Duration */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t.aiSymptom.languageLabel} htmlFor="language">
                  <div className="relative">
                    <GlobeIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <select
                      id="language"
                      value={language}
                      onChange={(e) => handleLanguageChange(e.target.value)}
                      className="w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-9 text-base text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    >
                      {ASHA_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>{l.native} ({l.label})</option>
                      ))}
                    </select>
                  </div>
                </Field>

                <Field label={t.aiSymptom.durationLabel} htmlFor="duration">
                  <div className="relative">
                    <ClockIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <select
                      id="duration"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      className="w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-9 text-base text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    >
                      {durations.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                </Field>
              </div>

              {/* Severity */}
              <Field label={t.aiSymptom.severityLabel}>
                <div className="grid grid-cols-3 gap-2">
                  {severities.map((s) => {
                    const active = severity === s.value
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setSeverity(s.value)}
                        className={
                          "rounded-2xl border py-3 text-sm font-semibold transition active:scale-95 " +
                          (active
                            ? s.tone + " ring-2 ring-offset-1 ring-blue-300"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                        }
                      >
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              </Field>

              {/* Analyze */}
              <button
                type="button"
                onClick={analyze}
                disabled={!symptoms.trim() || analyzing}
                className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {analyzing ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    {t.aiSymptom.analyzing}
                  </>
                ) : (
                  <>
                    <SparkIcon className="h-5 w-5" />
                    {t.aiSymptom.runAssessment}
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Saved voice notes — raw audio recorded on-device via IndexedDB */}
          {(notesLoading || voiceNotes.length > 0) && (
            <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <MicIcon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-800">{t.aiSymptom.voiceNotes}</h3>
                  <p className="text-xs text-slate-500">{t.aiSymptom.voiceNotesDesc}</p>
                </div>
              </div>

              {notesLoading ? (
                <p className="mt-4 text-sm text-slate-400">{t.aiSymptom.loadingRecordings}</p>
              ) : (
                <ul className="mt-4 flex flex-col gap-3">
                  {voiceNotes.map((note) => (
                    <VoiceNoteItem key={note.id} note={note} onDelete={() => handleDeleteNote(note.id)} t={t} />
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Result */}
          {result ? (
            <section ref={resultRef} className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
              {/* Risk header card */}
              <div className={"rounded-3xl border p-5 shadow-sm ring-1 " + accent.card + " " + accent.ring}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={"flex h-12 w-12 items-center justify-center rounded-2xl " + accent.chip}>
                      <StethoscopeIcon className="h-6 w-6" />
                    </span>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.aiSymptom.aiAssessment}</p>
                      <h2 className={"text-xl font-bold " + accent.text}>{result.level}</h2>
                    </div>
                  </div>
                  <span className={"rounded-full px-3 py-1 text-xs font-bold " + accent.chip}>
                    {result.confidence}% {t.aiSymptom.matchSuffix}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-700">{result.summary}</p>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/70">
                  <div className={"h-full rounded-full " + accent.bar} style={{ width: result.confidence + "%" }} />
                </div>
              </div>

              {/* Recommended action */}
              <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <CheckIcon className="h-5 w-5 text-blue-600" />
                  <h3 className="text-base font-bold text-slate-800">{t.aiSymptom.recommendedAction}</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{result.action}</p>
              </div>

              {/* Suggested medicines */}
              <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <PillIcon className="h-5 w-5 text-blue-600" />
                  <h3 className="text-base font-bold text-slate-800">{t.aiSymptom.suggestedMedicines}</h3>
                </div>
                <ul className="mt-3 flex flex-col gap-2">
                  {result.medicines.map((m, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
                      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                        {i + 1}
                      </span>
                      {m}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-slate-400">
                  {t.aiSymptom.aiDisclaimer}
                </p>
              </div>

              {/* Refer to PHC */}
              {result.refer ? (
                <button
                  type="button"
                  onClick={onReferPHC}
                  className="flex w-full items-center justify-between rounded-3xl border border-blue-200 bg-blue-50 p-5 text-left transition hover:bg-blue-100 active:scale-[0.99]"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
                      <HospitalIcon className="h-6 w-6" />
                    </span>
                    <span>
                      <span className="block text-base font-bold text-blue-800">{t.aiSymptom.referPhcTitle}</span>
                      <span className="block text-sm text-blue-700/80">{t.aiSymptom.referPhcDesc}</span>
                    </span>
                  </span>
                  <BackIcon className="h-5 w-5 rotate-180 text-blue-600" />
                </button>
              ) : null}

              {/* Emergency alert */}
              {result.emergency ? (
                <button
                  type="button"
                  onClick={onEmergency}
                  className="flex w-full items-center gap-3 rounded-3xl border-2 border-red-300 bg-red-600 p-5 text-left text-white shadow-lg shadow-red-600/30 transition hover:bg-red-700 active:scale-[0.99] animate-pulse"
                >
                  <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/20">
                    <AlertIcon className="h-7 w-7" />
                  </span>
                  <span>
                    <span className="block text-lg font-bold">{t.aiSymptom.emergencyAlertTitle}</span>
                    <span className="block text-sm text-red-50">
                      {t.aiSymptom.emergencyAlertDesc}
                    </span>
                  </span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={reset}
                className="mx-auto mt-1 text-sm font-semibold text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline"
              >
                {t.aiSymptom.startNewAssessment}
              </button>
            </section>
          ) : (
            <div className="rounded-3xl border border-dashed border-blue-200 bg-white/60 p-6 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                <SparkIcon className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm font-medium text-slate-600">
                {t.aiSymptom.emptyState}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

/* ---------------- Voice note list item ---------------- */
function VoiceNoteItem({ note, onDelete, t }) {
  const audioUrl = useMemo(() => URL.createObjectURL(note.blob), [note.blob])
  useEffect(() => () => URL.revokeObjectURL(audioUrl), [audioUrl])

  const languageLabel = ASHA_LANGUAGES.find((l) => l.code === note.language)?.native || note.language

  return (
    <li className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
            {languageLabel}
          </span>
          <span className="text-xs font-medium text-slate-500">{formatDuration(note.durationSeconds)}</span>
          <span className="text-xs text-slate-400">{formatTimestamp(note.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
            {t?.sync?.pending || "Pending sync"}
          </span>
          <button
            type="button"
            onClick={onDelete}
            aria-label={t?.common?.delete || "Delete voice note"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 active:scale-95"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      <audio controls preload="none" src={audioUrl} className="mt-2 w-full" />
      {note.symptomsSnapshot ? (
        <p className="mt-2 truncate text-xs text-slate-400">{t?.aiSymptom?.context || "Context"}: {note.symptomsSnapshot}</p>
      ) : null}
    </li>
  )
}
