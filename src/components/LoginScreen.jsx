import { useState, useEffect, useRef } from "react"
import { ASHA_LANGUAGES, ashaT } from "../lib/ashaI18n.js"
import { loginAsha, loginDoctor } from "../lib/api.js"

/**
 * AyushLink — Login Screen (ASHA Worker & Doctor, No OTP, No Offline Auth)
 * React + JavaScript + Tailwind CSS
 * Direct Phone + Password/PIN login with role routing, language selector,
 * and ASHA account creation.
 */

export default function LoginScreen({
  role = "asha",
  lang = "en",
  onLangChange,
  onLogin,
  onCreateAccount,
  onBack,
}) {
  const [internalLang, setInternalLang] = useState(lang)
  const currentLang = onLangChange ? lang : internalLang
  const setLang = onLangChange || setInternalLang
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const t = ashaT(currentLang).login
  const backLabel = ashaT(currentLang).common?.back || "Back"

  const phoneValid = phone.replace(/\D/g, "").length === 10
  const passwordValid = password.trim().length >= 4

  function formatPhone(value) {
    const digits = value.replace(/\D/g, "").slice(0, 10)
    if (digits.length <= 5) return digits
    return `${digits.slice(0, 5)} ${digits.slice(5)}`
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!phoneValid) {
      setErrorMsg("Please enter a valid 10-digit phone number.")
      return
    }
    if (!passwordValid) {
      setErrorMsg("Please enter a valid password (minimum 4 characters).")
      return
    }

    setLoading(true)
    setErrorMsg("")

    const cleanPhone = phone.replace(/\D/g, "").slice(-10)

    try {
      if (role === "doctor") {
        const res = await loginDoctor(cleanPhone, password.trim())
        onLogin?.(res?.doctor || { phone: `+91 ${cleanPhone}`, role: "doctor", lang: currentLang })
      } else {
        // ASHA Worker
        const res = await loginAsha(cleanPhone, password.trim())
        onLogin?.(res?.asha_worker || { phone: `+91 ${cleanPhone}`, role: "asha", lang: currentLang })
      }
    } catch (err) {
      setErrorMsg(err.message || "Invalid mobile number or credentials. Please verify your details.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-dvh w-full items-stretch justify-center overflow-hidden bg-gradient-to-b from-sky-50 via-white to-blue-50 md:items-center md:p-6">
      {/* Ambient background accents */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 -right-16 h-80 w-80 rounded-full bg-blue-200/40 blur-3xl"
      />

      <section
        className="relative z-10 flex w-full flex-col px-6 py-8
                   md:max-w-md md:gap-6 md:rounded-3xl md:border md:border-blue-100
                   md:bg-white/85 md:px-10 md:py-10 md:shadow-xl md:shadow-blue-900/5 md:backdrop-blur"
      >
        {/* Top bar: back button + logo + language selector */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label={backLabel}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-slate-50 hover:text-blue-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 active:scale-95"
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
          <LanguageSelector lang={currentLang} onChange={setLang} label={t.language} />
        </div>

        {/* Heading */}
        <header className="mt-6 md:mt-2">
          <p className="text-sm font-medium text-blue-600">
            {role === "doctor" ? "Doctor Portal" : t.welcome}
          </p>
          <h1 className="mt-1 text-balance text-2xl font-bold leading-tight text-slate-800">
            {t.phoneTitle}
          </h1>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-slate-500">
            {t.phoneHint}
          </p>
        </header>

        {errorMsg && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="phone" className="text-sm font-medium text-slate-700">
              {t.phoneLabel}
            </label>
            <div className="flex items-stretch gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold text-slate-600">
                <PhoneIcon className="h-4 w-4 text-blue-600" />
                +91
              </span>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="98765 43210"
                value={formatPhone(phone)}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                  setErrorMsg("")
                }}
                className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base
                           tracking-wide text-slate-800 placeholder:text-slate-400 focus:border-blue-500
                           focus:outline-none focus:ring-4 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              {t.passwordLabel || "Password / PIN"}
            </label>
            <input
              id="password"
              type="password"
              placeholder={t.passwordPlaceholder || "Enter your password or PIN"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setErrorMsg("")
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base
                         tracking-wide text-slate-800 placeholder:text-slate-400 focus:border-blue-500
                         focus:outline-none focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !phoneValid || !passwordValid}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-4
                       text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition
                       hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300
                       active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            {loading ? "Signing in..." : t.loginBtn || "Login"}
            <ArrowRightIcon className="h-5 w-5" />
          </button>

          {role === "asha" && onCreateAccount && (
            <div className="mt-2 text-center text-sm text-slate-500">
              {t.newWorker || "New ASHA worker?"}{" "}
              <button
                type="button"
                onClick={onCreateAccount}
                className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                {t.createAccount || "Create ASHA Account"}
              </button>
            </div>
          )}

          {role === "doctor" && onCreateAccount && (
            <div className="mt-2 text-center text-sm text-slate-500">
              New Doctor?{" "}
              <button
                type="button"
                onClick={onCreateAccount}
                className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                Create Account
              </button>
            </div>
          )}
        </form>
      </section>
    </main>
  )
}

/* --- Language selector --- */

function LanguageSelector({ lang, onChange, label }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = ASHA_LANGUAGES.find((l) => l.code === lang) || ASHA_LANGUAGES[0]

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2
                   text-sm font-medium text-slate-700 shadow-sm transition hover:border-blue-200
                   focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
      >
        <GlobeIcon className="h-4 w-4 text-blue-600" />
        <span className="hidden sm:inline">{current?.native}</span>
        <span className="sm:hidden">{current?.code.toUpperCase()}</span>
        <ChevronDownIcon className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl shadow-slate-900/10">
          {ASHA_LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                onChange(l.code)
                setOpen(false)
              }}
              className={`flex w-full items-center justify-between px-4 py-3 text-sm transition hover:bg-blue-50
                          ${l.code === lang ? "font-semibold text-blue-600" : "text-slate-700"}`}
            >
              <span>{l.native}</span>
              <span className="text-xs text-slate-400">{l.label}</span>
            </button>
          ))}
        </div>
      )}
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

function ArrowRightIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
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

function GlobeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function ChevronDownIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
