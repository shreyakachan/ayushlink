import { patientT } from "../lib/patientI18n.js"
import PatientListenButton from "./PatientListenButton.jsx"

/**
 * AyushLink — Patient "Contact ASHA" screen
 * React + JavaScript + Tailwind CSS
 * Shows the patient's assigned ASHA worker with one very large, real
 * "Call" action (tel: link — uses the device's own dialer, no fake API).
 */

const ASHA_WORKER = {
  name: "Meena Kamble",
  phone: "+91 98765 43210",
  village: "Chandapur",
}

export default function PatientContactAshaScreen({ worker = ASHA_WORKER, lang = "en", onBack }) {
  const t = patientT(lang)
  const telHref = `tel:${worker.phone.replace(/\s+/g, "")}`
  const spokenSummary = `${t.ashaTitle}. ${worker.name}. ${t.village}: ${worker.village}. ${t.call} ${worker.phone}.`

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
            <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">{t.ashaTitle}</h1>
            <p className="text-sm text-slate-500">{t.ashaSub}</p>
          </div>
        </header>

        <section className="flex flex-col items-center gap-4 rounded-3xl border border-rose-100 bg-white p-8 text-center shadow-sm">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <HeadsetIcon className="h-10 w-10" />
          </span>
          <div>
            <p className="text-xl font-bold text-slate-800">{worker.name}</p>
            <p className="mt-1 text-sm text-slate-500">
              {t.village}: {worker.village}
            </p>
          </div>

          <a
            href={telHref}
            className="mt-2 flex w-full items-center justify-center gap-3 rounded-2xl bg-rose-600 py-4 text-lg font-bold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-700 active:scale-[0.98]"
          >
            <PhoneIcon className="h-6 w-6" />
            {t.call} {worker.phone}
          </a>
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

function PhoneIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}
