import { useState } from "react"
import { ASHA_LANGUAGES, ashaT } from "../lib/ashaI18n.js"

/**
 * AyushLink — Profile
 * React + JavaScript + Tailwind CSS
 * Health worker profile, stats and app settings.
 */

const RAW_STATS = [
  { key: "patientsSeen", defaultLabel: "Patients seen", value: "1,284" },
  { key: "prescriptionsIssued", defaultLabel: "Prescriptions issued", value: "342" },
  { key: "villagesCovered", defaultLabel: "Villages covered", value: "3" },
  { key: "monthsActive", defaultLabel: "Months active", value: "14" },
]

/* ---------- Inline icons (matches app's existing icon style) ---------- */
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
function BadgeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="5" />
      <path d="m8.5 12.5-1.5 8 5-3 5 3-1.5-8" />
    </svg>
  )
}
function GlobeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" />
    </svg>
  )
}
function BellIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}
function OfflineIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <path d="M12 20h.01" />
      <path d="m2 2 20 20" />
    </svg>
  )
}
function HelpIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2-2.4 3.2" />
      <path d="M12 17h.01" />
    </svg>
  )
}
function InfoIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-5M12 8h.01" />
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
function CheckIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
function XIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
function LogoutIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-blue-600" : "bg-slate-200"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  )
}

export default function ProfileScreen({ lang = "en", onLangChange, onBack, onLogout }) {
  const [toggles, setToggles] = useState({ notifications: true, offline: true })
  const [showLangModal, setShowLangModal] = useState(false)
  const t = ashaT(lang)

  const toggle = (id) => setToggles((prev) => ({ ...prev, [id]: !prev[id] }))

  const currentLangObj = ASHA_LANGUAGES.find((l) => l.code === lang) || ASHA_LANGUAGES[0]

  const settingsSections = [
    {
      title: t.profile.sections.account,
      items: [
        { id: "edit-profile", label: t.profile.items.editProfile, desc: t.profile.items.editProfileDesc, Icon: UserIcon },
        { id: "credentials", label: t.profile.items.credentials, desc: t.profile.items.credentialsDesc, Icon: BadgeIcon },
      ],
    },
    {
      title: t.profile.sections.preferences,
      items: [
        {
          id: "language",
          label: t.profile.items.language,
          desc: currentLangObj.label,
          Icon: GlobeIcon,
          toggle: false,
          onClick: () => setShowLangModal(true),
        },
        { id: "notifications", label: t.profile.items.notifications, desc: t.profile.items.notificationsDesc, Icon: BellIcon, toggle: true },
        { id: "offline", label: t.profile.items.offline, desc: t.profile.items.offlineDesc, Icon: OfflineIcon, toggle: true },
      ],
    },
    {
      title: t.profile.sections.support,
      items: [
        { id: "help", label: t.profile.items.help, desc: t.profile.items.helpDesc, Icon: HelpIcon },
        { id: "about", label: t.profile.items.about, desc: t.profile.items.aboutDesc, Icon: InfoIcon },
      ],
    },
  ]

  return (
    <main className="min-h-dvh w-full bg-slate-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur">
          <button
            type="button"
            onClick={onBack}
            aria-label={t.common.goBack}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95"
          >
            <BackIcon className="h-5 w-5" />
          </button>
          <h1 className="text-base font-bold leading-tight text-slate-800">{t.profile.title}</h1>
        </header>

        <div className="flex flex-1 flex-col gap-6 px-4 py-6">
          {/* Profile card */}
          <section className="flex flex-col items-center gap-3 rounded-3xl border border-blue-100 bg-white p-6 text-center shadow-sm">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-600 text-2xl font-bold text-white shadow-lg shadow-blue-600/25">
              AR
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Dr. Anjali Rao</h2>
              <p className="text-sm text-slate-500">{t.profile.roleSubtitle}</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              {t.profile.verifiedBadge}
            </span>
          </section>

          {/* Stats */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{t.profile.yourImpact}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {RAW_STATS.map((s) => {
                const label = t.profile.stats[s.key] || s.defaultLabel
                return (
                  <div key={s.key} className="flex flex-col gap-1 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <p className="text-2xl font-bold leading-none text-slate-800">{s.value}</p>
                    <p className="mt-1 text-xs text-slate-500">{label}</p>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Settings */}
          {settingsSections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{section.title}</h2>
              <div className="flex flex-col gap-2 rounded-3xl border border-slate-100 bg-white p-2 shadow-sm">
                {section.items.map((item) => (
                  <div
                    key={item.id}
                    onClick={item.onClick}
                    role={item.onClick ? "button" : undefined}
                    tabIndex={item.onClick ? 0 : undefined}
                    className={`flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-slate-50 ${item.onClick ? "cursor-pointer active:scale-[0.99]" : ""}`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <item.Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                      <p className="truncate text-xs text-slate-500">{item.desc}</p>
                    </div>
                    {item.toggle ? (
                      <Toggle checked={!!toggles[item.id]} onChange={() => toggle(item.id)} />
                    ) : (
                      <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-300" />
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}

          {/* Logout */}
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-6 py-4 text-base font-semibold text-red-600 transition hover:bg-red-100 active:scale-[0.99]"
          >
            <LogoutIcon className="h-5 w-5" />
            {t.profile.logout}
          </button>
        </div>
      </div>

      {/* Language Selector Modal */}
      {showLangModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl transition animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <GlobeIcon className="h-5 w-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-800">{t.profile.selectLanguage}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLangModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {ASHA_LANGUAGES.map((l) => {
                const isSelected = l.code === lang
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => {
                      onLangChange?.(l.code)
                      setShowLangModal(false)
                    }}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3.5 text-sm font-semibold transition ${
                      isSelected
                        ? "bg-blue-600 text-white shadow-md shadow-blue-600/25"
                        : "border border-slate-100 bg-slate-50 text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                    }`}
                  >
                    <span>{l.label}</span>
                    {isSelected && <CheckIcon className="h-5 w-5" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
