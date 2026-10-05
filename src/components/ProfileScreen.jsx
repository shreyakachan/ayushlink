import { useState, useEffect } from "react"
import { ASHA_LANGUAGES, ashaT } from "../lib/ashaI18n.js"
import { getAuthUser, getAuthRole, getDoctorProfile } from "../lib/api.js"
import useOnlineStatus from "../hooks/useOnlineStatus.js"

/**
 * AyushLink — Profile
 * React + JavaScript + Tailwind CSS
 * Health worker / Doctor profile, stats and app settings.
 * Dynamically resolves authenticated doctor / health worker identity.
 */


function getInitials(name, isDoctor) {
  if (!name) return isDoctor ? "DR" : "AW"
  const cleaned = String(name).replace(/^(Dr\.?|Doctor|Shri|Smt\.?)\s+/i, "").trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  if (parts.length === 1 && parts[0].length === 1) {
    return parts[0].toUpperCase()
  }
  return isDoctor ? "DR" : "AW"
}

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
function WifiIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <path d="M12 20h.01" />
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

export default function ProfileScreen({
  lang = "en",
  onLangChange,
  onBack,
  onLogout,
  user = null,
  role = null,
}) {
  const isOnline = useOnlineStatus()
  const [toggles, setToggles] = useState({ notifications: true })
  const [showLangModal, setShowLangModal] = useState(false)
  const t = ashaT(lang)

  const [profileUser, setProfileUser] = useState(() => user || getAuthUser() || {})
  const authRole = role || getAuthRole() || (profileUser?.doctor_id ? "doctor" : "asha")
  const isDoctor = authRole === "doctor" || !!profileUser?.doctor_id

  useEffect(() => {
    let isMounted = true
    if (user) {
      setProfileUser(user)
    } else {
      const stored = getAuthUser()
      if (stored) {
        setProfileUser(stored)
      }
    }

    if (isDoctor) {
      getDoctorProfile()
        .then((doc) => {
          if (isMounted && doc && (doc.full_name || doc.doctor_id)) {
            setProfileUser((prev) => ({ ...prev, ...doc }))
          }
        })
        .catch(() => {})
    }

    return () => {
      isMounted = false
    }
  }, [user, isDoctor])

  const toggle = (id) => setToggles((prev) => ({ ...prev, [id]: !prev[id] }))

  const currentLangObj = ASHA_LANGUAGES.find((l) => l.code === lang) || ASHA_LANGUAGES[0]

  // Dynamic Name
  const displayName =
    profileUser.full_name ||
    profileUser.name ||
    (isDoctor ? "Doctor" : "ASHA Worker")

  // Dynamic Initials
  const initials = getInitials(displayName, isDoctor)

  // Dynamic Subtitle / Specialization & Facility
  let roleSubtitle = ""
  if (isDoctor) {
    if (profileUser.specialization && profileUser.assigned_facility) {
      roleSubtitle = `${profileUser.specialization} · ${profileUser.assigned_facility}`
    } else if (profileUser.specialization) {
      roleSubtitle = profileUser.specialization
    } else if (profileUser.qualification) {
      roleSubtitle = `${profileUser.qualification} · ${profileUser.assigned_facility || "Chandapur PHC"}`
    } else {
      roleSubtitle = "General Physician & AYUSH Consultant"
    }
  } else {
    roleSubtitle = t.profile?.healthWorkerRole || "Health Worker · Chandapur PHC"
  }

  // Dynamic Verified Badge
  let verifiedBadge = ""
  if (isDoctor) {
    verifiedBadge = profileUser.doctor_id
      ? `Verified Doctor · ${profileUser.doctor_id}`
      : "Verified Doctor"
  } else {
    verifiedBadge = profileUser.asha_id
      ? `Verified ASHA · ${profileUser.asha_id}`
      : (t.profile?.verifiedBadge || "Verified ASHA Worker")
  }

  // Dynamic Stats
  const dynamicStats = isDoctor
    ? [
        {
          key: "consultations",
          label: "Consultations",
          value:
            profileUser.stats?.consultations_completed !== undefined
              ? String(profileUser.stats.consultations_completed)
              : "0",
        },
        {
          key: "prescriptions",
          label: "Prescriptions",
          value:
            profileUser.stats?.prescriptions_signed !== undefined
              ? String(profileUser.stats.prescriptions_signed)
              : "0",
        },
        {
          key: "activeCases",
          label: "Active Cases",
          value:
            profileUser.stats?.active_cases !== undefined
              ? String(profileUser.stats.active_cases)
              : "0",
        },
        {
          key: "monthsActive",
          label: "Months Active",
          value:
            profileUser.stats?.months_active !== undefined
              ? String(profileUser.stats.months_active)
              : "0",
        },
      ]
    : [
        {
          key: "patientsSeen",
          label: t.profile?.stats?.patientsSeen || "Patients seen",
          value: String(profileUser.stats?.patients_seen ?? profileUser.stats?.patientsSeen ?? 0),
        },
        {
          key: "prescriptionsIssued",
          label: t.profile?.stats?.prescriptionsIssued || "Prescriptions issued",
          value: String(profileUser.stats?.prescriptions_issued ?? profileUser.stats?.prescriptionsIssued ?? 0),
        },
        {
          key: "villagesCovered",
          label: t.profile?.stats?.villagesCovered || "Villages covered",
          value: String(profileUser.assigned_villages?.length ?? profileUser.stats?.villages_covered ?? 0),
        },
        {
          key: "monthsActive",
          label: t.profile?.stats?.monthsActive || "Months active",
          value: String(profileUser.stats?.months_active ?? profileUser.stats?.monthsActive ?? 1),
        },
      ]

  const credentialsDesc = isDoctor
    ? (profileUser.doctor_id
        ? `Doctor ID: ${profileUser.doctor_id}`
        : (profileUser.registration_number
            ? `Reg: ${profileUser.registration_number}`
            : (t.profile?.items?.credentialsDesc || "Medical Registration & ID")))
    : (profileUser.asha_id
        ? `ASHA ID: ${profileUser.asha_id}`
        : (t.profile?.items?.credentialsDesc || "ASHA worker ID, certification"))

  const editProfileDesc = profileUser.phone
    ? `+91 ${String(profileUser.phone).replace(/\D/g, "").slice(-10)}`
    : (t.profile?.items?.editProfileDesc || "Name, photo and contact details")

  const settingsSections = [
    {
      title: t.profile?.sections?.account || "Account",
      items: [
        {
          id: "edit-profile",
          label: t.profile?.items?.editProfile || "Edit profile",
          desc: editProfileDesc,
          Icon: UserIcon,
        },
        {
          id: "credentials",
          label: t.profile?.items?.credentials || "Credentials & ID",
          desc: credentialsDesc,
          Icon: BadgeIcon,
        },
      ],
    },
    {
      title: t.profile?.sections?.preferences || "Preferences",
      items: [
        {
          id: "language",
          label: t.profile?.items?.language || "App language",
          desc: currentLangObj.label,
          Icon: GlobeIcon,
          toggle: false,
          onClick: () => setShowLangModal(true),
        },
        {
          id: "network",
          label: t.dashboard?.networkStatus || t.profile?.items?.networkStatus || "Network status",
          desc: isOnline
            ? (t.dashboard?.allUpToDate || "Online — Live connection")
            : (t.dashboard?.offlineSaved || "Offline — Working from saved data"),
          Icon: isOnline ? WifiIcon : OfflineIcon,
          statusBadge: isOnline ? "Online" : "Offline",
          statusBadgeColor: isOnline ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
          toggle: false,
        },
        {
          id: "notifications",
          label: t.profile?.items?.notifications || "Push notifications",
          desc: t.profile?.items?.notificationsDesc || "Alerts & updates",
          Icon: BellIcon,
          toggle: true,
        },
      ],
    },
    {
      title: t.profile?.sections?.support || "Support",
      items: [
        {
          id: "help",
          label: t.profile?.items?.help || "Help & FAQs",
          desc: t.profile?.items?.helpDesc || "Guides for common tasks",
          Icon: HelpIcon,
        },
        {
          id: "about",
          label: t.profile?.items?.about || "About AyushLink",
          desc: t.profile?.items?.aboutDesc || "Version 1.4.0",
          Icon: InfoIcon,
        },
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
          <h1 className="text-base font-bold leading-tight text-slate-800">{t.profile?.title || "Profile"}</h1>
        </header>

        <div className="flex flex-1 flex-col gap-6 px-4 py-6">
          {/* Profile card */}
          <section className="flex flex-col items-center gap-3 rounded-3xl border border-blue-100 bg-white p-6 text-center shadow-sm">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-600 text-2xl font-bold text-white shadow-lg shadow-blue-600/25">
              {initials}
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-800">{displayName}</h2>
              <p className="text-sm text-slate-500">{roleSubtitle}</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              {verifiedBadge}
            </span>
          </section>

          {/* Stats */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t.profile?.impactTitle || t.profile?.yourImpact || "Your impact"}
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {dynamicStats.map((s) => {
                const label = isDoctor ? s.label : (t.profile?.stats?.[s.key] || s.label || s.defaultLabel)
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
                    {item.statusBadge ? (
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${item.statusBadgeColor || "bg-emerald-50 text-emerald-700"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${item.statusBadge === "Online" ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                        {item.statusBadge}
                      </span>
                    ) : item.toggle ? (
                      <Toggle checked={!!toggles[item.id]} onChange={() => toggle(item.id)} />
                    ) : item.onClick ? (
                      <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-300" />
                    ) : null}
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
            {t.profile?.logout || "Log out"}
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
                <h3 className="text-base font-bold text-slate-800">{t.profile?.selectLangTitle || t.profile?.selectLanguage || "Select Language"}</h3>
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
