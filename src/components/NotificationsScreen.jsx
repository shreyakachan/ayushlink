import { useState } from "react"
import { ashaT } from "../lib/ashaI18n.js"

/**
 * AyushLink — Notifications & Alerts
 * React + JavaScript + Tailwind CSS
 * Grouped notification feed with read/unread state.
 */

const SEED_NOTIFICATIONS = [
  {
    id: "N-1",
    group: "Today",
    type: "sync",
    title: "Sync completed",
    body: "12 records were successfully synced to the central server.",
    time: "9:42 AM",
    unread: true,
  },
  {
    id: "N-2",
    group: "Today",
    type: "alert",
    title: "High-risk assessment flagged",
    body: "Meena Joshi's AI symptom check returned a high-risk result. Review recommended.",
    time: "8:15 AM",
    unread: true,
  },
  {
    id: "N-8",
    group: "Today",
    type: "reminder",
    title: "ANC visit overdue",
    body: "Sunita Devi missed ANC visit 4, due 2 days ago. An automatic reminder has been sent.",
    time: "7:05 AM",
    unread: true,
  },
  {
    id: "N-9",
    group: "Today",
    type: "reminder",
    title: "Vaccination due tomorrow",
    body: "Rohan Pawar is due for the Measles-Rubella dose tomorrow.",
    time: "6:40 AM",
    unread: true,
  },
  {
    id: "N-3",
    group: "Today",
    type: "inventory",
    title: "Low stock warning",
    body: "Paracetamol 500mg is running low — 6 units remaining.",
    time: "7:50 AM",
    unread: true,
  },
  {
    id: "N-4",
    group: "Yesterday",
    type: "prescription",
    title: "Prescription requested",
    body: "Ramesh Kumar requested medicines for RX-1039 from the pharmacy.",
    time: "6:20 PM",
    unread: false,
  },
  {
    id: "N-5",
    group: "Yesterday",
    type: "patient",
    title: "New patient registered",
    body: "Arjun Shinde was added to your patient records from Nandgaon.",
    time: "2:05 PM",
    unread: false,
  },
  {
    id: "N-6",
    group: "Earlier this week",
    type: "sync",
    title: "Offline mode activated",
    body: "Network connection lost. Changes are being saved locally.",
    time: "Mon, 4:12 PM",
    unread: false,
  },
  {
    id: "N-7",
    group: "Earlier this week",
    type: "inventory",
    title: "Inventory restocked",
    body: "ORS sachets and Cetirizine 10mg were added to inventory.",
    time: "Mon, 11:30 AM",
    unread: false,
  },
]

const TYPE_META = {
  sync: { tone: "bg-amber-50 text-amber-600" },
  alert: { tone: "bg-red-50 text-red-600" },
  inventory: { tone: "bg-sky-50 text-sky-600" },
  prescription: { tone: "bg-blue-50 text-blue-600" },
  patient: { tone: "bg-indigo-50 text-indigo-600" },
  reminder: { tone: "bg-rose-50 text-rose-600" },
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
function BellIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
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
function AlertIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
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
function RxIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 21V4a1 1 0 0 1 1-1h6a4.5 4.5 0 0 1 0 9H6" />
      <path d="M11 12l6 9" />
      <path d="M15 17h4" />
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
function CalendarIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}
function CheckDoubleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m2 13 4 4L18 5" />
      <path d="m8 13 4 4L24 5" />
    </svg>
  )
}

const TYPE_ICON = {
  sync: SyncIcon,
  alert: AlertIcon,
  inventory: PillIcon,
  prescription: RxIcon,
  patient: UserPlusIcon,
  reminder: CalendarIcon,
}

export default function NotificationsScreen({ lang = "en", onBack }) {
  const [items, setItems] = useState(SEED_NOTIFICATIONS)
  const t = ashaT(lang)

  const unreadCount = items.filter((i) => i.unread).length
  const groups = [...new Set(items.map((i) => i.group))]

  const markAllRead = () => setItems((list) => list.map((i) => ({ ...i, unread: false })))
  const markRead = (id) => setItems((list) => list.map((i) => (i.id === id ? { ...i, unread: false } : i)))

  const pageTitle = t?.notifications?.title || t?.nav?.alerts || "Alerts & Notifications"
  const markAllText = t?.notifications?.markAllRead || "Mark all read"
  const unreadSuffix = t?.notifications?.unread || "unread"
  const caughtUpText = t?.notifications?.allCaughtUp || "You're all caught up"
  const emptyText = t?.notifications?.empty || t?.notifications?.emptyTitle || "No notifications yet"

  return (
    <main className="min-h-dvh w-full bg-slate-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur">
          <button
            type="button"
            onClick={onBack}
            aria-label={t?.common?.goBack || "Go back"}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95"
          >
            <BackIcon className="h-5 w-5" />
          </button>
          <div className="flex flex-1 items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/25">
              <BellIcon className="h-5 w-5 text-white" />
            </span>
            <div>
              <h1 className="text-base font-bold leading-tight text-slate-800">{pageTitle}</h1>
              <p className="text-xs text-slate-500">{unreadCount ? `${unreadCount} ${unreadSuffix}` : caughtUpText}</p>
            </div>
          </div>
          {unreadCount ? (
            <button
              type="button"
              onClick={markAllRead}
              className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              {markAllText}
            </button>
          ) : null}
        </header>

        <div className="flex flex-1 flex-col gap-6 px-4 py-5">
          {groups.map((group) => {
            const groupTitle = t?.notifications?.groups?.[group] || group
            return (
              <section key={group}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{groupTitle}</h2>
                <div className="flex flex-col gap-3">
                  {items
                    .filter((i) => i.group === group)
                    .map((item) => {
                      const meta = TYPE_META[item.type] || { tone: "bg-slate-50 text-slate-600" }
                      const Icon = TYPE_ICON[item.type] || BellIcon
                      const itemTrans = t?.notifications?.items?.[item.id]
                      const title = itemTrans?.title || item.title
                      const body = itemTrans?.body || item.body

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => markRead(item.id)}
                          className={`flex w-full items-start gap-3 rounded-3xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99]
                            ${item.unread ? "border-blue-200 bg-blue-50/50" : "border-slate-100 bg-white"}`}
                        >
                          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${meta.tone}`}>
                            <Icon className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-slate-800">{title}</span>
                              {item.unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" /> : null}
                            </span>
                            <span className="mt-0.5 block text-sm text-slate-600">{body}</span>
                            <span className="mt-1 block text-xs text-slate-400">{item.time}</span>
                          </span>
                        </button>
                      )
                    })}
                </div>
              </section>
            )
          })}

          {!items.length ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-white/60 py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
                <CheckDoubleIcon className="h-7 w-7" />
              </span>
              <p className="text-sm font-medium text-slate-500">{emptyText}</p>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}
