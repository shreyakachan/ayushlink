import { useState, useEffect } from "react"
import { patientT } from "../lib/patientI18n.js"
import PatientListenButton from "./PatientListenButton.jsx"
import { getPatientPrescriptions } from "../lib/api.js"

/**
 * AyushLink — Patient "My Medicines" screen
 * React + JavaScript + Tailwind CSS
 * Read-only, plain-language view of the patient's current medicines
 * (drawn from their latest prescription).
 */

export default function PatientMedicinesScreen({ medicines: propMeds, lang = "en", onBack }) {
  const [medicines, setMedicines] = useState(propMeds || [])
  const t = patientT(lang)

  useEffect(() => {
    async function loadMedicines() {
      try {
        const rxList = await getPatientPrescriptions()
        if (Array.isArray(rxList) && rxList.length > 0) {
          const allMeds = []
          rxList.forEach((rx) => {
            (rx.medicines || []).forEach((m, idx) => {
              allMeds.push({
                id: `${rx.prescription_id || rx.id}-${idx}`,
                name: m.name || m.medicine_name,
                dosage: `${m.dosage || ""}${m.frequency ? ` (${m.frequency})` : ""}${m.instructions ? ` - ${m.instructions}` : ""}`,
                duration: m.duration || "",
              })
            })
          })
          setMedicines(allMeds)
        } else {
          setMedicines([])
        }
      } catch {
        setMedicines([])
      }
    }
    loadMedicines()
  }, [])

  const spokenSummary = medicines.length
    ? [
        t.medicinesTitle + ".",
        medicines
          .map((m) => `${m.name}. ${t.dosage}: ${m.dosage}. ${t.duration}: ${m.duration}.`)
          .join(" "),
      ].join(" ")
    : `${t.medicinesTitle}. ${t.medicinesEmpty}`

  return (
    <div className="min-h-dvh w-full bg-slate-50 text-slate-800">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-6 pb-28 sm:px-8">
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={t.back}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-slate-50 hover:text-blue-600"
          >
            <BackIcon className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">{t.medicinesTitle}</h1>
            <p className="text-sm text-slate-500">{t.medicinesSub}</p>
          </div>
        </header>

        {medicines.length === 0 ? (
          <p className="rounded-3xl border border-slate-100 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
            {t.medicinesEmpty}
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {medicines.map((m) => (
              <li
                key={m.id}
                className="flex items-start gap-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6"
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                  <PillIcon className="h-7 w-7" />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-bold text-slate-800 sm:text-lg">{m.name}</p>
                  <p className="mt-1 text-sm text-slate-600 sm:text-base">
                    <span className="font-semibold text-slate-500">{t.dosage}: </span>
                    {m.dosage}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    <span className="font-semibold">{t.duration}: </span>
                    {m.duration}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <PatientListenButton text={spokenSummary} lang={lang} />
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

function PillIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.5 20.5a4.95 4.95 0 0 1-7-7l6-6a4.95 4.95 0 0 1 7 7z" />
      <path d="m8.5 8.5 7 7" />
    </svg>
  )
}
