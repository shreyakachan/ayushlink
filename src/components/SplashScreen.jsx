import { useState, useEffect } from "react"

/**
 * AyushLink — Splash & Welcome Screen
 * React + JavaScript + Tailwind CSS
 * Mobile: full-screen app style. Desktop: centered welcome card.
 */
export default function SplashScreen({ onGetStarted }) {
  const [ready, setReady] = useState(false)

  // Simulate app boot: show the "Get Started" state after loading completes.
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 2400)
    return () => clearTimeout(timer)
  }, [])

  return (
    <main className="relative flex min-h-dvh w-full items-stretch justify-center overflow-hidden bg-gradient-to-b from-blue-50 via-white to-sky-50 md:items-center md:p-6">
      {/* Soft ambient background accents */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-sky-200/40 blur-3xl"
      />

      {/* App container — full-screen on mobile, centered card on desktop */}
      <section
        className="relative z-10 flex w-full flex-col items-center justify-between px-6 py-10
                   md:max-w-md md:justify-center md:gap-8 md:rounded-3xl md:border md:border-blue-100
                   md:bg-white/80 md:px-10 md:py-12 md:shadow-xl md:shadow-blue-900/5 md:backdrop-blur"
      >
        {/* Logo */}
        <header className="flex flex-col items-center gap-4 pt-6 md:pt-0">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/30">
              <PlusPulseIcon className="h-7 w-7 text-white" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">
              Ayush<span className="text-blue-600">Link</span>
            </h1>
          </div>
        </header>

        {/* Illustration */}
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-8 md:flex-none">
          <div className="relative w-full max-w-xs">
            <div className="absolute inset-0 -z-10 mx-auto h-full w-4/5 rounded-full bg-blue-100/60 blur-2xl" />
            <img
              src="/images/healthcare-illustration.png"
              alt="Illustration of a community connecting with a doctor through a mobile phone"
              className="mx-auto w-full select-none drop-shadow-sm"
              draggable="false"
            />
          </div>

          {/* Tagline */}
          <div className="max-w-sm text-center">
            <h2 className="text-balance text-xl font-semibold leading-relaxed text-slate-800 md:text-2xl">
              Healthcare that works even without the Internet.
            </h2>
            <p className="mt-3 text-pretty text-sm leading-relaxed text-slate-500">
              Connect with care, records, and support—online or offline, anywhere you are.
            </p>
          </div>
        </div>

        {/* Footer: animated loader OR Get Started button */}
        <footer className="flex w-full flex-col items-center gap-4 pb-4 md:pb-0">
          {!ready ? (
            <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-blue-600 [animation-delay:-0.3s]" />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.15s]" />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-sky-500" />
              </div>
              <p className="text-xs font-medium tracking-wide text-slate-400">Setting things up…</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={onGetStarted}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-4
                         text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition
                         duration-300 ease-out animate-in fade-in slide-in-from-bottom-2
                         hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 active:scale-[0.98]"
            >
              Get Started
              <ArrowRightIcon className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          )}
        </footer>
      </section>
    </main>
  )
}

/* --- Inline icons (no external icon dependency) --- */

function PlusPulseIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12h4l2 5 4-10 2 5h6" />
    </svg>
  )
}

function ArrowRightIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}
