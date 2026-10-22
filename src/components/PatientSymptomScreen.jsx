import { useState } from "react"
import { patientT } from "../lib/patientI18n.js"
import { submitPatientSymptoms, getPatientAuthUser } from "../lib/api.js"
import { saveOfflineItem, generateClientId } from "../lib/offlineDb.js"

function BackIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
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

export default function PatientSymptomScreen({ lang = "en", onBack }) {
  const t = patientT(lang)

  const [description, setDescription] = useState("")
  const [duration, setDuration] = useState(null)
  const [severity, setSeverity] = useState(null)
  const [validationError, setValidationError] = useState(false)
  const [submitState, setSubmitState] = useState("idle") // idle | submitting | success | error

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

  const clearForm = () => {
    setDescription("")
    setDuration(null)
    setSeverity(null)
    setValidationError(false)
    setSubmitState("idle")
  }

  const handleSubmit = async () => {
    if (!description.trim()) {
      setValidationError(true)
      return
    }
    setValidationError(false)
    setSubmitState("submitting")

    const symptomsList = description
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)

    const offlineId = generateClientId("SYM-OFFLINE")
    const nowIso = new Date().toISOString()
    const symptomPayload = {
      symptoms: symptomsList.length ? symptomsList : ["General weakness / discomfort"],
      description: description.trim(),
      severity: severity || "moderate",
      duration: duration || "today",
      notes: null,
      offline_id: offlineId,
      client_created_at: nowIso,
    }

    // PATH A: If browser is offline, save to IndexedDB pending queue immediately and do not attempt network request
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      try {
        const authUser = getPatientAuthUser()
        await saveOfflineItem({
          type: "symptom_report",
          client_id: offlineId,
          client_created_at: nowIso,
          payload: {
            ...symptomPayload,
            patient_id: authUser?.patient_id || "P-4559",
            patient_name: (authUser && !authUser.doctor_id && !authUser.worker_id) ? (authUser.full_name || authUser.name || "Shreya") : "Shreya",
            village: authUser?.village || "Chandapur",
          },
        })
        setSubmitState("success")
      } catch (offlineErr) {
        console.error("Failed to queue offline symptom:", offlineErr)
        setSubmitState("error")
      }
      return
    }

    // PATH B: Attempt live API submission with offline fallback on network/backend failure
    try {
      await submitPatientSymptoms(symptomPayload)
      setSubmitState("success")
    } catch (err) {
      try {
        const authUser = getPatientAuthUser()
        await saveOfflineItem({
          type: "symptom_report",
          client_id: offlineId,
          client_created_at: nowIso,
          payload: {
            ...symptomPayload,
            patient_id: authUser?.patient_id || "P-4559",
            patient_name: (authUser && !authUser.doctor_id && !authUser.worker_id) ? (authUser.full_name || authUser.name || "Shreya") : "Shreya",
            village: authUser?.village || "Chandapur",
          },
        })
        setSubmitState("success")
      } catch (offlineErr) {
        console.error("Failed to submit symptoms and offline queuing failed:", offlineErr)
        setSubmitState("error")
      }
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
