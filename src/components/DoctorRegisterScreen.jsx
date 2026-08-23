import { useState } from "react"
import { ASHA_LANGUAGES, ashaT } from "../lib/ashaI18n.js"
import { registerDoctor } from "../lib/api.js"

function BackIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
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

export default function DoctorRegisterScreen({ lang = "en", onLangChange, onBack, onRegister, onLoginClick }) {
  const [form, setForm] = useState({
    fullName: "",
    mobile: "",
    password: "",
    specialization: "General Physician",
    qualification: "MBBS",
    assignedFacility: "District Hospital",
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
    if (!form.fullName.trim()) errs.fullName = "Doctor full name is required"
    const cleanMobile = form.mobile.replace(/\D/g, "")
    if (cleanMobile.length !== 10) errs.mobile = "Valid 10-digit mobile number required"
    if (!form.password || form.password.length < 4) errs.password = "Password/PIN must be at least 4 characters"
    if (!form.specialization.trim()) errs.specialization = "Specialization is required"
    if (!form.assignedFacility.trim()) errs.assignedFacility = "Hospital/Facility name is required"
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    setApiError("")

    try {
      const cleanPhone = form.mobile.replace(/\D/g, "").slice(-10)
      const res = await registerDoctor({
        full_name: form.fullName.trim(),
        phone: cleanPhone,
        password: form.password.trim(),
        specialization: form.specialization.trim(),
        qualification: form.qualification.trim() || "MBBS",
        assigned_facility: form.assignedFacility.trim() || "District Hospital",
        preferred_language: form.preferredLanguage || "en",
        is_on_duty: true,
      })
      onRegister?.(res?.doctor || form)
    } catch (err) {
      setApiError(err.message || "Registration failed. Please check your details.")
    } finally {
      setLoading(false)
    }
  }

  const specializations = [
    "General Physician",
    "Pediatrics",
    "Obstetrics & Gynecology",
    "Cardiology",
    "General Medicine",
    "AYUSH & Integrative Medicine",
    "Emergency Care",
  ]

  return (
    <main className="relative flex min-h-dvh w-full items-stretch justify-center overflow-hidden bg-gradient-to-b from-emerald-50 via-white to-teal-50 md:items-center md:p-6">
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -right-16 h-80 w-80 rounded-full bg-teal-200/40 blur-3xl" />

      <section className="relative z-10 flex w-full flex-col px-6 py-8 md:max-w-md md:gap-6 md:rounded-3xl md:border md:border-emerald-100 md:bg-white/85 md:px-10 md:py-10 md:shadow-xl md:shadow-emerald-900/5 md:backdrop-blur">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-emerald-200 hover:bg-slate-50 hover:text-emerald-600 active:scale-95"
              >
                <BackIcon className="h-5 w-5" />
              </button>
            )}
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600 shadow-lg shadow-emerald-600/30">
              <StethoscopeIcon className="h-6 w-6 text-white" />
            </span>
            <span className="text-xl font-bold tracking-tight text-slate-800">
              Ayush<span className="text-emerald-600">Link</span>
            </span>
          </div>
        </div>

        {/* Heading */}
        <header className="mt-4">
          <p className="text-sm font-semibold text-emerald-600">Doctor Portal</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight text-slate-800">Create Doctor Account</h1>
          <p className="mt-1 text-sm text-slate-500">Register to consult patients and manage teleconsultations.</p>
        </header>

        {apiError && (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          {/* Full Name */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="doc_fullName" className="text-sm font-semibold text-slate-700">Full Name</label>
            <input
              id="doc_fullName"
              type="text"
              placeholder="Dr. Anjali Rao"
              value={form.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
            />
            {errors.fullName && <p className="text-xs text-red-600">{errors.fullName}</p>}
          </div>

          {/* Mobile Number */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="doc_phone" className="text-sm font-semibold text-slate-700">Mobile Number</label>
            <div className="flex items-stretch gap-2">
              <span className="inline-flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-base font-semibold text-slate-600">
                +91
              </span>
              <input
                id="doc_phone"
                type="tel"
                inputMode="numeric"
                placeholder="98765 43210"
                value={form.mobile}
                onChange={(e) => update("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
              />
            </div>
            {errors.mobile && <p className="text-xs text-red-600">{errors.mobile}</p>}
          </div>

          {/* Password / PIN */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="doc_password" className="text-sm font-semibold text-slate-700">Password / PIN</label>
            <input
              id="doc_password"
              type="password"
              placeholder="Minimum 4 characters"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
            />
            {errors.password && <p className="text-xs text-red-600">{errors.password}</p>}
          </div>

          {/* Specialization */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="doc_specialization" className="text-sm font-semibold text-slate-700">Specialization</label>
            <select
              id="doc_specialization"
              value={form.specialization}
              onChange={(e) => update("specialization", e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
            >
              {specializations.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {errors.specialization && <p className="text-xs text-red-600">{errors.specialization}</p>}
          </div>

          {/* Hospital / Facility */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="doc_facility" className="text-sm font-semibold text-slate-700">Hospital / Facility</label>
            <input
              id="doc_facility"
              type="text"
              placeholder="District Hospital, Chandapur PHC"
              value={form.assignedFacility}
              onChange={(e) => update("assignedFacility", e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
            />
            {errors.assignedFacility && <p className="text-xs text-red-600">{errors.assignedFacility}</p>}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loading ? "Creating Account..." : "Create Doctor Account"}
          </button>

          {/* Already have account */}
          <div className="text-center text-sm text-slate-500">
            Already have an account?{" "}
            <button
              type="button"
              onClick={onLoginClick || onBack}
              className="font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
            >
              Sign in
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
