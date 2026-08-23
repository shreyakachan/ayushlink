import { useState } from "react"
import { ASHA_LANGUAGES, ashaT } from "../lib/ashaI18n.js"
import { registerAsha } from "../lib/api.js"

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
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export default function AshaRegisterScreen({ lang = "en", onLangChange, onBack, onRegister, onLoginClick }) {
  const t = ashaT(lang)
  const [form, setForm] = useState({
    fullName: "",
    mobile: "",
    password: "",
    assignedVillages: "Chandapur, Nandgaon",
    primaryPhc: "Chandapur PHC",
    preferredLanguage: lang,
  })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState("")

  function update(field, val) {
    setForm((prev) => ({ ...prev, [field]: val }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
    setApiError("")
  }

  function validate() {
    const errs = {}
    if (!form.fullName.trim()) errs.fullName = "Full name is required"
    const cleanMobile = form.mobile.replace(/\D/g, "")
    if (cleanMobile.length !== 10) errs.mobile = "Valid 10-digit mobile number required"
    if (!form.password || form.password.length < 4) errs.password = "Password/PIN must be at least 4 characters"
    if (!form.assignedVillages.trim()) errs.assignedVillages = "Assigned villages are required"
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    setApiError("")

    try {
      const villages = form.assignedVillages.split(",").map((v) => v.trim()).filter(Boolean)
      const res = await registerAsha({
        full_name: form.fullName.trim(),
        phone: form.mobile,
        password: form.password,
        assigned_villages: villages,
        primary_phc: form.primaryPhc.trim(),
        preferred_language: form.preferredLanguage,
      })
      onRegister?.(res?.asha_worker || form)
    } catch (err) {
      setApiError(err.message || "Registration failed. Please check your details.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-dvh w-full items-stretch justify-center overflow-hidden bg-gradient-to-b from-sky-50 via-white to-blue-50 md:items-center md:p-6">
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -right-16 h-80 w-80 rounded-full bg-blue-200/40 blur-3xl" />

      <section className="relative z-10 flex w-full flex-col px-6 py-8 md:max-w-md md:gap-6 md:rounded-3xl md:border md:border-blue-100 md:bg-white/85 md:px-10 md:py-10 md:shadow-xl md:shadow-blue-900/5 md:backdrop-blur">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-slate-50 hover:text-blue-600"
              >
                <BackIcon className="h-5 w-5" />
              </button>
            )}
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/30">
              <PlusPulseIcon className="h-6 w-6 text-white" />
            </span>
            <span className="text-xl font-bold tracking-tight text-slate-800">
              Ayush<span className="text-blue-600">Link</span>
            </span>
          </div>

          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-1">
            {ASHA_LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => onLangChange?.(l.code)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                  lang === l.code ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-white/80"
                }`}
              >
                {l.native}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <header className="mt-6 md:mt-2">
          <p className="text-sm font-medium text-blue-600">ASHA Worker Portal</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-800">Create Account</h1>
          <p className="mt-1 text-sm text-slate-500">Register to manage village patients, offline records & digital prescriptions.</p>
        </header>

        {apiError && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Full Name *</label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              placeholder="e.g. Meena Ingle"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none"
            />
            {errors.fullName && <p className="mt-1 text-xs text-red-600">{errors.fullName}</p>}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Mobile Number (10 digits) *</label>
            <div className="mt-1 flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
              <span className="font-semibold text-slate-400">+91</span>
              <input
                type="tel"
                value={form.mobile}
                onChange={(e) => update("mobile", e.target.value)}
                placeholder="98765 43210"
                className="ml-2 w-full text-base text-slate-800 bg-transparent focus:outline-none"
              />
            </div>
            {errors.mobile && <p className="mt-1 text-xs text-red-600">{errors.mobile}</p>}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Password / PIN *</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="4-6 digit PIN or password"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none"
            />
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Assigned Villages (comma-separated) *</label>
            <input
              type="text"
              value={form.assignedVillages}
              onChange={(e) => update("assignedVillages", e.target.value)}
              placeholder="e.g. Chandapur, Nandgaon, Devgaon"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none"
            />
            {errors.assignedVillages && <p className="mt-1 text-xs text-red-600">{errors.assignedVillages}</p>}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Primary PHC Facility</label>
            <input
              type="text"
              value={form.primaryPhc}
              onChange={(e) => update("primaryPhc", e.target.value)}
              placeholder="e.g. Chandapur PHC"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center rounded-2xl bg-blue-600 py-3.5 text-base font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? "Creating Account..." : "Create ASHA Account"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <button
            type="button"
            onClick={onLoginClick || onBack}
            className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
          >
            Login here
          </button>
        </div>
      </section>
    </main>
  )
}
