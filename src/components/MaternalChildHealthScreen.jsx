import { useMemo, useState } from "react"
import {
  PREGNANCIES,
  VACCINATIONS,
  GROWTH_RECORDS,
  NUTRITION_TONE,
  getDueStatus,
  getHighRiskAlerts,
  getSummaryCounts,
  formatDate,
} from "../lib/mchData.js"
import { ashaT } from "../lib/ashaI18n.js"

/**
 * AyushLink — Maternal & Child Health tracker
 * React + JavaScript + Tailwind CSS
 *
 * One simple hub (tabs, not separate screens) covering the four things ASHA
 * workers need day to day: pregnancy (ANC) tracking, child vaccination,
 * growth monitoring, and a combined high-risk alert feed.
 */

const STATUS_TONE = {
  red: "bg-red-50 text-red-700 border-red-100",
  amber: "bg-amber-50 text-amber-700 border-amber-100",
  blue: "bg-blue-50 text-blue-700 border-blue-100",
}

const AVATAR_TONE = "bg-rose-50 text-rose-600"

export default function MaternalChildHealthScreen({ lang = "en", onBack }) {
  const [activeTab, setActiveTab] = useState("pregnancy")
  const [remindedIds, setRemindedIds] = useState(() => new Set())
  const t = ashaT(lang)

  const tabs = [
    { id: "pregnancy", label: t?.mch?.tabs?.pregnancy || "Pregnancy", Icon: PregnancyIcon },
    { id: "vaccination", label: t?.mch?.tabs?.vaccination || "Vaccination", Icon: SyringeIcon },
    { id: "growth", label: t?.mch?.tabs?.growth || "Growth", Icon: ScaleIcon },
    { id: "risk", label: t?.mch?.tabs?.risk || "High-Risk", Icon: AlertIcon },
  ]

  const counts = useMemo(() => getSummaryCounts(), [])
  const highRiskAlerts = useMemo(() => getHighRiskAlerts(), [])

  const sendReminder = (id) => {
    setRemindedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  const dueSoonLabel = t?.mch?.summary?.dueSoon || t?.mch?.dueSoon || "Due soon"
  const missedLabel = t?.mch?.summary?.missed || t?.mch?.missedVisits || "Missed visits"
  const highRiskLabel = t?.mch?.summary?.highRisk || t?.mch?.highRiskCases || "High-risk cases"
  const reminderBannerText = t?.mch?.reminderBanner || t?.mch?.autoReminderNote || "Automatic reminders sent 3 days before due date."

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
              <h1 className="truncate text-base font-bold leading-tight text-slate-800">{t?.mch?.title || "Maternal & Child Health"}</h1>
              <p className="truncate text-xs text-slate-500">{t?.mch?.subtitle || "Pregnancy, vaccination & growth tracker"}</p>
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-5 px-4 py-5">
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryChip
              label={dueSoonLabel}
              value={counts.dueSoon}
              tone="amber"
              active={activeTab !== "risk"}
              onClick={() => setActiveTab("pregnancy")}
            />
            <SummaryChip label={missedLabel} value={counts.missed} tone="red" onClick={() => setActiveTab("pregnancy")} />
            <SummaryChip label={highRiskLabel} value={counts.highRisk} tone="rose" onClick={() => setActiveTab("risk")} />
          </div>

          {/* Auto-reminder note */}
          <div className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50/60 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-rose-600 shadow-sm">
              <BellIcon className="h-4 w-4" />
            </span>
            <p className="text-xs text-rose-800">
              {reminderBannerText}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {tabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
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
                {id === "risk" && highRiskAlerts.length ? (
                  <span
                    className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold
                      ${activeTab === id ? "bg-white/20 text-white" : "bg-rose-100 text-rose-700"}`}
                  >
                    {highRiskAlerts.length}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "pregnancy" && (
            <PregnancyList reminded={remindedIds} onRemind={sendReminder} t={t} />
          )}
          {activeTab === "vaccination" && (
            <VaccinationList reminded={remindedIds} onRemind={sendReminder} t={t} />
          )}
          {activeTab === "growth" && <GrowthList reminded={remindedIds} onRemind={sendReminder} t={t} />}
          {activeTab === "risk" && (
            <HighRiskList alerts={highRiskAlerts} reminded={remindedIds} onRemind={sendReminder} t={t} />
          )}
        </div>
      </div>
    </main>
  )
}

/* --- Summary chip --- */

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
        ${active ? "border-rose-200" : "border-slate-100"}`}
    >
      <span className={`text-2xl font-bold leading-none ${toneClass}`}>{value}</span>
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
    </button>
  )
}

/* --- Shared card + remind button --- */

function RecordCard({ initials, title, subtitle, metaLine, dueDate, extraBadge, id, reminded, onRemind, t }) {
  const status = getDueStatus(dueDate)
  const isReminded = reminded.has(id)
  const statusLabel = t?.mch?.dueStatus?.[status.key] || status.label
  const remindNowText = t?.mch?.remindNow || t?.mch?.remindBtn || "Remind now"
  const reminderSentText = t?.mch?.reminderSent || t?.mch?.remindedBtn || "Reminder sent"

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${AVATAR_TONE}`}>
          {initials}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-800">{title}</p>
            {extraBadge}
          </div>
          <p className="truncate text-xs text-slate-500">{subtitle}</p>
          <p className="mt-0.5 truncate text-xs font-medium text-slate-600">{metaLine}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
        <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_TONE[status.tone]}`}>
          {statusLabel} · {formatDate(dueDate)}
        </span>
        <button
          type="button"
          onClick={() => onRemind(id)}
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
              <CheckIcon className="h-3.5 w-3.5" /> {reminderSentText}
            </>
          ) : (
            <>
              <BellIcon className="h-3.5 w-3.5" /> {remindNowText}
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function initialsOf(name) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("")
}

/* --- Pregnancy tab --- */

function PregnancyList({ reminded, onRemind, t }) {
  const agePrefix = t?.mch?.ageLabel || "Age"
  const trimesterPrefix = t?.mch?.trimester || t?.mch?.trimesterLabel || "Trimester"
  const eddPrefix = t?.mch?.edd || t?.mch?.eddLabel || "EDD"
  const highRiskBadgeText = t?.mch?.highRiskAlert || t?.mch?.highRiskBadge || "High risk"

  return (
    <div className="flex flex-col gap-3">
      {PREGNANCIES.map((p) => (
        <RecordCard
          key={p.id}
          id={p.id}
          initials={initialsOf(p.name)}
          title={p.name}
          subtitle={`${p.village} · ${agePrefix} ${p.age} · ${trimesterPrefix} ${p.trimester}`}
          metaLine={`${p.nextVisitLabel} · ${eddPrefix} ${formatDate(p.edd)}`}
          dueDate={p.nextVisitDue}
          extraBadge={
            p.highRisk ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                {highRiskBadgeText}
              </span>
            ) : null
          }
          reminded={reminded}
          onRemind={onRemind}
          t={t}
        />
      ))}
    </div>
  )
}

