import { patientT } from "../lib/patientI18n.js"
import PatientListenButton from "./PatientListenButton.jsx"

/**
 * AyushLink — Patient "Nearby Hospital / PHC" screen
 * React + JavaScript + Tailwind CSS
 * Plain informational list of nearby facilities with real tel: call
 * buttons. This is the non-emergency counterpart to EmergencySOSScreen
 * (which is reused, unmodified, for the SOS flow).
 */

const FACILITIES = [
  { id: "F-1", name: "Chandapur Primary Health Centre", type: "PHC", distance: "1.2", phone: "+91 79999 11111" },
  { id: "F-2", name: "Nandgaon Community Hospital", type: "Hospital", distance: "4.8", phone: "+91 79999 22222" },
  { id: "F-3", name: "108 Ambulance Service", type: "Ambulance", distance: null, phone: "108" },
]

const TYPE_COLOR = {
  PHC: "bg-orange-50 text-orange-600",
  Hospital: "bg-orange-50 text-orange-600",
  Ambulance: "bg-red-50 text-red-600",
}

export default function PatientFacilitiesScreen({ facilities = FACILITIES, lang = "en", onBack }) {
  const t = patientT(lang)
  const spokenSummary = [
    t.facilityTitle + ".",
    facilities.map((f) => `${f.name}${f.distance ? `, ${f.distance} ${t.km}` : ""}.`).join(" "),
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
            <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">{t.facilityTitle}</h1>
            <p className="text-sm text-slate-500">{t.facilitySub}</p>
          </div>
        </header>

        <ul className="flex flex-col gap-4">
          {facilities.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6"
            >
              <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${TYPE_COLOR[f.type] || "bg-orange-50 text-orange-600"}`}>
                {f.type === "Ambulance" ? <AmbulanceIcon className="h-7 w-7" /> : <HospitalIcon className="h-7 w-7" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-slate-800">{f.name}</p>
                {f.distance && (
                  <p className="mt-0.5 text-sm text-slate-500">
                    {f.distance} {t.km}
                  </p>
                )}
              </div>
              <a
                href={`tel:${f.phone.replace(/\s+/g, "")}`}
                aria-label={`${t.call} ${f.name}`}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-sm transition hover:bg-orange-700 active:scale-95"
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

function HospitalIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 21V7l8-4 8 4v14" />
      <path d="M9 21v-4h6v4" />
      <path d="M12 8v4M10 10h4" />
    </svg>
  )
}

function AmbulanceIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 17V8a1 1 0 0 1 1-1h9l4 4h3a1 1 0 0 1 1 1v5" />
      <path d="M3 17h1m16 0h1" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
      <path d="M9 8v6M6 11h6" />
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
