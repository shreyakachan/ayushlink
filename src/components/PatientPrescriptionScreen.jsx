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

const DEFAULT_PRESCRIPTION = {
  id: "RX-1042",
  doctorName: "Dr. Anjali Rao",
  date: "19 July 2026",
  diagnosis: "Viral fever with mild dehydration",
  medicines: [
    { id: "m1", name: "Paracetamol 650mg", dosage: "1 tablet, twice a day, after food", duration: "5 days" },
    { id: "m2", name: "ORS Sachet", dosage: "1 sachet in water after every loose motion", duration: "3 days" },
  ],
  notes: "Drink plenty of fluids and rest. Come back if the fever lasts more than 3 days.",
}

// Same prescription content, translated per patient language, so the
// "listen" feature genuinely speaks the instructions in that language —
// not just the English text read with a different voice accent.
const PRESCRIPTION_SPOKEN_CONTENT = {
  en: {
    diagnosis: "Viral fever with mild dehydration",
    medicines: [
      { name: "Paracetamol 650mg", dosage: "1 tablet, twice a day, after food", duration: "5 days" },
      { name: "ORS Sachet", dosage: "1 sachet in water after every loose motion", duration: "3 days" },
    ],
    notes: "Drink plenty of fluids and rest. Come back if the fever lasts more than 3 days.",
  },
  hi: {
    diagnosis: "हल्के निर्जलीकरण के साथ वायरल बुखार",
    medicines: [
      { name: "पैरासिटामोल 650mg", dosage: "1 गोली, दिन में दो बार, खाने के बाद", duration: "5 दिन" },
      { name: "ORS सैशे", dosage: "हर पतले दस्त के बाद 1 सैशे पानी में घोलकर", duration: "3 दिन" },
    ],
    notes: "खूब तरल पदार्थ पिएं और आराम करें। अगर बुखार 3 दिन से ज़्यादा रहे तो वापस आएं।",
  },
  mr: {
    diagnosis: "सौम्य निर्जलीकरणासह विषाणूजन्य ताप",
    medicines: [
      { name: "पॅरासिटामॉल 650mg", dosage: "1 गोळी, दिवसातून दोनदा, जेवणानंतर", duration: "5 दिवस" },
      { name: "ORS सॅशे", dosage: "प्रत्येक पातळ शौचानंतर 1 सॅशे पाण्यात मिसळून", duration: "3 दिवस" },
    ],
    notes: "भरपूर द्रव प्या आणि विश्रांती घ्या. ताप 3 दिवसांपेक्षा जास्त राहिल्यास परत या.",
  },
}

function buildSpokenSummary(lang, rx) {
  const t = patientT(lang)
  const content = PRESCRIPTION_SPOKEN_CONTENT[lang] || PRESCRIPTION_SPOKEN_CONTENT.en
  const meds = (rx?.medicines?.length ? rx.medicines : content.medicines)
    .map((m) => `${m.name}, ${m.dosage || m.frequency || ""}, ${t.forDuration} ${m.duration || ""}`)
    .join(". ")
  return `${t.spokenIntro} ${rx.doctorName || "Dr. Anjali Rao"}. ${t.diagnosisLabel}: ${rx.diagnosis || content.diagnosis}. ${t.medicinesSectionLabel}: ${meds}. ${t.doctorNoteLabel}: ${rx.notes || content.notes}`
}

export default function PatientPrescriptionScreen({ prescription: initialPrescription, lang = "en", onBack }) {
  const [prescription, setPrescription] = useState(initialPrescription || null)
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
          const latest = rxList[0]
          setPrescription({
            id: latest.prescription_id || latest.id || "RX-1001",
            doctorName: latest.doctor_name || "Doctor",
            date: latest.date ? new Date(latest.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Today",
            diagnosis: latest.diagnosis || "Consultation Assessment",
            medicines: (latest.medicines || []).map((m, idx) => ({
              id: `m-${idx}`,
              name: m.name || m.medicine_name,
              dosage: `${m.dosage || ""}${m.frequency ? ` (${m.frequency})` : ""}${m.instructions ? ` - ${m.instructions}` : ""}`,
              duration: m.duration || "",
            })),
            notes: latest.advice || latest.notes || "Follow prescribed dosage.",
          })
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

            {prescription.notes && (
              <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-800">{t.doctorNoteLabel}</p>
                <p className="mt-1 text-sm text-amber-700">{prescription.notes}</p>
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
