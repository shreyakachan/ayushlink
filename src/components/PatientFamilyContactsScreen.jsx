import { patientT } from "../lib/patientI18n.js"
import PatientListenButton from "./PatientListenButton.jsx"

/**
 * AyushLink — Patient "Family Contacts" screen
 * React + JavaScript + Tailwind CSS
 * Simple list of trusted contacts with real tel: call buttons.
 */

const CONTACTS = [
  { id: "c1", name: "Ramesh (Husband)", phone: "+91 98111 22333" },
  { id: "c2", name: "Geeta (Daughter)", phone: "+91 98222 33444" },
]

export default function PatientFamilyContactsScreen({ contacts = CONTACTS, lang = "en", onBack }) {
  const t = patientT(lang)
  const spokenSummary = [t.familyTitle + ".", contacts.map((c) => `${c.name}.`).join(" ")].join(" ")

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
            <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">{t.familyTitle}</h1>
            <p className="text-sm text-slate-500">{t.familySub}</p>
          </div>
        </header>

        <ul className="flex flex-col gap-4">
          {contacts.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                <UserIcon className="h-7 w-7" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-slate-800">{c.name}</p>
                <p className="mt-0.5 text-sm text-slate-500">{c.phone}</p>
              </div>
              <a
                href={`tel:${c.phone.replace(/\s+/g, "")}`}
                aria-label={`${t.call} ${c.name}`}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-700 text-white shadow-sm transition hover:bg-slate-800 active:scale-95"
              >
                <PhoneIcon className="h-5 w-5" />
              </a>
            </li>
          ))}
        </ul>
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

function UserIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function PhoneIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}
