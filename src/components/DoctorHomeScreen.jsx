import { useState, useEffect } from "react"
import { DOCTOR_HELPLINE_TEL, DOCTOR_HELPLINE_DISPLAY } from "../lib/config.js"
import { getDoctorCases, getAshaWorkersList, getAuthUser } from "../lib/api.js"

/**
 * AyushLink — Doctor Home Screen
 * React + JavaScript + Tailwind CSS
 *
 * Landing dashboard for the "Doctor" role.
 * Connects to live MongoDB backend for real patient consultation queue,
 * real submitted symptoms, and ASHA worker directory.
 */

const STATUS_STYLE = {
  waiting: "bg-blue-50 text-blue-700",
  urgent: "bg-red-50 text-red-700",
  critical: "bg-red-50 text-red-700",
  review: "bg-amber-50 text-amber-700",
  new: "bg-slate-100 text-slate-600",
  stable: "bg-emerald-50 text-emerald-700",
}

export default function DoctorHomeScreen({ onSelect, onBack }) {
  const [queue, setQueue] = useState([])
  const [ashaWorkers, setAshaWorkers] = useState([])
  const [showAshaModal, setShowAshaModal] = useState(false)
  const [calling, setCalling] = useState(null)
  const [loading, setLoading] = useState(true)
  const [doctorProfile, setDoctorProfile] = useState(() => {
    const auth = getAuthUser()
    return {
      name: auth?.full_name || auth?.name || "Doctor",
      qualification: auth?.specialization ? `${auth.specialization} · On duty` : "Medical Officer · On duty",
    }
  })

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true)
        const authUser = getAuthUser()
        if (authUser?.full_name || authUser?.name) {
          setDoctorProfile({
            name: authUser.full_name || authUser.name,
            qualification: authUser.specialization ? `${authUser.specialization} · On duty` : (authUser.qualification || "Medical Officer · On duty"),
          })
        }

        // 1. Fetch real patient consultation cases & symptoms from MongoDB
        const cases = await getDoctorCases()
        if (Array.isArray(cases)) {
          const liveQueue = cases.map((c, idx) => ({
            id: c.patient_id || `q-${idx}`,
            name: c.full_name || "Patient",
            village: c.village || "Chandapur",
            age: c.age || 30,
            gender: c.gender || "Female",
            symptoms: c.recent_symptoms || [],
            reason: c.recent_symptoms?.length
              ? c.recent_symptoms.map((s) => s.symptoms?.join(", ") || s.description).join("; ")
              : (c.condition || "Consultation Request"),
            waiting: `${Math.max(2, (idx + 1) * 4)} min`,
            status: c.status === "urgent" || c.status === "critical" ? "urgent" : (c.status === "review" ? "waiting" : "stable"),
          }))
          setQueue(liveQueue)
        }

        // 2. Fetch real ASHA workers from MongoDB
        try {
          const ashas = await getAshaWorkersList()
          if (Array.isArray(ashas)) {
            setAshaWorkers(ashas)
          }
        } catch {}
      } catch {
        setQueue([])
      } finally {
        setLoading(false)
      }
    }
    loadDashboardData()
  }, [])

  const placeCall = (patient) => {
    setCalling(patient?.id ?? "line")
    window.location.href = DOCTOR_HELPLINE_TEL
  }

  const handleShortcutClick = (id) => {
    if (id === "asha-workers") {
      setShowAshaModal(true)
    } else {
      onSelect?.(id)
    }
  }

  return (
    <div className="min-h-dvh w-full bg-slate-50 text-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/85 px-5 py-4 backdrop-blur sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Sign out"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-200 hover:bg-slate-50 hover:text-emerald-600"
          >
            <BackIcon className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 shadow-lg shadow-emerald-600/30">
              <StethoscopeIcon className="h-5 w-5 text-white" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{doctorProfile.name}</p>
              <p className="truncate text-xs text-slate-500">{doctorProfile.qualification || "Doctor · On duty"}</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSelect?.("notifications")}
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-200 hover:text-emerald-600"
          aria-label="Notifications"
        >
          <BellIcon className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {queue.length}
          </span>
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6 pb-28 sm:px-8">
        {/* Consultation helpline card */}
        <section className="flex items-center justify-between gap-4 rounded-3xl bg-emerald-600 p-6 text-white shadow-lg shadow-emerald-600/25">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              <PhoneCallIcon className="h-7 w-7" />
            </span>
            <div>
              <p className="text-sm font-medium text-emerald-100">Consultation line</p>
              <p className="text-lg font-bold">{DOCTOR_HELPLINE_DISPLAY}</p>
              <p className="text-xs text-emerald-100/90">AyushLink Teleconsultation Hotline</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => placeCall(null)}
            className="shrink-0 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-emerald-700 shadow transition hover:bg-emerald-50 active:scale-95"
          >
            Call now
          </button>
        </section>

        {/* Today's patient consultation queue */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Today&apos;s patient queue</h2>
            <button
              type="button"
              onClick={() => onSelect?.("patients")}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
            >
              View all patients ({queue.length})
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {loading ? (
              <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-100">
                <p className="text-sm text-slate-400">Loading consultation queue from MongoDB…</p>
              </div>
            ) : queue.length > 0 ? (
              queue.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:p-5"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-sm font-bold text-emerald-700">
                    {p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-800">{p.name}</p>
                      <span className="font-mono text-xs text-slate-400">({p.id})</span>
                    </div>
                    <p className="truncate text-xs text-slate-500 mt-0.5">
                      {p.village} · {p.age}y · {p.gender}
                    </p>
                    <p className="truncate text-xs font-medium text-emerald-700 mt-1 bg-emerald-50/70 px-2 py-0.5 rounded-lg inline-block">
                      {p.reason}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelect?.("patients")}
                    className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white shadow transition hover:bg-emerald-700 active:scale-95"
                  >
                    View Details
                  </button>
                </div>
              ))
            ) : (
              <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-100">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <StethoscopeIcon className="h-6 w-6" />
                </span>
                <p className="mt-3 text-sm font-bold text-slate-700">Queue is Clear</p>
                <p className="mt-1 text-xs text-slate-400">No active patient consultations waiting right now.</p>
              </div>
            )}
          </div>
        </section>

        {/* Shortcuts */}
        <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
          {[
            { id: "patients", label: "Patients", Icon: UsersIcon },
            { id: "asha-workers", label: "ASHA Workers", Icon: UsersIcon },
            { id: "mch", label: "Maternal & Child", Icon: MchIcon },
            { id: "prescriptions", label: "Prescriptions", Icon: RxIcon },
            { id: "sync", label: "Pending Sync", Icon: SyncIcon },
            { id: "notifications", label: "Notifications", Icon: BellIcon },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleShortcutClick(id)}
              className="flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-3xl bg-white p-4 text-center shadow-sm ring-1 ring-slate-100 transition hover:shadow-md active:scale-[0.98]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-xs font-semibold leading-snug text-slate-700">{label}</span>
            </button>
          ))}
        </section>
      </main>

      {/* ASHA Workers Directory Modal for Doctor */}
      {showAshaModal && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center" onClick={() => setShowAshaModal(false)}>
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <UsersIcon className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">ASHA Worker Directory</h2>
                  <p className="text-xs text-slate-500">Live records from MongoDB ({ashaWorkers.length} active)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAshaModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              {ashaWorkers.length > 0 ? (
                ashaWorkers.map((a) => (
                  <div key={a.worker_id || a.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-slate-800 text-sm">{a.full_name}</p>
                      <span className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded">
                        {a.worker_id}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      <span className="font-semibold">Phone:</span> +91 {a.phone}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      <span className="font-semibold">Villages:</span> {a.assigned_villages?.join(", ") || "Chandapur"}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <span className="font-semibold">PHC:</span> {a.primary_phc || "Chandapur PHC"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400 py-4 text-center">Loading ASHA worker directory...</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowAshaModal(false)}
              className="mt-6 w-full rounded-2xl bg-slate-100 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition"
            >
              Close
            </button>
          </div>
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

function StethoscopeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.8 2.3A2 2 0 0 0 3 4v6a5 5 0 0 0 10 0V4" />
      <path d="M8 15v1a6 6 0 0 0 12 0v-3" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  )
}

function BellIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

function PhoneCallIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function UsersIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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

function SyncIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M3 16v4h4" />
      <path d="M21 8V4h-4" />
    </svg>
  )
}
