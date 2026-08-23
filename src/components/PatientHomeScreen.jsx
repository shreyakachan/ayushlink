import { useState, useEffect } from "react"
import { PATIENT_LANGUAGES, patientT } from "../lib/patientI18n.js"
import PatientListenButton from "./PatientListenButton.jsx"
import { getPatientMedicalRecord, getAuthUser } from "../lib/api.js"

/**
 * AyushLink — Patient Home Screen (redesigned)
 * React + JavaScript + Tailwind CSS
 *
 * Designed for rural / tribal patients with limited digital literacy:
 * one flat screen, no sidebar, no bottom nav, no dashboard cards — just a
 * short greeting, a plain-language status line, a very prominent SOS tile,
 * and a small grid of large, icon-led, one-word actions. Loosely inspired
 * by a village-safety app screenshot the user shared, but re-themed for
 * AyushLink's actual healthcare features and given a distinct visual style.
 *
 * caseStatus: "none" | "submitted" | "review" | "prescription"
 */

const STATUS_STYLES = {
  none: { dot: "bg-slate-400", bg: "bg-slate-100", text: "text-slate-600" },
  submitted: { dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700" },
  review: { dot: "bg-blue-500", bg: "bg-blue-50", text: "text-blue-700" },
  prescription: { dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700" },
}

export default function PatientHomeScreen({
  patient: propPatient,
  caseStatus: initialCaseStatus = "review",
  lang = "en",
  onLangChange,
  onSelect,
  onBack,
}) {
  const [patient, setPatient] = useState(() => {
    const auth = getAuthUser()
    return {
      name: propPatient?.full_name || propPatient?.name || auth?.full_name || auth?.name || "Patient",
      patientId: propPatient?.patient_id || auth?.patient_id || "",
      age: propPatient?.age || auth?.age || "",
      gender: propPatient?.gender || auth?.gender || "",
      village: propPatient?.village || auth?.village || "",
      abhaId: propPatient?.abhaId || auth?.abha_id || "",
    }
  })
  const [caseStatus, setCaseStatus] = useState(initialCaseStatus)
  const [sosOpen, setSosOpen] = useState(false)

  useEffect(() => {
    async function loadData() {
      try {
        const authUser = getAuthUser()
        if (authUser?.full_name || authUser?.name) {
          setPatient((p) => ({
            ...p,
            name: authUser.full_name || authUser.name || p.name,
            patientId: authUser.patient_id || p.patientId,
            village: authUser.village || p.village,
            age: authUser.age || p.age,
            abhaId: authUser.abha_id || p.abhaId,
          }))
        }
        const record = await getPatientMedicalRecord()
        if (record) {
          setPatient({
            name: record.full_name || authUser?.full_name || authUser?.name || "Patient",
            patientId: record.patient_id || authUser?.patient_id || "",
            age: record.age || "",
            gender: record.gender ? record.gender.charAt(0).toUpperCase() + record.gender.slice(1) : "",
            village: record.village || "",
            abhaId: record.abha_id || "",
          })
          if (record.status) {
            setCaseStatus(record.status)
          }
        }
      } catch {}
    }
    loadData()
  }, [])
  const t = patientT(lang)

  const statusText = {
    none: t.statusNone,
    submitted: t.statusSubmitted,
    review: t.statusReview,
    prescription: t.statusPrescription,
  }[caseStatus] || t.statusNone
  const statusStyle = STATUS_STYLES[caseStatus] || STATUS_STYLES.none

  const tiles = [
    { id: "patient-call", label: t.talkToDoctor, Icon: VideoIcon, color: "bg-blue-600" },
    { id: "patient-symptoms", label: t.symptomsTitle, Icon: SymptomIcon, color: "bg-teal-600" },
    { id: "patient-prescription", label: t.myPrescription, Icon: RxIcon, color: "bg-sky-600" },
    { id: "patient-medicines", label: t.myMedicines, Icon: PillIcon, color: "bg-violet-600" },
    { id: "patient-health-record", label: t.myHealthRecord, Icon: HeartFileIcon, color: "bg-emerald-600" },
    { id: "patient-contact-asha", label: t.contactAsha, Icon: HeadsetIcon, color: "bg-rose-600" },
    { id: "patient-facilities", label: t.nearbyFacility, Icon: HospitalIcon, color: "bg-orange-600" },
    { id: "patient-family", label: t.familyContacts, Icon: UsersIcon, color: "bg-slate-700" },
  ]

  // Spoken version of the whole screen — greeting, current status, and
  // every option available — so a patient who can't read still knows
  // what's on the page.
  const spokenSummary = `${t.hello}, ${patient.name}. ${t.statusLabel}: ${statusText}. ${tiles
    .map((tile) => tile.label)
    .join(", ")}.`

  return (
    <div className="min-h-dvh w-full bg-slate-50 text-slate-800">
      {/* Header */}
      <header className="bg-blue-700 px-5 py-4 shadow-md sm:px-8 sm:py-5">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              <PlusPulseIcon className="h-6 w-6 text-white" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold leading-tight text-white sm:text-xl">{t.appName}</p>
              <p className="truncate text-xs text-blue-100 sm:text-sm">{t.tagline}</p>
            </div>
          </div>

          {/* Language pills */}
          <div
            className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 p-1"
            role="group"
            aria-label="Language"
          >
            {PATIENT_LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => onLangChange?.(l.code)}
                className={`rounded-full px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm
                  ${lang === l.code ? "bg-white text-blue-700" : "text-blue-50 hover:bg-white/15"}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-6 pb-28 sm:px-8">
        {/* Greeting + status */}
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">
              {t.hello}, <span className="font-semibold text-slate-800">{patient.name}</span>
              {patient.patientId && (
                <span className="ml-2 inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {patient.patientId}
                </span>
              )}
            </p>
            <div
              className={`mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${statusStyle.bg} ${statusStyle.text}`}
            >
              <span className={`h-2 w-2 rounded-full ${statusStyle.dot}`} aria-hidden="true" />
              {statusText}
            </div>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-medium text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
          >
            {t.signOut}
          </button>
        </section>

        {/* SOS — big, unmistakable, top of screen */}
        <button
          type="button"
          onClick={() => setSosOpen(true)}
          className="flex w-full items-center gap-5 rounded-3xl bg-red-600 px-6 py-6 text-left shadow-lg shadow-red-600/30 transition hover:bg-red-700 active:scale-[0.99] sm:px-8 sm:py-8"
        >
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 sm:h-20 sm:w-20">
            <SosIcon className="h-9 w-9 text-white sm:h-11 sm:w-11" />
          </span>
          <span>
            <span className="block text-2xl font-extrabold tracking-wide text-white sm:text-3xl">{t.sos}</span>
            <span className="mt-0.5 block text-sm font-medium text-red-100 sm:text-base">{t.sosSub}</span>
          </span>
        </button>

        {/* Action grid */}
        <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4">
          {tiles.map(({ id, label, Icon, color }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelect?.(id)}
              className="flex min-h-[124px] flex-col items-center justify-center gap-2.5 rounded-3xl bg-white p-4 text-center shadow-sm ring-1 ring-slate-100 transition hover:shadow-md active:scale-[0.98] sm:min-h-[140px]"
            >
              <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${color} sm:h-16 sm:w-16`}>
                <Icon className="h-7 w-7 text-white sm:h-8 sm:w-8" />
              </span>
              <span className="text-sm font-semibold leading-snug text-slate-700 sm:text-base">{label}</span>
            </button>
          ))}
        </section>
      </main>

      {/* SOS confirmation modal */}
      {sosOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sos-confirm-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-6"
        >
          <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-7">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <SosIcon className="h-7 w-7" />
            </span>
            <h2 id="sos-confirm-title" className="mt-4 text-center text-lg font-bold text-slate-800">
              {t.sosConfirmTitle}
            </h2>
            <p className="mt-2 text-center text-sm text-slate-500">{t.sosConfirmDesc}</p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setSosOpen(false)
                  onSelect?.("patient-sos")
                }}
                className="w-full rounded-2xl bg-red-600 py-4 text-base font-bold text-white shadow-lg shadow-red-600/25 transition hover:bg-red-700 active:scale-[0.98]"
              >
                {t.sosYes}
              </button>
              <button
                type="button"
                onClick={() => setSosOpen(false)}
                className="w-full rounded-2xl border border-slate-200 bg-white py-4 text-base font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
              >
                {t.sosCancel}
              </button>
            </div>
          </div>
        </div>
      )}

      <PatientListenButton text={spokenSummary} lang={lang} />
    </div>
  )
}

/* --- Inline icons (no external icon dependency) --- */

function PlusPulseIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h4l2 5 4-10 2 5h6" />
    </svg>
  )
}

function SosIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  )
}

function VideoIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m22 8-6 4 6 4V8z" />
    </svg>
  )
}

function RxIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 21V4a1 1 0 0 1 1-1h6a4.5 4.5 0 0 1 0 9H6" />
      <path d="M11 12l6 9" />
      <path d="M15 17h4" />
    </svg>
  )
}

function SymptomIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 2h6a1 1 0 0 1 1 1v1h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1z" />
      <path d="M8 12h2l1.5 3 2-6L15 12h1" />
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

function HeartFileIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M12 17.5s-3-1.7-3-3.9a1.9 1.9 0 0 1 3.4-1.15c.2.24.35.5.6.5s.4-.26.6-.5A1.9 1.9 0 0 1 17 13.6c0 2.2-3 3.9-3 3.9z" />
    </svg>
  )
}

function HeadsetIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <path d="M21 14a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2z" />
      <path d="M3 14a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" />
      <path d="M17 18v1a2 2 0 0 1-2 2h-3" />
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

function UsersIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
