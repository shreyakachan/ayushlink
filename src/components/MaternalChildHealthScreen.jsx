import { useMemo, useState, useEffect } from "react"
import { ashaT } from "../lib/ashaI18n.js"
import { getDoctorMchCases } from "../lib/api.js"

/**
 * AyushLink — Maternal & Child Health Hub
 * React + JavaScript + Tailwind CSS
 *
 * Shows real maternal, pregnancy, and child health cases submitted through the Patient Portal.
 * If no maternal symptoms are currently submitted, displays a clean empty state.
 */

const STATUS_TONE = {
  red: "bg-red-50 text-red-700 border-red-100",
  amber: "bg-amber-50 text-amber-700 border-amber-100",
  blue: "bg-blue-50 text-blue-700 border-blue-100",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
}

const AVATAR_TONE = "bg-rose-50 text-rose-600 border border-rose-100"

function formatDate(iso) {
  if (!iso) return "Today"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

export default function MaternalChildHealthScreen({ lang = "en", onBack }) {
  const [activeTab, setActiveTab] = useState("pregnancy")
  const [mchCases, setMchCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [remindedIds, setRemindedIds] = useState(() => new Set())
  const t = ashaT(lang)

  useEffect(() => {
    async function loadMchData() {
      try {
        setLoading(true)
        const liveCases = await getDoctorMchCases()
        if (Array.isArray(liveCases)) {
          setMchCases(liveCases)
        }
      } catch (err) {
        console.error("Failed to load MCH cases:", err)
        setMchCases([])
      } finally {
        setLoading(false)
      }
    }
    loadMchData()
  }, [])

  const tabs = [
    { id: "pregnancy", label: t?.mch?.tabs?.pregnancy || "Pregnancy & ANC", Icon: PregnancyIcon },
    { id: "vaccination", label: t?.mch?.tabs?.vaccination || "Vaccination", Icon: SyringeIcon },
    { id: "growth", label: t?.mch?.tabs?.growth || "Growth", Icon: ScaleIcon },
    { id: "risk", label: t?.mch?.tabs?.risk || "High-Risk", Icon: AlertIcon },
  ]

  const pregnancyCases = useMemo(
    () => mchCases.filter((c) => c.category === "pregnancy" || (!c.category && c.trimester)),
    [mchCases]
  )
  const vaccinationCases = useMemo(
    () => mchCases.filter((c) => c.category === "vaccination"),
    [mchCases]
  )
  const growthCases = useMemo(
    () => mchCases.filter((c) => c.category === "growth"),
    [mchCases]
  )
  const highRiskCases = useMemo(
    () => mchCases.filter((c) => c.is_high_risk || c.category === "risk" || c.severity === "severe"),
    [mchCases]
  )

  const counts = useMemo(() => {
    return {
      dueSoon: pregnancyCases.length,
      missed: mchCases.filter((c) => c.severity === "moderate").length,
      highRisk: highRiskCases.length,
    }
  }, [pregnancyCases, mchCases, highRiskCases])

  const sendReminder = (id) => {
    setRemindedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  const dueSoonLabel = t?.mch?.summary?.dueSoon || t?.mch?.dueSoon || "Active ANC"
  const missedLabel = t?.mch?.summary?.missed || t?.mch?.missedVisits || "Under Review"
  const highRiskLabel = t?.mch?.summary?.highRisk || t?.mch?.highRiskCases || "High-risk cases"

  return (
    <main className="min-h-dvh w-full bg-slate-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur">
          <button
            type="button"
            onClick={onBack}
            aria-label={t?.common?.goBack || "Go back"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95"
          >
            <BackIcon className="h-5 w-5" />
          </button>
          <div className="flex flex-1 items-center gap-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-600 shadow-lg shadow-rose-600/25">
              <PregnancyIcon className="h-5 w-5 text-white" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold leading-tight text-slate-800">
                {t?.mch?.title || "Maternal & Child Health"}
              </h1>
              <p className="truncate text-xs text-slate-500">
                {mchCases.length} patient{mchCases.length === 1 ? "" : "s"} with maternal submissions
              </p>
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-5 px-4 py-5">
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryChip
              label={dueSoonLabel}
              value={counts.dueSoon}
              tone="rose"
              active={activeTab === "pregnancy"}
              onClick={() => setActiveTab("pregnancy")}
            />
            <SummaryChip
              label={missedLabel}
              value={counts.missed}
              tone="amber"
              active={activeTab !== "pregnancy" && activeTab !== "risk"}
              onClick={() => setActiveTab("vaccination")}
            />
            <SummaryChip
              label={highRiskLabel}
              value={counts.highRisk}
              tone="red"
              active={activeTab === "risk"}
              onClick={() => setActiveTab("risk")}
            />
          </div>

          {/* Banner Note */}
          <div className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50/60 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-rose-600 shadow-sm border border-rose-100">
              <BellIcon className="h-4 w-4" />
            </span>
            <p className="text-xs text-rose-800">
              Real-time maternal, ANC, and pediatric symptoms submitted via the Patient Portal.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
            {tabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition
                  ${
                    activeTab === id
                      ? "border-rose-600 bg-rose-600 text-white shadow-sm shadow-rose-600/25"
                      : "border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:text-rose-700"
                  }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {id === "risk" && highRiskCases.length > 0 ? (
                  <span
                    className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold
                      ${activeTab === id ? "bg-white/20 text-white" : "bg-rose-100 text-rose-700"}`}
                  >
                    {highRiskCases.length}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {loading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl border border-slate-100 bg-white p-12 text-center shadow-sm">
              <span className="flex h-10 w-10 animate-spin items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                <PregnancyIcon className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold text-slate-700">Loading maternal care submissions…</p>
            </div>
          ) : mchCases.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-white/70 py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-100">
                <PregnancyIcon className="h-7 w-7" />
              </span>
              <p className="text-base font-bold text-slate-800">No maternal-care submissions yet.</p>
              <p className="text-xs text-slate-500 max-w-sm">
                Patients who submit pregnancy, ANC, or maternal symptoms via the Patient Portal will appear here.
              </p>
            </div>
          ) : activeTab === "pregnancy" ? (
            <MchCaseList
              cases={pregnancyCases}
              emptyMsg="No pregnancy or ANC submissions yet."
              reminded={remindedIds}
              onRemind={sendReminder}
              t={t}
            />
          ) : activeTab === "vaccination" ? (
            <MchCaseList
              cases={vaccinationCases}
              emptyMsg="No child vaccination submissions yet."
              reminded={remindedIds}
              onRemind={sendReminder}
              t={t}
            />
          ) : activeTab === "growth" ? (
            <MchCaseList
              cases={growthCases}
              emptyMsg="No child growth monitoring records yet."
              reminded={remindedIds}
              onRemind={sendReminder}
              t={t}
            />
          ) : (
            <MchCaseList
              cases={highRiskCases}
              emptyMsg="No high-risk maternal cases right now."
              reminded={remindedIds}
              onRemind={sendReminder}
              t={t}
            />
          )}
        </div>
      </div>
    </main>
  )
}

/* --- Summary Chip --- */
function SummaryChip({ label, value, tone, active, onClick }) {
  const toneClass =
    tone === "red"
      ? "text-red-600"
      : tone === "amber"
      ? "text-amber-600"
      : tone === "rose"
      ? "text-rose-600"
      : "text-blue-600"
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md
        ${active ? "border-rose-300 ring-2 ring-rose-100" : "border-slate-100"}`}
    >
      <span className={`text-2xl font-bold leading-none ${toneClass}`}>{value}</span>
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
    </button>
  )
}

/* --- MCH Case List --- */
function MchCaseList({ cases, emptyMsg, reminded, onRemind, t }) {
  if (!cases || cases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-white/60 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
          <CheckIcon className="h-6 w-6" />
        </span>
        <p className="text-sm font-bold text-slate-700">{emptyMsg}</p>
        <p className="text-xs text-slate-400">Submissions from Patient Portal will automatically appear here.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {cases.map((c) => {
        const isReminded = reminded.has(c.patient_id)
        const initials = c.full_name
          .split(" ")
          .map((w) => w[0])
          .slice(0, 2)
          .join("")
        return (
          <div
            key={c.patient_id}
            className="flex flex-col gap-3 rounded-3xl border border-slate-100 bg-white p-4.5 shadow-sm sm:flex-row sm:items-center sm:justify-between transition hover:border-rose-200 hover:shadow-md"
          >
            <div className="flex min-w-0 items-start gap-3.5">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${AVATAR_TONE}`}>
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-bold text-slate-800">{c.full_name}</p>
                  <span className="font-mono text-xs font-semibold text-slate-400">({c.patient_id})</span>
                  {c.is_high_risk && (
                    <span className="rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                      High Risk
                    </span>
                  )}
                  {c.trimester && (
                    <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 border border-rose-100">
                      Trimester {c.trimester}
                    </span>
                  )}
                </div>

                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {c.village} {c.age ? `• ${c.age} yrs` : ""} {c.phone ? `• +91 ${c.phone}` : ""}
                </p>

                {/* Chief Complaint / Symptoms */}
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-medium text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                    {c.symptoms?.length ? c.symptoms.join(", ") : (c.description || "Maternal consultation")}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end self-end sm:self-center">
              <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                c.is_high_risk ? STATUS_TONE.red : STATUS_TONE.rose || STATUS_TONE.blue
              }`}>
                Submitted {formatDate(c.recorded_at)}
              </span>
              <button
                type="button"
                onClick={() => onRemind(c.patient_id)}
                disabled={isReminded}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition
                  ${
                    isReminded
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-rose-50 text-rose-700 hover:bg-rose-100 active:scale-95"
                  }`}
              >
                {isReminded ? (
                  <>
                    <CheckIcon className="h-3.5 w-3.5" /> Reminder Sent
                  </>
                ) : (
                  <>
                    <BellIcon className="h-3.5 w-3.5" /> Send Reminder
                  </>
                )}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* --- Inline SVG Icons --- */

function BackIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
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

function CheckIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function AlertIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}

function PregnancyIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="5" r="2.2" />
      <path d="M9 21v-5.5a5.5 4.8 0 1 1 6 0V21" />
    </svg>
  )
}

function SyringeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m18 2 4 4" />
      <path d="m17 7 3-3" />
      <path d="M19 9 9 19l-5 1 1-5L15 5z" />
      <path d="m14 10 2 2" />
      <path d="m11 13 2 2" />
    </svg>
  )
}

function ScaleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8 16c0-2.5 2-4 4-4s4 1.5 4 4" />
      <circle cx="12" cy="9" r="1.5" />
    </svg>
  )
}
