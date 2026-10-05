import { useState, useEffect } from "react"
import { ashaT } from "../lib/ashaI18n.js"
import {
  getNotifications,
  markNotificationRead,
  markAllDoctorNotificationsRead,
  getAuthRole,
} from "../lib/api.js"

/**
 * AyushLink — Notifications & Alerts Screen
 * React + JavaScript + Tailwind CSS
 * Fully dynamic notification feed backed by live MongoDB data.
 */

const TYPE_META = {
  sync: { tone: "bg-amber-50 text-amber-600" },
  alert: { tone: "bg-red-50 text-red-600" },
  inventory: { tone: "bg-sky-50 text-sky-600" },
  prescription: { tone: "bg-blue-50 text-blue-600" },
  patient: { tone: "bg-indigo-50 text-indigo-600" },
  consultation: { tone: "bg-indigo-50 text-indigo-600" },
  reminder: { tone: "bg-rose-50 text-rose-600" },
  new_symptom: { tone: "bg-emerald-50 text-emerald-600" },
  symptom: { tone: "bg-emerald-50 text-emerald-600" },
}

function formatNotificationGroup(dateStr) {
  if (!dateStr) return "Today"
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    if (itemDate.getTime() === today.getTime()) return "Today"
    if (itemDate.getTime() === yesterday.getTime()) return "Yesterday"
    return "Earlier this week"
  } catch {
    return "Today"
  }
}

function formatNotificationTime(dateStr) {
  if (!dateStr) return "Just now"
  try {
    const date = new Date(dateStr)
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  } catch {
    return "Just now"
  }
}

function transformRawNotification(n) {
  const dateStr = n.created_at || n.date || n.time
  return {
    id: n.notification_id || n.id || `notif-${Math.random()}`,
    notification_id: n.notification_id || n.id,
    group: formatNotificationGroup(dateStr),
    type: n.type || "prescription",
    title: n.title || "Notification",
    body: n.message || n.body || "",
    time: formatNotificationTime(dateStr),
    unread: n.is_read !== undefined ? !n.is_read : (n.unread !== undefined ? n.unread : false),
    patient_id: n.patient_id,
    patient_name: n.patient_name,
    prescription_id: n.prescription_id,
    consultation_id: n.consultation_id,
    symptom_id: n.symptom_id,
    symptom: n.symptom,
    created_at: dateStr,
  }
}

export default function NotificationsScreen({ lang = "en", onBack, role = null }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const currentRole = role || getAuthRole() || "doctor"
  const t = ashaT(lang)

  useEffect(() => {
    let isMounted = true

    async function loadNotifications() {
      try {
        setLoading(true)
        const data = await getNotifications(currentRole)
        if (!isMounted) return
        if (Array.isArray(data)) {
          setItems(data.map(transformRawNotification))
        } else {
          setItems([])
        }
      } catch (err) {
        console.error("Failed to load notifications:", err)
        if (isMounted) setItems([])
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadNotifications()
    return () => {
      isMounted = false
    }
  }, [currentRole])

  const unreadCount = items.filter((i) => i.unread).length
  const groups = ["Today", "Yesterday", "Earlier this week"].filter((g) =>
    items.some((i) => i.group === g)
  )

  const handleMarkAllRead = async () => {
    setItems((list) => list.map((i) => ({ ...i, unread: false })))
    try {
      if (currentRole === "doctor") {
        await markAllDoctorNotificationsRead()
      }
    } catch (err) {
      console.error("Failed to mark all as read:", err)
    }
  }

  const handleMarkRead = async (item) => {
    if (!item.unread) return
    setItems((list) =>
      list.map((i) => (i.id === item.id ? { ...i, unread: false } : i))
    )
    try {
      const targetId = item.notification_id || item.id
      if (targetId) {
        await markNotificationRead(targetId, currentRole)
      }
    } catch (err) {
      console.error("Failed to mark notification read:", err)
    }
  }

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
              <p className="text-xs text-slate-500">
                {loading
                  ? "Loading updates…"
                  : unreadCount
                  ? `${unreadCount} ${unreadSuffix}`
                  : caughtUpText}
              </p>
            </div>
          </div>
          {unreadCount ? (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              {markAllText}
            </button>
          ) : null}
        </header>

        <div className="flex flex-1 flex-col gap-6 px-4 py-5">
          {loading && (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="animate-pulse rounded-3xl border border-slate-100 bg-white p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-2xl bg-slate-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/3 rounded bg-slate-200" />
                      <div className="h-3 w-3/4 rounded bg-slate-100" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && groups.map((group) => {
            const groupTitle = t?.notifications?.groups?.[group] || group
            const groupItems = items.filter((i) => i.group === group)
            if (!groupItems.length) return null

            return (
              <section key={group}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {groupTitle}
                </h2>
                <div className="flex flex-col gap-3">
                  {groupItems.map((item) => {
                    const meta = TYPE_META[item.type] || { tone: "bg-slate-50 text-slate-600" }
                    const Icon = TYPE_ICON[item.type] || BellIcon
                    const title = item.title
                    const body = item.body

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleMarkRead(item)}
                        className={`flex w-full items-start gap-3 rounded-3xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]
                          ${item.unread ? "border-blue-200 bg-blue-50/50" : "border-slate-100 bg-white"}`}
                      >
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${meta.tone}`}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-bold text-slate-800">{title}</span>
                            {item.unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" /> : null}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-600 leading-relaxed">{body}</span>
                          <span className="mt-1.5 block text-[11px] font-medium text-slate-400">{item.time}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}

          {!loading && !items.length && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-white/60 py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
                <CheckDoubleIcon className="h-7 w-7" />
              </span>
              <p className="text-sm font-semibold text-slate-700">{emptyText}</p>
              <p className="text-xs text-slate-400">
                {currentRole === "doctor"
                  ? "New consultation requests, patient symptom alerts, and prescription logs will appear here."
                  : "All caught up! No unread notifications right now."}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

/* ---------- Inline icons ---------- */
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

function StethoscopeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.8 2.3A2 2 0 0 0 3 4v6a5 5 0 0 0 10 0V4" />
      <path d="M8 15v1a6 6 0 0 0 12 0v-3" />
      <circle cx="20" cy="10" r="2" />
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
  consultation: StethoscopeIcon,
  reminder: CalendarIcon,
  new_symptom: StethoscopeIcon,
  symptom: StethoscopeIcon,
}
