import { useState, useEffect } from "react"
import { patientT } from "../lib/patientI18n.js"
import PatientListenButton from "./PatientListenButton.jsx"
import { getPatientMedicalRecord } from "../lib/api.js"

/**
 * AyushLink — Patient "My Health Record" screen
 * React + JavaScript + Tailwind CSS
 * A simple, read-only snapshot of the patient's health details — no
 * charts, no dense tables. Large labels and plain values only.
 */

const DEFAULT_RECORD = {
  bloodGroup: null,
  allergies: [],
  chronicConditions: [],
  pastVisits: [],
}

export default function PatientHealthRecordScreen({ record: initialRecord, lang = "en", onBack }) {
  const [record, setRecord] = useState(initialRecord || DEFAULT_RECORD)
  const t = patientT(lang)

  useEffect(() => {
    async function loadRecord() {
      try {
        const data = await getPatientMedicalRecord()
        if (data) {
          setRecord({
            bloodGroup: data.blood_group || null,
            allergies: data.allergies || [],
            chronicConditions: data.chronic_conditions || [],
            pastVisits: data.medical_history || [],
          })
        }
      } catch {}
    }
    loadRecord()
  }, [])

  const spokenSummary = [
    t.healthTitle + ".",
    `${t.bloodGroup}: ${record.bloodGroup || t.none2}.`,
    `${t.allergies}: ${record.allergies?.length ? record.allergies.join(", ") : t.none2}.`,
    `${t.chronicConditions}: ${record.chronicConditions?.length ? record.chronicConditions.join(", ") : t.none2}.`,
    `${t.pastVisits}: ${
      record.pastVisits?.length
        ? record.pastVisits.map((v) => `${v.reason}, ${v.date}`).join(". ")
        : t.none2
    }.`,
  ].join(" ")

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
            <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">{t.healthTitle}</h1>
            <p className="text-sm text-slate-500">{t.healthSub}</p>
          </div>
        </header>

        {/* Quick facts */}
        <section className="grid grid-cols-2 gap-3.5">
          <div className="rounded-3xl border border-slate-100 bg-white p-5 text-center shadow-sm">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <DropIcon className="h-6 w-6" />
            </span>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.bloodGroup}</p>
            <p className="mt-0.5 text-xl font-bold text-slate-800">{record.bloodGroup || "—"}</p>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-white p-5 text-center shadow-sm">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <AlertIcon className="h-6 w-6" />
            </span>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.allergies}</p>
            <p className="mt-0.5 text-base font-semibold text-slate-800">
              {record.allergies?.length ? record.allergies.join(", ") : t.none2}
            </p>
          </div>
        </section>

        {/* Chronic conditions */}
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-bold text-slate-800">{t.chronicConditions}</h2>
          <p className="mt-1.5 text-sm text-slate-600">
            {record.chronicConditions?.length ? record.chronicConditions.join(", ") : t.none2}
          </p>
        </section>

        {/* Past visits */}
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-bold text-slate-800">{t.pastVisits}</h2>
          {record.pastVisits?.length ? (
            <ul className="mt-3 flex flex-col gap-3">
              {record.pastVisits.map((v) => (
                <li key={v.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <CalendarIcon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{v.reason}</p>
                    <p className="text-xs text-slate-500">{v.date}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-sm text-slate-600">{t.none2}</p>
          )}
        </section>
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

function DropIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2s6 7.5 6 12a6 6 0 0 1-12 0c0-4.5 6-12 6-12z" />
    </svg>
  )
}

function AlertIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function CalendarIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}
