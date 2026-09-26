import { useState, useEffect } from "react"
import { PATIENT_LANGUAGES, patientT } from "../lib/patientI18n.js"
import usePatientSpeech from "../hooks/usePatientSpeech.js"
import { getPatientPrescriptions } from "../lib/api.js"

/**
 * AyushLink — Patient Prescription Screen
 * React + JavaScript + Tailwind CSS
 *
 * Shows the doctor's prescription in plain text, plus a real, fully-offline
 * "listen" feature built on the browser's native SpeechSynthesis API (via
 * the shared usePatientSpeech hook) — no backend TTS call needed. This is a
 * genuine stand-in for the generative "AI reads the prescription aloud in
 * the patient's language" step: swap the `speak()` call for an audio
 * element pointing at a server-generated file once the backend TTS
 * pipeline (see prompt #10) exists.
 */

function buildSpokenSummary(lang, rx) {
  if (!rx) return ""
  const t = patientT(lang)
  const meds = (rx.medicines || [])
    .map((m) => `${m.name}, ${m.dosage || m.frequency || ""}, ${t.forDuration} ${m.duration || ""}`)
    .join(". ")
  let summary = `${t.spokenIntro} ${rx.doctorName || "Doctor"}.`
  if (rx.diagnosis) {
    summary += ` ${t.diagnosisLabel}: ${rx.diagnosis}.`
  }
  if (rx.notes) {
    summary += ` ${t.examinationFindingsLabel || t.doctorNoteLabel}: ${rx.notes}.`
  }
  if (meds) {
    summary += ` ${t.medicinesSectionLabel}: ${meds}.`
  }
  if (rx.advice) {
    summary += ` ${t.doctorAdviceLabel || t.doctorNoteLabel}: ${rx.advice}.`
  }
  return summary
}

function formatPrescription(latest) {
  if (!latest) return null
  return {
    id: latest.prescription_id || latest.id || "RX-1001",
    doctorName: latest.doctor_name || latest.doctorName || "Doctor",
    date: latest.date
      ? new Date(latest.date).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "Today",
    diagnosis: latest.diagnosis || "Consultation Assessment",
    medicines: (latest.medicines || []).map((m, idx) => ({
      id: m.id || `m-${idx}`,
      name: m.name || m.medicine_name,
      dosage: `${m.dosage || ""}${m.frequency ? ` (${m.frequency})` : ""}${m.instructions ? ` - ${m.instructions}` : ""}`,
      duration: m.duration || "",
    })),
    notes: latest.notes || "",
    advice: latest.advice || latest.instructions || "",
  }
}

export default function PatientPrescriptionScreen({ prescription: initialPrescription, lang = "en", onBack }) {
  const [prescription, setPrescription] = useState(initialPrescription ? formatPrescription(initialPrescription) : null)
  const [loading, setLoading] = useState(true)
  const t = patientT(lang)
  const langLabel = PATIENT_LANGUAGES.find((l) => l.code === lang)?.label
  const { speak, stop, speaking, supported, voiceAvailable } = usePatientSpeech(lang)

  useEffect(() => {
    async function loadRx() {
      try {
        setLoading(true)
        const rxList = await getPatientPrescriptions()
        if (Array.isArray(rxList) && rxList.length > 0) {
          setPrescription(formatPrescription(rxList[0]))
        } else {
          setPrescription(null)
        }
      } catch {
        setPrescription(null)
      } finally {
        setLoading(false)
      }
    }
    loadRx()
  }, [])

  return (
    <div className="min-h-dvh w-full bg-slate-50 text-slate-800">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6 pb-24 lg:px-8">
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={t.back}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-slate-50 hover:text-blue-600"
          >
            <BackIcon className="h-6 w-6" />
          </button>
          <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">{t.prescriptionHeading}</h1>
        </header>

        {/* Listen card */}
        <section className="rounded-3xl border border-blue-100 bg-blue-600 p-6 text-white shadow-sm">
          <p className="text-sm font-medium text-blue-100">{t.listenPrompt}</p>
          <p className="mt-1 text-lg font-bold">{t.listenHeading}</p>
          {langLabel && (
            <p className="mt-1 text-sm text-blue-100">
              {t.listenLangNote} <span className="font-semibold text-white">{langLabel}</span>
            </p>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={speaking ? stop : () => speak(buildSpokenSummary(lang, prescription))}
              disabled={!supported}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-4 text-base font-bold text-blue-700 shadow-sm transition hover:bg-blue-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {speaking ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
              {speaking ? t.stopListening : t.playInstructions}
            </button>
            {speaking && (
              <span className="inline-flex items-center gap-1.5 text-sm text-blue-100">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                {t.readingAloud}
              </span>
            )}
          </div>
          {!supported && (
            <p className="mt-3 text-xs text-blue-100">
              {t.voiceUnsupported}
            </p>
          )}
          {supported && !voiceAvailable && (
            <p className="mt-3 text-xs text-blue-100">
              {t.voiceLangUnavailable}
            </p>
          )}
        </section>

        {/* Prescription details */}
        {prescription ? (
          <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <p className="text-sm text-slate-500">{t.prescriptionIdLabel}</p>
                <p className="text-base font-bold text-slate-800">{prescription.id}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">{prescription.date}</p>
                <p className="text-base font-semibold text-slate-800">{prescription.doctorName}</p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-500">{t.diagnosisLabel}</p>
              <p className="mt-1 text-base text-slate-800">{prescription.diagnosis}</p>
            </div>

            <div className="mt-5">
              <p className="text-sm font-semibold text-slate-500">{t.medicinesSectionLabel}</p>
              {prescription.medicines?.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-3">
                  {prescription.medicines.map((m) => (
                    <li key={m.id} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                        <PillIcon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{m.name}</p>
                        <p className="text-sm text-slate-500">{m.dosage}</p>
                        {m.duration && <p className="text-xs font-medium text-slate-400">{t.forDuration} {m.duration}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-400">{t.medicinesEmpty || "No medicines listed."}</p>
              )}
            </div>

            {/* Doctor's Notes & Examination Findings */}
            {prescription.notes && (
              <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                <p className="text-sm font-semibold text-sky-900">{t.examinationFindingsLabel || "Doctor's Notes & Examination Findings"}</p>
                <p className="mt-1 text-sm text-sky-800 leading-relaxed whitespace-pre-line">{prescription.notes}</p>
              </div>
            )}

            {/* Doctor's Advice & Dietary Guidelines */}
            {prescription.advice && (
              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">{t.doctorAdviceLabel || "Doctor's Advice & Dietary Guidelines"}</p>
                <p className="mt-1 text-sm text-amber-800 leading-relaxed whitespace-pre-line">{prescription.advice}</p>
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-sm">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
              <PillIcon className="h-7 w-7" />
            </span>
            <p className="mt-3 text-base font-bold text-slate-700">{t.none || "No Prescriptions Found"}</p>
            <p className="mt-1 text-sm text-slate-500">{t.medicinesEmpty || "No active prescriptions have been issued for this account yet."}</p>
          </section>
        )}
      </div>
    </div>
  )
}

/* --- Inline icons --- */

function BackIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  )
}

function PlayIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  )
}

function PillIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.5 20.5a4.95 4.95 0 0 1-7-7l6-6a4.95 4.95 0 0 1 7 7z" />
      <path d="m8.5 8.5 7 7" />
    </svg>
  )
}
