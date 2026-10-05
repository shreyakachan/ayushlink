import { useState } from "react"
import { patientT } from "../lib/patientI18n.js"
import useAudioRecorder from "../hooks/useAudioRecorder.js"
import { saveVoiceNote } from "../lib/audioStore.js"
import { submitPatientSymptoms, getAuthUser } from "../lib/api.js"
import { saveOfflineItem, generateClientId } from "../lib/offlineDb.js"

function BackIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
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
    </svg>
  )
}
function CheckIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

// Map the recorder hook's fixed English error strings to a translated
// message, without needing to modify the shared hook (used by the ASHA
// symptom checker too).
function translateMicError(rawError, t) {
  if (!rawError) return t.micGenericError
  if (rawError.includes("isn't supported")) return t.micUnsupported
  if (rawError.includes("permission was denied")) return t.micPermissionDenied
  if (rawError.includes("No microphone")) return t.micNotFound
  return t.micGenericError
}

export default function PatientSymptomScreen({ lang = "en", onBack }) {
  const t = patientT(lang)

  const [description, setDescription] = useState("")
  const [duration, setDuration] = useState(null)
  const [severity, setSeverity] = useState(null)
  const [voiceNote, setVoiceNote] = useState(null) // { durationSeconds }
  const [validationError, setValidationError] = useState(false)
  const [submitState, setSubmitState] = useState("idle") // idle | submitting | success | error

  const recorder = useAudioRecorder()

  const durationOptions = [
    { id: "today", label: t.durationToday },
    { id: "2-3-days", label: t.duration2to3Days },
    { id: "week", label: t.durationWeek },
    { id: "more-than-week", label: t.durationMoreThanWeek },
  ]
  const severityOptions = [
    { id: "mild", label: t.severityMild },
    { id: "moderate", label: t.severityModerate },
    { id: "severe", label: t.severitySevere },
  ]

  const handleRecordToggle = async () => {
    if (recorder.state === "recording") {
      const result = await recorder.stop()
      if (result) {
        try {
          await saveVoiceNote({ ...result, language: lang, symptomsSnapshot: description })
          setVoiceNote({ durationSeconds: result.durationSeconds })
        } catch {
          setSubmitState("error")
        }
      }
    } else if (recorder.state === "idle" || recorder.state === "error") {
      await recorder.start()
    }
  }

  const removeVoiceNote = () => {
    setVoiceNote(null)
  }

  const clearForm = () => {
    setDescription("")
    setDuration(null)
    setSeverity(null)
    setVoiceNote(null)
    setValidationError(false)
    setSubmitState("idle")
    recorder.cancel()
  }

  const handleSubmit = async () => {
    if (!description.trim() && !voiceNote) {
      setValidationError(true)
      return
    }
    setValidationError(false)
    setSubmitState("submitting")

    const symptomsList = description.trim()
      ? description.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
      : ["Reported via voice note"]

    const offlineId = generateClientId("SYM-OFFLINE")
    const nowIso = new Date().toISOString()
    const symptomPayload = {
      symptoms: symptomsList.length ? symptomsList : ["General weakness / discomfort"],
      description: description.trim() || "Voice note symptom assessment submitted",
      severity: severity || "moderate",
      duration: duration || "today",
      notes: voiceNote ? `Voice note duration: ${voiceNote.durationSeconds}s` : null,
      offline_id: offlineId,
      client_created_at: nowIso,
    }

    // PATH A: If browser is offline, save to IndexedDB pending queue immediately and do not attempt network request
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const authUser = getAuthUser()
      await saveOfflineItem({
        type: "symptom_report",
        client_id: offlineId,
        client_created_at: nowIso,
        payload: {
          ...symptomPayload,
          patient_id: authUser?.patient_id || authUser?.sub || "self",
          patient_name: authUser?.full_name || authUser?.name || "Patient",
          village: authUser?.village || "Chandapur",
        },
      })
      setSubmitState("success")
      return
    }

    // PATH B: Attempt live API submission with offline fallback on network/backend failure
    try {
      await submitPatientSymptoms(symptomPayload)
      setSubmitState("success")
    } catch (err) {
      const authUser = getAuthUser()
      await saveOfflineItem({
        type: "symptom_report",
        client_id: offlineId,
        client_created_at: nowIso,
        payload: {
          ...symptomPayload,
          patient_id: authUser?.patient_id || authUser?.sub || "self",
          patient_name: authUser?.full_name || authUser?.name || "Patient",
          village: authUser?.village || "Chandapur",
        },
      })
      setSubmitState("success")
    }
  }

  if (submitState === "success") {
    return (
      <div className="min-h-dvh w-full bg-slate-50 text-slate-800">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-5 py-16 pb-24 text-center lg:px-8">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckIcon className="h-8 w-8" />
          </span>
          <h1 className="text-xl font-bold text-slate-800">{t.symptomsSuccessTitle}</h1>
          <p className="max-w-sm text-sm text-slate-500">{t.symptomsSuccessDesc}</p>
          <div className="mt-4 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={clearForm}
              className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              {t.submitAnother}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              {t.goToHome}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh w-full bg-slate-50 text-slate-800">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6 pb-28 lg:px-8">
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={t.back}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-slate-50 hover:text-blue-600"
          >
            <BackIcon className="h-6 w-6" />
          </button>
          <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">{t.symptomsTitle}</h1>
        </header>

        <p className="text-sm text-slate-500">{t.symptomsInstructions}</p>

        {/* Text description */}
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t.symptomsPlaceholder}
            rows={5}
            className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-base text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white"
          />
          <p className="mt-2 text-xs text-slate-400">
            {t.symptomsExampleLabel} <span className="italic">{t.symptomsExampleText}</span>
          </p>

          {/* Voice note */}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleRecordToggle}
              aria-label={recorder.state === "recording" ? t.stopRecording : t.recordVoiceNote}
              disabled={recorder.state === "requesting" || recorder.state === "processing"}
              className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60
                ${recorder.state === "recording" ? "bg-red-600 text-white hover:bg-red-700" : "bg-blue-50 text-blue-700 hover:bg-blue-100"}`}
            >
              {recorder.state === "recording" ? <StopIcon className="h-4 w-4" /> : <MicIcon className="h-4 w-4" />}
              {recorder.state === "recording" ? t.stopRecording : t.recordVoiceNote}
            </button>
            {recorder.state === "recording" && (
              <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                {t.recording}
              </span>
            )}
          </div>

          {recorder.error && (
            <p className="mt-2 text-xs text-red-600">{translateMicError(recorder.error, t)}</p>
          )}

          {voiceNote && (
            <div className="mt-3 flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3">
              <span className="text-sm font-medium text-emerald-700">
                {t.voiceNoteSaved} ({voiceNote.durationSeconds}s)
              </span>
              <button
                type="button"
                onClick={removeVoiceNote}
                aria-label={t.removeVoiceNote}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-emerald-700 transition hover:bg-emerald-100"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        </section>

        {/* Duration */}
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-600">{t.durationLabel}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {durationOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDuration(opt.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition
                  ${duration === opt.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* Severity */}
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-600">{t.severityLabel}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {severityOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSeverity(opt.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition
                  ${severity === opt.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {validationError && (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
            {t.symptomsValidation}
          </p>
        )}
        {submitState === "error" && (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {t.symptomsError}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={clearForm}
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-base font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            {t.clearForm}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitState === "submitting"}
            className="flex-1 rounded-2xl bg-blue-600 px-6 py-4 text-base font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitState === "submitting" ? t.submitting : t.submitSymptoms}
          </button>
        </div>
      </div>
    </div>
  )
}
