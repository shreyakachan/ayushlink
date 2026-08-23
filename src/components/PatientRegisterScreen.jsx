import { useState } from "react"
import { PATIENT_LANGUAGES, patientT } from "../lib/patientI18n.js"
import PatientListenButton from "./PatientListenButton.jsx"
import { registerPatient } from "../lib/api.js"

/**
 * AyushLink — Patient Self-Registration Screen
 * React + JavaScript + Tailwind CSS
 *
 * This is a NEW, patient-only account-creation flow — distinct from
 * RegisterPatient.jsx (which is the ASHA worker's tool for registering a
 * patient on the patient's behalf, and is left completely untouched).
 * Collects only the essentials, in large touch-friendly fields, and
 * offers an explicit path for patients who'd rather get in-person help
 * from their ASHA worker instead of filling the form themselves.
 */

const GENDERS = ["male", "female", "other"]

export default function PatientRegisterScreen({ lang = "en", onLangChange, onBack, onRegister, onGetAshaHelp }) {
  const t = patientT(lang)

  const [form, setForm] = useState({
    fullName: "",
    mobile: "",
    password: "",
    age: "",
    gender: "",
    village: "",
    preferredLanguage: lang,
    abhaId: "",
  })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState("")

  const spokenSummary = `${t.registerTitle}. ${t.registerSub}. ${t.ashaHelpTitle}: ${t.ashaHelpDesc}. ${t.fullName}, ${t.mobileNumber}, ${t.age}, ${t.gender}, ${t.villageArea}.`

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
    setApiError("")
  }

  function validate() {
    const next = {}
    if (!form.fullName.trim()) next.fullName = t.requiredField
    if (form.mobile.replace(/\D/g, "").length !== 10) next.mobile = t.invalidPhone
    if (!form.password || form.password.length < 4) next.password = t.invalidPassword || "Password must be at least 4 characters"
    if (!form.age || Number(form.age) <= 0) next.age = t.requiredField
    if (!form.gender) next.gender = t.requiredField
    if (!form.village.trim()) next.village = t.requiredField
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setApiError("")
    try {
      const res = await registerPatient(form)
      onRegister?.(res?.patient || form)
    } catch (err) {
      setApiError(err?.message || "Registration failed. Please check your details.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh w-full bg-slate-50 text-slate-800">
      {/* Header */}
      <header className="bg-blue-700 px-5 py-4 shadow-md sm:px-8 sm:py-5">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label={t.back}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white transition hover:bg-white/25"
            >
              <BackIcon className="h-5 w-5" />
            </button>
            <p className="truncate text-lg font-bold leading-tight text-white sm:text-xl">{t.registerTitle}</p>
          </div>

          <div className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 p-1" role="group" aria-label="Language">
            {PATIENT_LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => onLangChange?.(l.code)}
                className={`rounded-full px-2.5 py-1.5 text-xs font-semibold transition
                  ${lang === l.code ? "bg-white text-blue-700" : "text-blue-50 hover:bg-white/15"}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-8 pb-28 sm:px-8">
        <p className="text-center text-sm text-slate-500">{t.registerSub}</p>

        {/* Register with ASHA help */}
        <button
          type="button"
          onClick={onGetAshaHelp}
          className="flex w-full items-center gap-4 rounded-2xl border border-rose-100 bg-rose-50/70 p-4 text-left transition hover:border-rose-200 hover:bg-rose-50 active:scale-[0.99]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-rose-600 shadow-sm">
            <HeadsetIcon className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-800">{t.ashaHelpTitle}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{t.ashaHelpDesc}</span>
          </span>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-rose-400" />
        </button>

        {apiError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <Field label={t.fullName} icon={UserIcon} error={errors.fullName}>
            <input
              type="text"
              placeholder={t.fullNamePlaceholder}
              value={form.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              className={fieldClass(errors.fullName)}
            />
          </Field>

          <Field label={t.mobileNumber} icon={PhoneIcon} error={errors.mobile}>
            <div className="flex items-stretch gap-2">
              <span className="inline-flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-bold text-slate-600">
                +91
              </span>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="98765 43210"
                value={form.mobile}
                onChange={(e) => update("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))}
                className={`min-w-0 flex-1 ${fieldClass(errors.mobile)}`}
              />
            </div>
          </Field>

          <Field label={t.password || "Password / PIN"} icon={KeyIcon} error={errors.password}>
            <input
              type="password"
              placeholder="4-6 digit PIN or password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              className={fieldClass(errors.password)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t.age} icon={CalendarIcon} error={errors.age}>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="120"
                placeholder={t.agePlaceholder}
                value={form.age}
                onChange={(e) => update("age", e.target.value)}
                className={fieldClass(errors.age)}
              />
            </Field>

            <div className="flex flex-col gap-2">
              <label className="text-base font-semibold text-slate-700">{t.gender}</label>
              <div className="grid grid-cols-1 gap-1.5">
                {GENDERS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => update("gender", g)}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition
                      ${
                        form.gender === g
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-blue-200"
                      }`}
                  >
                    {t[`gender${g[0].toUpperCase()}${g.slice(1)}`]}
                  </button>
                ))}
              </div>
              {errors.gender && <p className="text-sm font-medium text-red-600">{errors.gender}</p>}
            </div>
          </div>

          <Field label={t.villageArea} icon={MapPinIcon} error={errors.village}>
            <input
              type="text"
              placeholder={t.villagePlaceholder}
              value={form.village}
              onChange={(e) => update("village", e.target.value)}
              className={fieldClass(errors.village)}
            />
          </Field>

          <div className="flex flex-col gap-2">
            <label className="text-base font-semibold text-slate-700">{t.preferredLanguage}</label>
            <div className="flex gap-2">
              {PATIENT_LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => update("preferredLanguage", l.code)}
                  className={`flex-1 rounded-2xl border px-3 py-3 text-sm font-semibold transition
                    ${
                      form.preferredLanguage === l.code
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-blue-200"
                    }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <Field label={t.abhaOptional} icon={QrIcon}>
            <input
              type="text"
              inputMode="numeric"
              placeholder={t.abhaPlaceholder}
              value={form.abhaId}
              onChange={(e) => update("abhaId", e.target.value.replace(/\D/g, "").slice(0, 14))}
              className={fieldClass()}
            />
          </Field>

          <button
            type="submit"
            className="mt-2 w-full rounded-2xl bg-blue-600 py-4 text-lg font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 active:scale-[0.98]"
          >
            {t.createAccountBtn}
          </button>

          <p className="text-center text-sm text-slate-500">
            {t.alreadyHaveAccount}{" "}
            <button type="button" onClick={onBack} className="font-bold text-blue-600 hover:text-blue-700">
              {t.signIn}
            </button>
          </p>
        </form>
      </main>
      <PatientListenButton text={spokenSummary} lang={lang} />
    </div>
  )
}

function fieldClass(error) {
  return `w-full rounded-2xl border bg-white px-4 py-4 text-lg text-slate-800 placeholder:text-slate-400
    focus:outline-none focus:ring-4 focus:ring-blue-100
    ${error ? "border-red-400 focus:border-red-500" : "border-slate-200 focus:border-blue-500"}`
}

function Field({ label, icon: Icon, error, children }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-base font-semibold text-slate-700">
        <Icon className="h-4.5 w-4.5 text-blue-600" />
        {label}
      </label>
      {children}
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
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

function CalendarIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

function MapPinIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function QrIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v.01M17 20v.01M20 20v.01" />
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

function ChevronRightIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function KeyIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </svg>
  )
}
