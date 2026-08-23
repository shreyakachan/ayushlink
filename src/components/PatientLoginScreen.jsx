import { useState } from "react"
import { PATIENT_LANGUAGES, patientT } from "../lib/patientI18n.js"
import PatientListenButton from "./PatientListenButton.jsx"
import { loginPatient } from "../lib/api.js"

/**
 * AyushLink — Patient Login Screen (Password / PIN Auth, No OTP, No Offline Auth)
 * React + JavaScript + Tailwind CSS
 * Minimal, accessible authentication: Phone Number + Password/PIN + Login + Create Account.
 */
export default function PatientLoginScreen({
  lang = "en",
  onLangChange,
  onLogin,
  onCreateAccount,
  onBack,
}) {
  const t = patientT(lang)
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const phoneValid = phone.replace(/\D/g, "").length === 10
  const passwordValid = password.trim().length >= 4

  const spokenSummary = `${t.loginHeading}. ${t.loginSub}. ${t.phoneLabel}, ${t.passwordLabel}.`

  function formatPhone(value) {
    const digits = value.replace(/\D/g, "").slice(0, 10)
    if (digits.length <= 5) return digits
    return `${digits.slice(0, 5)} ${digits.slice(5)}`
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!phoneValid) {
      setError(t.invalidPhone)
      return
    }
    if (!passwordValid) {
      setError(t.invalidPassword)
      return
    }

    setLoading(true)
    setError("")

    const cleanPhone = phone.replace(/\D/g, "").slice(-10)

    try {
      const res = await loginPatient(cleanPhone, password.trim())
      onLogin?.(res?.patient || { phone: `+91 ${cleanPhone}`, lang })
    } catch (err) {
      setError(err?.message || "Login failed. Please check your mobile number and PIN/password.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh w-full bg-slate-50 text-slate-800">
      {/* Header */}
      <header className="bg-blue-700 px-5 py-4 shadow-md sm:px-8 sm:py-5">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label={t.back || "Back"}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white transition hover:bg-white/25 active:scale-95"
              >
                <BackIcon className="h-5 w-5" />
              </button>
            )}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              <PlusPulseIcon className="h-6 w-6 text-white" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold leading-tight text-white sm:text-xl">{t.appName}</p>
              <p className="truncate text-xs text-blue-100 sm:text-sm">{t.tagline}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 p-1" role="group" aria-label="Language">
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

      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-8 pb-28 sm:px-8">
        {/* Healthcare illustration */}
        <div className="flex justify-center">
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-blue-50">
            <HealthIcon className="h-12 w-12 text-blue-600" />
          </span>
        </div>

        <header className="text-center">
          <p className="text-sm font-semibold text-blue-600">{t.loginWelcome}</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight text-slate-800">{t.loginHeading}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{t.loginSub}</p>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="patient-phone" className="text-base font-semibold text-slate-700">
              {t.phoneLabel}
            </label>
            <div className="flex items-stretch gap-2">
              <span className="inline-flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-bold text-slate-600">
                +91
              </span>
              <input
                id="patient-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="98765 43210"
                value={formatPhone(phone)}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                  setError("")
                }}
                className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-lg
                           tracking-wide text-slate-800 placeholder:text-slate-400 focus:border-blue-500
                           focus:outline-none focus:ring-4 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="patient-password" className="text-base font-semibold text-slate-700">
              {t.passwordLabel}
            </label>
            <input
              id="patient-password"
              type="password"
              placeholder={t.passwordPlaceholder}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError("")
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-lg
                         tracking-wide text-slate-800 placeholder:text-slate-400 focus:border-blue-500
                         focus:outline-none focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !phoneValid || !passwordValid}
            className="w-full rounded-2xl bg-blue-600 py-4 text-lg font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : t.loginBtn}
          </button>
        </form>

        {/* New patient link */}
        <p className="mt-2 text-center text-sm text-slate-500">
          {t.newPatient}{" "}
          <button type="button" onClick={onCreateAccount} className="font-bold text-blue-600 hover:text-blue-700">
            {t.createAccount}
          </button>
        </p>
      </main>
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

function PlusPulseIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h4l2 5 4-10 2 5h6" />
    </svg>
  )
}

function HealthIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 14c1.5-1.5 3-3.5 3-5.5A4.5 4.5 0 0 0 17.5 4c-1.7 0-3 .8-3.5 2-.5-1.2-1.8-2-3.5-2A4.5 4.5 0 0 0 6 9.5c0 2 1.5 4 3 5.5l6 6z" />
      <path d="M3 20h4l1.5-3L11 20h2l1.5-3L16 20h5" />
    </svg>
  )
}
