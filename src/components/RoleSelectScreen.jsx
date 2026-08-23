import { useState } from "react"
import { PATIENT_LANGUAGES, patientT } from "../lib/patientI18n.js"
import PatientListenButton from "./PatientListenButton.jsx"

/**
 * AyushLink — Role Selection
 * React + JavaScript + Tailwind CSS
 *
 * Shown once, right after the splash screen, so the same app shell can
 * branch into the ASHA worker console or the patient view. Visual design
 * matches the redesigned patient-side screens (large touch targets, big
 * icons, minimal text, visible language switcher) while keeping both
 * roles, the exact onSelectRole("asha" | "patient") contract, and all
 * downstream routing untouched.
 */
export default function RoleSelectScreen({ onSelectRole, lang = "en", onLangChange }) {
  const [internalLang, setInternalLang] = useState(lang)
  const currentLang = onLangChange ? lang : internalLang
  const setLang = onLangChange || setInternalLang
  const t = patientT(currentLang)
  const spokenSummary = `${t.roleSelectPrompt}. ${t.ashaRoleTitle}: ${t.ashaRoleDesc}. ${t.patientRoleTitle}: ${t.patientRoleDesc}.`

  return (
    <div className="min-h-dvh w-full bg-slate-50 text-slate-800">
      {/* Header — mirrors the patient home screen's header language */}
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
                onClick={() => setLang(l.code)}
                className={`rounded-full px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm
                  ${currentLang === l.code ? "bg-white text-blue-700" : "text-blue-50 hover:bg-white/15"}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8 pb-28 sm:px-8 sm:py-10">
        <h1 className="text-center text-lg font-bold text-slate-700 sm:text-xl">{t.roleSelectPrompt}</h1>

        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => onSelectRole?.("asha")}
            className="flex w-full items-center gap-5 rounded-3xl bg-white p-6 text-left shadow-sm ring-1 ring-slate-100 transition hover:shadow-md hover:ring-blue-200 active:scale-[0.99] sm:p-7"
          >
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-600 sm:h-20 sm:w-20">
              <StethoscopeIcon className="h-8 w-8 text-white sm:h-9 sm:w-9" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold text-slate-800 sm:text-xl">{t.ashaRoleTitle}</span>
              <span className="mt-1 block text-sm leading-snug text-slate-500 sm:text-base">{t.ashaRoleDesc}</span>
            </span>
            <ChevronRightIcon className="h-6 w-6 shrink-0 text-slate-300" />
          </button>

          <button
            type="button"
            onClick={() => onSelectRole?.("doctor")}
            className="flex w-full items-center gap-5 rounded-3xl bg-white p-6 text-left shadow-sm ring-1 ring-slate-100 transition hover:shadow-md hover:ring-emerald-200 active:scale-[0.99] sm:p-7"
          >
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 sm:h-20 sm:w-20">
              <StethoscopeIcon className="h-8 w-8 text-white sm:h-9 sm:w-9" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold text-slate-800 sm:text-xl">{t.doctorRoleTitle}</span>
              <span className="mt-1 block text-sm leading-snug text-slate-500 sm:text-base">{t.doctorRoleDesc}</span>
            </span>
            <ChevronRightIcon className="h-6 w-6 shrink-0 text-slate-300" />
          </button>

          <button
            type="button"
            onClick={() => onSelectRole?.("patient")}
            className="flex w-full items-center gap-5 rounded-3xl bg-white p-6 text-left shadow-sm ring-1 ring-slate-100 transition hover:shadow-md hover:ring-sky-200 active:scale-[0.99] sm:p-7"
          >
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-sky-600 sm:h-20 sm:w-20">
              <UserHeartIcon className="h-8 w-8 text-white sm:h-9 sm:w-9" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold text-slate-800 sm:text-xl">{t.patientRoleTitle}</span>
              <span className="mt-1 block text-sm leading-snug text-slate-500 sm:text-base">{t.patientRoleDesc}</span>
            </span>
            <ChevronRightIcon className="h-6 w-6 shrink-0 text-slate-300" />
          </button>
        </div>
      </main>
      <PatientListenButton text={spokenSummary} lang={currentLang} />
    </div>
  )
}

/* --- Inline icons --- */

function PlusPulseIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h4l2 5 4-10 2 5h6" />
    </svg>
  )
}

function StethoscopeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.8 2.3A2 2 0 0 0 3 4v6a5 5 0 0 0 10 0V4" />
      <path d="M8 15v1a6 6 0 0 0 12 0v-3" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  )
}

function UserHeartIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 21a8 8 0 0 1 11.4-7.2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M16.5 20.5 15 19a2.7 2.7 0 1 1 3.5-4 2.7 2.7 0 1 1 3.5 4l-4 3.5z" />
    </svg>
  )
}

function ChevronRightIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}