/* --- Vaccination tab --- */

function VaccinationList({ reminded, onRemind, t }) {
  const motherPrefix = t?.mch?.mother || t?.mch?.motherLabel || "Mother"
  const monthsSuffix = t?.mch?.months || t?.mch?.monthsLabel || "mo"
  const nextDosePrefix = t?.mch?.nextDose || t?.mch?.nextDoseLabel || "Next dose"
  const missedDoseSuffix = t?.mch?.missedDose || t?.mch?.missedDoseLabel || "missed dose"

  return (
    <div className="flex flex-col gap-3">
      {VACCINATIONS.map((v) => (
        <RecordCard
          key={v.id}
          id={v.id}
          initials={initialsOf(v.childName)}
          title={v.childName}
          subtitle={`${v.village} · ${motherPrefix}: ${v.motherName} · ${v.ageMonths} ${monthsSuffix}`}
          metaLine={`${nextDosePrefix}: ${v.nextVaccine}`}
          dueDate={v.dueDate}
          extraBadge={
            v.missedCount > 0 ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                {v.missedCount} {missedDoseSuffix}
              </span>
            ) : null
          }
          reminded={reminded}
          onRemind={onRemind}
          t={t}
        />
      ))}
    </div>
  )
}

/* --- Growth tab --- */

function GrowthList({ reminded, onRemind, t }) {
  const monthsSuffix = t?.mch?.months || t?.mch?.monthsLabel || "mo"

  return (
    <div className="flex flex-col gap-3">
      {GROWTH_RECORDS.map((g) => {
        const tone = NUTRITION_TONE[g.nutritionStatus] || "slate"
        const nutritionLabel = t?.mch?.nutritionLevels?.[g.nutritionStatus] || g.nutritionStatus
        return (
          <RecordCard
            key={g.id}
            id={g.id}
            initials={initialsOf(g.childName)}
            title={g.childName}
            subtitle={`${g.village} · ${g.ageMonths} ${monthsSuffix}`}
            metaLine={`${g.weightKg} kg · ${g.heightCm} cm`}
            dueDate={g.nextCheckDue}
            extraBadge={
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide
                  ${
                    tone === "emerald"
                      ? "bg-emerald-100 text-emerald-700"
                      : tone === "amber"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700"
                  }`}
              >
                {nutritionLabel}
              </span>
            }
            reminded={reminded}
            onRemind={onRemind}
            t={t}
          />
        )
      })}
    </div>
  )
}

/* --- High-risk tab --- */

function HighRiskList({ alerts, reminded, onRemind, t }) {
  const noHighRiskText = t?.mch?.noHighRisk || t?.mch?.noAlerts || "No high-risk cases right now"

  if (!alerts.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-white/60 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
          <CheckIcon className="h-7 w-7" />
        </span>
        <p className="text-sm font-medium text-slate-500">{noHighRiskText}</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {alerts.map((a) => (
        <RecordCard
          key={a.id}
          id={a.id}
          initials={initialsOf(a.name)}
          title={a.name}
          subtitle={`${a.village} · ${a.category}`}
          metaLine={a.reason}
          dueDate={a.refDate}
          extraBadge={
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700">
              {a.category}
            </span>
          }
          reminded={reminded}
          onRemind={onRemind}
          t={t}
        />
      ))}
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
