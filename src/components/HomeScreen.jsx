import { useState, useEffect } from "react"
import { ASHA_LANGUAGES, ashaT } from "../lib/ashaI18n.js"
import { getAuthUser, getAshaCases } from "../lib/api.js"
import { getPendingItems } from "../lib/offlineDb.js"
import useOnlineStatus from "../hooks/useOnlineStatus.js"

/**
 * AyushLink — Home Screen (Dashboard)
 * React + JavaScript + Tailwind CSS
 * Mobile: bottom navigation. Desktop: left sidebar.
 * Blue & White healthcare theme. Mobile-first, responsive.
 */

/* Maps nav item ids to the screen ids App.jsx knows how to open */
const NAV_TARGETS = {
  patients: "patients",
  sync: "sync",
  alerts: "notifications",
  profile: "profile",
}

const TONES = {
  blue: "bg-blue-50 text-blue-600",
  sky: "bg-sky-50 text-sky-600",
  indigo: "bg-indigo-50 text-indigo-600",
  amber: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
  rose: "bg-rose-50 text-rose-600",
}

export default function HomeScreen({ lang = "en", onLangChange, onSelect, onBack }) {
  const [activeNav, setActiveNav] = useState("home")
  const online = useOnlineStatus()
  const [cases, setCases] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [workerName, setWorkerName] = useState(() => {
    const auth = getAuthUser()
    return auth?.full_name || auth?.name || "ASHA Worker"
  })
  const t = ashaT(lang)

  useEffect(() => {
    async function loadDashboard() {
      const auth = getAuthUser()
      if (auth?.full_name || auth?.name) {
        setWorkerName(auth.full_name || auth.name)
      }
      let liveList = []
      try {
        const liveCases = await getAshaCases()
        if (Array.isArray(liveCases)) {
          liveList = liveCases
        }
      } catch {}

      try {
        const pending = await getPendingItems()
        setPendingCount(pending.length)

        if (pending && pending.length > 0) {
          const updatedCases = [...liveList]
          for (const item of pending) {
            if (item.type === "symptom_report" && item.payload) {
              const p = item.payload
              const targetPid = p.patient_id || ""
              const existingIdx = targetPid ? updatedCases.findIndex((c) => c.patient_id === targetPid) : -1
              const symptomSummary = p.symptoms?.length ? p.symptoms.join(", ") : (p.description || "Reported symptoms")
              const severityVal = p.severity || "moderate"
              const statusVal = severityVal === "severe" ? "critical" : severityVal === "moderate" ? "review" : "stable"

              if (existingIdx >= 0) {
                updatedCases[existingIdx] = {
                  ...updatedCases[existingIdx],
                  condition: symptomSummary,
                  description: p.description || symptomSummary,
                  symptoms: p.symptoms || [],
                  severity: severityVal,
                  status: statusVal,
                }
              } else {
                updatedCases.unshift({
                  patient_id: targetPid || "P-PENDING",
                  patient_name: p.patient_name || (targetPid ? `Patient ${targetPid}` : "Unknown Patient"),
                  village: p.village || "Chandapur",
                  condition: symptomSummary,
                  description: p.description || symptomSummary,
                  symptoms: p.symptoms || [],
                  severity: severityVal,
                  status: statusVal,
                  sync_status: "pending",
                })
              }
            }
          }
          setCases(updatedCases)
        } else {
          setCases(liveList)
        }
      } catch {
        setCases(liveList)
      }
    }
    loadDashboard()

    const onPendingUpdated = () => {
      loadDashboard()
    }
    window.addEventListener("ayushlink:pending_updated", onPendingUpdated)
    window.addEventListener("ayushlink:sync_complete", loadDashboard)
    window.addEventListener("focus", onPendingUpdated)
    return () => {
      window.removeEventListener("ayushlink:pending_updated", onPendingUpdated)
      window.removeEventListener("ayushlink:sync_complete", loadDashboard)
      window.removeEventListener("focus", onPendingUpdated)
    }
  }, [])

  const navItems = [
    { id: "home", label: t.nav.home, Icon: HomeIcon },
    { id: "patients", label: t.nav.patients, Icon: UsersIcon },
    { id: "sync", label: t.nav.sync, Icon: SyncIcon },
    { id: "alerts", label: t.nav.alerts, Icon: BellIcon },
    { id: "profile", label: t.nav.profile, Icon: UserIcon },
  ]

  const featureCards = [
    {
      id: "abha-scan",
      title: t.dashboard.scanAbhaCard,
      desc: t.dashboard.scanAbhaDesc,
      Icon: QrIcon,
      tone: "indigo",
    },
    {
      id: "register",
      title: t.dashboard.registerPatient,
      desc: t.dashboard.registerPatientDesc,
      Icon: UserPlusIcon,
      tone: "blue",
    },
    {
      id: "patients",
      title: t.dashboard.myPatients,
      desc: `${cases.length} ${t.dashboard.recordsSaved || "records saved"}`,
      Icon: UsersIcon,
      tone: "sky",
    },
    {
      id: "ai",
      title: t.dashboard.aiSymptomChecker,
      desc: t.dashboard.aiSymptomDesc,
      Icon: SparklesIcon,
      tone: "indigo",
      badge: "AI",
    },
    {
      id: "prescriptions",
      title: t.dashboard.digitalPrescription,
      desc: `3 ${t.dashboard.prescriptionsIssued}`,
      Icon: RxIcon,
      tone: "sky",
    },
    {
      id: "mch",
      title: t.dashboard.mchTitle,
      desc: t.dashboard.mchDesc,
      Icon: MchIcon,
      tone: "rose",
      count: 3,
    },
    {
      id: "sync",
      title: t.dashboard.pendingSyncTitle,
      desc: pendingCount > 0 ? `${pendingCount} ${t.dashboard.recordsWaiting}` : (t.sync?.allCaughtUp || "All caught up"),
      Icon: SyncIcon,
      tone: "amber",
      count: pendingCount > 0 ? pendingCount : undefined,
    },
    {
      id: "sos",
      title: t.dashboard.emergencySosTitle,
      desc: t.dashboard.alertNearestFacility,
      Icon: SosIcon,
      tone: "red",
    },
    {
      id: "inventory",
      title: t.dashboard.medicineInventoryTitle,
      desc: `6 ${t.dashboard.lowStockItemsDesc}`,
      Icon: PillIcon,
      tone: "sky",
      count: 6,
    },
    {
      id: "notifications",
      title: t.dashboard.notificationsTitle,
      desc: `3 ${t.dashboard.newUpdatesDesc}`,
      Icon: BellIcon,
      tone: "blue",
      count: 3,
    },
  ]

  return (
    <div className="min-h-dvh w-full bg-slate-50 text-slate-800">
      <div className="mx-auto flex w-full max-w-7xl">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex">
          <div className="flex items-center gap-2.5 px-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/30">
              <PlusPulseIcon className="h-6 w-6 text-white" />
            </span>
            <span className="text-xl font-bold tracking-tight text-slate-800">
              Ayush<span className="text-blue-600">Link</span>
            </span>
          </div>

          <nav className="mt-8 flex flex-col gap-1">
            {navItems.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setActiveNav(id)
                  if (NAV_TARGETS[id]) onSelect?.(NAV_TARGETS[id])
                }}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition
                  ${
                    activeNav === id
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25"
                      : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                  }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm">
                <UserIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{workerName}</p>
                <p className="truncate text-xs text-slate-500">{t.dashboard.ashaRole}</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 pb-24 lg:pb-8">
          {/* Header */}
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/85 px-5 py-4 backdrop-blur lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={onBack}
                aria-label="Back to login"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:border-blue-200 hover:bg-slate-50 hover:text-blue-600"
              >
                <BackIcon className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2.5 lg:hidden">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/30">
                  <PlusPulseIcon className="h-5 w-5 text-white" />
                </span>
                <span className="text-lg font-bold tracking-tight text-slate-800">
                  Ayush<span className="text-blue-600">Link</span>
                </span>
              </div>
              <div className="hidden lg:block">
                <p className="text-sm text-slate-500">{t.dashboard.welcomeBack}</p>
                <h1 className="text-xl font-bold text-slate-800">{workerName}</h1>
              </div>
            </div>

            {/* Header right: Language switch pills + notifications */}
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-1"
                role="group"
                aria-label="ASHA Language"
              >
                {ASHA_LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => onLangChange?.(l.code)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition
                      ${
                        lang === l.code
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-slate-600 hover:bg-white/80"
                      }`}
                  >
                    {l.native}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onSelect?.("notifications")}
                className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-blue-200 hover:text-blue-600"
                aria-label={t.dashboard.notificationsTitle}
              >
                <BellIcon className="h-5 w-5" />
                <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {cases.filter((c) => c.status === "critical" || c.status === "review").length || 0}
                </span>
              </button>
            </div>
          </header>

          <div className="flex flex-col gap-6 px-5 py-6 lg:px-8">
            {/* Network status card */}
            <section
              className={`flex items-center justify-between gap-4 rounded-3xl border p-5 transition
                ${online ? "border-blue-100 bg-blue-600 text-white" : "border-amber-200 bg-amber-50 text-amber-800"}`}
            >
              <div className="flex items-center gap-4">
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl
                    ${online ? "bg-white/15 text-white" : "bg-amber-100 text-amber-700"}`}
                >
                  {online ? <WifiIcon className="h-6 w-6" /> : <OfflineIcon className="h-6 w-6" />}
                </span>
                <div>
                  <p className={`text-sm font-medium ${online ? "text-blue-100" : "text-amber-700"}`}>
                    {t.dashboard.networkStatus}
                  </p>
                  <p className="text-lg font-bold">
                    {online ? t.dashboard.onlineSynced : t.dashboard.offlineMode}
                  </p>
                  <p className={`text-xs ${online ? "text-blue-100/80" : "text-amber-600"}`}>
                    {online ? t.dashboard.allUpToDate : t.dashboard.offlineSaved}
                  </p>
                </div>
              </div>
              <div
                className={`shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold
                  ${online ? "bg-white/20 text-white" : "bg-amber-200/80 text-amber-900"}`}
              >
                <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-300 animate-pulse" : "bg-amber-600"}`} />
                {online ? (t.dashboard.onlineStatus || "Online") : (t.dashboard.offlineStatus || "Offline")}
              </div>
            </section>

            {/* Incentive wallet */}
            <IncentiveWallet t={t} />

            {/* Today's summary */}
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {t.dashboard.todaySummary}
              </h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <SummaryStat label={t.dashboard.patientsSeen} value={String(cases.length || 0)} Icon={UsersIcon} tone="blue" />
                <SummaryStat label={t.dashboard.newRegistrations} value={String(cases.length || 0)} Icon={UserPlusIcon} tone="sky" />
                <SummaryStat label={t.dashboard.pendingSyncCount} value={String(pendingCount)} Icon={SyncIcon} tone="amber" />
                <SummaryStat label={t.dashboard.lowStockCount} value="6" Icon={PillIcon} tone="red" />
              </div>
            </section>

            {/* My Patients Today */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {t.dashboard.myPatientsToday}
                </h2>
                <button
                  type="button"
                  onClick={() => onSelect?.("patients")}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  {t.dashboard.viewAll}
                </button>
              </div>
              {cases.length > 0 ? (
                <div className="flex flex-col divide-y divide-slate-100 rounded-3xl border border-slate-100 bg-white shadow-sm">
                  {cases.map((p) => (
                    <button
                      key={p.patient_id}
                      type="button"
                      onClick={() => onSelect?.("patients")}
                      className="flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-600">
                        {(p.patient_name || "P").split(" ").map((w) => w[0]).slice(0, 2).join("")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-800">{p.patient_name}</p>
                          <span className="text-[11px] text-slate-400 font-mono">({p.patient_id})</span>
                          {p.severity && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                              p.severity === "severe" ? "bg-red-50 text-red-600" : p.severity === "moderate" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                            }`}>
                              {p.severity}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-slate-500">
                          {p.village} · {p.description || (p.symptoms?.length ? p.symptoms.join(", ") : p.condition || "General Checkup")}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide
                          ${
                            p.status === "critical"
                              ? "bg-red-50 text-red-600"
                              : p.status === "review" || p.status === "waiting"
                              ? "bg-amber-50 text-amber-600"
                              : "bg-emerald-50 text-emerald-600"
                          }`}
                      >
                        {p.status === "critical"
                          ? (t.patients?.critical || "Critical")
                          : p.status === "review" || p.status === "waiting"
                          ? (t.patients?.needsReview || "Needs Review")
                          : (t.patients?.stable || "Stable")}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/70 py-10 text-center">
                  <UsersIcon className="h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm font-semibold text-slate-700">No patients assigned yet</p>
                  <p className="mt-0.5 text-xs text-slate-500">Patients in your assigned villages will appear here automatically.</p>
                </div>
              )}
            </section>

            {/* Feature cards */}
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {t.dashboard.quickActions}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {featureCards.map(({ id, title, desc, Icon, tone, badge, count }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSelect?.(id)}
                    className={`group flex items-center gap-4 rounded-3xl border bg-white p-5 text-left shadow-sm transition
                      hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-4 active:scale-[0.99]
                      ${id === "sos" ? "border-red-100 hover:border-red-200 focus-visible:ring-red-200" : "border-slate-100 hover:border-blue-200 focus-visible:ring-blue-200"}`}
                  >
                    <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${TONES[tone]}`}>
                      <Icon className="h-7 w-7" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-base font-semibold text-slate-800">{title}</span>
                        {badge && (
                          <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                            {badge}
                          </span>
                        )}
                        {count != null && (
                          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                            {count}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-sm text-slate-500">{desc}</span>
                    </span>
                    <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-500" />
                  </button>
                ))}
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
          {navItems.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActiveNav(id)
                if (NAV_TARGETS[id]) onSelect?.(NAV_TARGETS[id])
              }}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-xs font-medium transition
                ${activeNav === id ? "text-blue-600" : "text-slate-400 hover:text-slate-600"}`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl transition
                  ${activeNav === id ? "bg-blue-50" : "bg-transparent"}`}
              >
                <Icon className="h-5 w-5" />
              </span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

/* --- Incentive wallet card --- */

function IncentiveWallet({ t }) {
  const [balance, setBalance] = useState(1240)
  const [justCredited, setJustCredited] = useState(false)

  // In the real flow this fires when the background sync in
  // PendingSyncScreen.jsx confirms a case matched a valid ABHA ID — see
  // `POST /api/sync` in the backend plan. Wired here as a demo trigger so
  // the reward moment is visible without a live backend yet.
  const simulateVerifiedSync = () => {
    setBalance((b) => b + 50)
    setJustCredited(true)
    setTimeout(() => setJustCredited(false), 1600)
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <WalletIcon className="h-7 w-7" />
          {justCredited && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
              <CheckIcon className="h-3 w-3" />
            </span>
          )}
        </span>
        <div>
          <p className="text-sm text-slate-500">{t.dashboard.incentiveWallet}</p>
          <p className={`text-2xl font-bold text-slate-800 transition ${justCredited ? "scale-105 text-emerald-600" : ""}`}>
            ₹{balance.toLocaleString("en-IN")}
          </p>
          {justCredited && (
            <p className="text-xs font-semibold text-emerald-600">{t.dashboard.verifiedSyncCredited}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={simulateVerifiedSync}
        className="shrink-0 rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
      >
        {t.dashboard.simulateSync}
      </button>
    </section>
  )
}
/* --- Summary stat tile --- */

function SummaryStat({ label, value, Icon, tone }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${TONES[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-2xl font-bold leading-none text-slate-800">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{label}</p>
      </div>
    </div>
  )
}

/* --- Inline icons (no external icon dependency) --- */

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

function HomeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  )
}

function UsersIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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

function UserPlusIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6" />
      <path d="M22 11h-6" />
    </svg>
  )
}

function SparklesIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M12 8a4 4 0 0 0 4 4 4 4 0 0 0-4 4 4 4 0 0 0-4-4 4 4 0 0 0 4-4z" />
    </svg>
  )
}

function SyncIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
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

function SosIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  )
}

function PillIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.5 20.5a4.95 4.95 0 0 1-7-7l6-6a4.95 4.95 0 0 1 7 7z" />
      <path d="m8.5 8.5 7 7" />
    </svg>
  )
}

function MchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="5" r="2.2" />
      <path d="M9 21v-5.5a5.5 4.8 0 1 1 6 0V21" />
    </svg>
  )
}

function RxIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 21V4a1 1 0 0 1 1-1h6a4.5 4.5 0 0 1 0 9H6" />
      <path d="M11 12l6 9" />
      <path d="M15 17h4" />
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

function WalletIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
    </svg>
  )
}

function CheckIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
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
