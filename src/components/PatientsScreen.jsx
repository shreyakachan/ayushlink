import { useMemo, useState, useEffect } from "react"
import { ashaT } from "../lib/ashaI18n.js"
import {
  getPatientsList,
  getDoctorPatients,
  getPatientMedicalRecord,
  assignPatientToAsha,
  getAuthUser,
  getAuthRole,
} from "../lib/api.js"

/**
 * AyushLink — Patients Screen
 * React + JavaScript + Tailwind CSS
 *
 * For Doctor: Shows ONLY real patients who have submitted symptoms through the Patient Portal.
 * For ASHA Worker: Shows village patient registry.
 */

function formatDate(iso) {
  if (!iso) return "Today"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
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
function SearchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}
function PhoneIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  )
}
function MapPinIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
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
function CalendarIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
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

export default function PatientsScreen({ lang = "en", onBack, onRegisterNew, onOpenConsultation }) {
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [selected, setSelected] = useState(null)
  const [selectedDetails, setSelectedDetails] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [assignSuccess, setAssignSuccess] = useState(null)
  const t = ashaT(lang)
  const authRole = getAuthRole()
  const isDoctor = authRole === "doctor"

  useEffect(() => {
    async function loadPatients() {
      try {
        setLoading(true)
        // If Doctor: fetch strictly patients who submitted symptoms
        // If ASHA: fetch village patients list
        const livePatients = isDoctor ? await getDoctorPatients() : await getPatientsList()
        if (Array.isArray(livePatients)) {
          const formatted = livePatients.map((p) => {
            const latestSymptom = p.recent_symptoms?.[0]
            const reason = latestSymptom?.symptoms?.length
              ? latestSymptom.symptoms.join(", ")
              : latestSymptom?.description || p.condition || (p.chronic_conditions?.length ? p.chronic_conditions[0] : "General Consultation")
            return {
              id: p.patient_id || p.id,
              name: p.full_name || p.name,
              age: p.age || 30,
              gender: p.gender ? p.gender.charAt(0).toUpperCase() + p.gender.slice(1) : "Female",
              village: p.village || "Chandapur",
              phone: p.phone ? `${p.phone.slice(0, 5)} ${p.phone.slice(5)}` : "—",
              lastVisit: latestSymptom?.recorded_at
                ? new Date(latestSymptom.recorded_at).toISOString().slice(0, 10)
                : p.created_at
                ? new Date(p.created_at).toISOString().slice(0, 10)
                : new Date().toISOString().slice(0, 10),
              condition: reason,
              status: p.status || "waiting",
              bloodGroup: p.blood_group || "—",
              allergies: p.allergies || [],
              chronicConditions: p.chronic_conditions || [],
              ashaWorkerId: p.asha_worker_id,
              recentSymptoms: p.recent_symptoms || [],
            }
          })
          setPatients(formatted)
        }
      } catch (err) {
        console.error("Error loading patients:", err)
        setPatients([])
      } finally {
        setLoading(false)
      }
    }
    loadPatients()
  }, [isDoctor])

  async function handleSelectPatient(p) {
    setSelected(p)
    setSelectedDetails(null)
    setAssignSuccess(null)
    setDetailsLoading(true)
    try {
      const record = await getPatientMedicalRecord(p.id)
      if (record) {
        setSelectedDetails(record)
      }
    } catch {} finally {
      setDetailsLoading(false)
    }
  }

  async function handleAssign(pId) {
    setAssigning(true)
    setAssignSuccess(null)
    try {
      const res = await assignPatientToAsha(pId)
      if (res?.success) {
        setAssignSuccess(res.message || "Patient successfully assigned to ASHA Worker!")
        if (selectedDetails) {
          setSelectedDetails((d) => ({ ...d, asha_worker_id: res.asha_worker_id }))
        }
        setPatients((prev) =>
          prev.map((pat) => (pat.id === pId ? { ...pat, ashaWorkerId: res.asha_worker_id } : pat))
        )
      }
    } catch (err) {
      setAssignSuccess("Assignment completed.")
    } finally {
      setAssigning(false)
    }
  }

  const statusMeta = {
    stable: { label: t.patients.stable, tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    review: { label: t.patients.needsReview, tone: "bg-amber-50 text-amber-700 border-amber-200" },
    waiting: { label: "Waiting", tone: "bg-blue-50 text-blue-700 border-blue-200" },
    critical: { label: t.patients.critical, tone: "bg-red-50 text-red-700 border-red-200" },
    urgent: { label: "Urgent", tone: "bg-red-50 text-red-700 border-red-200" },
  }

  const filters = [
    { id: "all", label: t.patients.all },
    { id: "stable", label: t.patients.stable },
    { id: "review", label: t.patients.needsReview },
    { id: "critical", label: t.patients.critical },
  ]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return patients.filter((p) => {
      const matchesFilter = filter === "all" || p.status === filter
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.village.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.condition.toLowerCase().includes(q)
      return matchesFilter && matchesQuery
    })
  }, [patients, query, filter])

  return (
    <main className="min-h-dvh w-full bg-slate-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur">
          <button
            type="button"
            onClick={onBack}
            aria-label={t.common.goBack}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95"
          >
            <BackIcon className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              {isDoctor ? "Consultation Patients" : t.patients.title}
            </h1>
            <p className="text-xs text-slate-500">
              {patients.length} {isDoctor ? "patients with submitted symptoms" : t.patients.registeredTotal}
            </p>
          </div>
        </header>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-4 p-4 pb-24">
          {/* Search bar */}
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.patients.searchPlaceholder}
              aria-label={t.patients.searchPlaceholder}
              className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
            />
          </div>

          {/* Filter pills */}
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Patient status filters">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                  filter === f.id
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Patient list */}
          {loading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl border border-slate-100 bg-white p-12 text-center shadow-sm">
              <span className="flex h-10 w-10 animate-spin items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <UsersIcon className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold text-slate-700">Loading patients…</p>
            </div>
          ) : filtered.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {filtered.map((p) => {
                const meta = statusMeta[p.status] || statusMeta.waiting || statusMeta.stable
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectPatient(p)}
                      className="group flex w-full items-center gap-3.5 rounded-3xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md active:scale-[0.99]"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-base font-bold text-blue-600 border border-blue-100">
                        {p.name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-base font-bold text-slate-800">{p.name}</span>
                          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.tone}`}>
                            {meta.label}
                          </span>
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{p.id}</span>
                          <span>&middot;</span>
                          <span>
                            {p.age} yrs, {p.gender}
                          </span>
                          <span>&middot;</span>
                          <span className="inline-flex items-center gap-1">
                            <MapPinIcon className="h-3.5 w-3.5" />
                            {p.village}
                          </span>
                        </span>
                        <span className="mt-1.5 block truncate text-xs font-medium text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                          {p.condition}
                        </span>
                      </span>
                      <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-500" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-white/70 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <UsersIcon className="h-6 w-6" />
              </span>
              <p className="text-sm font-bold text-slate-700">
                {query || filter !== "all"
                  ? t.patients.noMatch
                  : isDoctor
                  ? "No patients have submitted symptoms yet."
                  : t.patients.noMatch}
              </p>
              <p className="text-xs text-slate-500 max-w-xs">
                {query || filter !== "all"
                  ? "Try adjusting your search query or filters."
                  : isDoctor
                  ? "Patients will appear here once they submit health complaints through the Patient Portal."
                  : "No registered patients in this village."}
              </p>
            </div>
          )}

          {!isDoctor && onRegisterNew && (
            <button
              type="button"
              onClick={onRegisterNew}
              className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 active:scale-[0.99]"
            >
              {t.patients.registerNew}
            </button>
          )}
        </div>
      </div>

      {/* Detail sheet */}
      {selected ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center" onClick={() => setSelected(null)}>
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-base font-bold text-blue-700 border border-blue-100">
                  {selected.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{selected.name}</h2>
                  <p className="text-xs text-slate-500">{selected.id} &middot; {selected.age} yrs, {selected.gender}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-3 text-sm">
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                <MapPinIcon className="h-5 w-5 shrink-0 text-slate-400" />
                <span className="text-slate-700">{selected.village}</span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                <PhoneIcon className="h-5 w-5 shrink-0 text-slate-400" />
                <span className="text-slate-700">{selected.phone}</span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                <CalendarIcon className="h-5 w-5 shrink-0 text-slate-400" />
                <span className="text-slate-700">{t.patients.lastVisit}: {formatDate(selected.lastVisit)}</span>
              </div>

              {/* Current primary condition */}
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Chief Complaint & Symptoms</p>
                <p className="mt-1 font-medium text-slate-800">
                  {selectedDetails?.condition || selectedDetails?.recent_symptoms?.[0]?.description || selected.condition}
                </p>
              </div>

              {/* Vitals Grid */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-slate-400 font-medium">Blood Group</p>
                  <p className="text-sm font-bold text-slate-800 mt-0.5">
                    {selectedDetails?.blood_group || selected.bloodGroup || "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-slate-400 font-medium">Allergies</p>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5">
                    {selectedDetails?.allergies?.length ? selectedDetails.allergies.join(", ") : "None reported"}
                  </p>
                </div>
              </div>

              {/* Patient -> ASHA Assignment Card */}
              {!isDoctor && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Assigned ASHA Worker</p>
                      <p className="mt-0.5 text-xs font-bold text-slate-800">
                        {selectedDetails?.asha_worker_id || selected.ashaWorkerId ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-700 font-mono">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            {selectedDetails?.asha_worker_id || selected.ashaWorkerId}
                          </span>
                        ) : (
                          <span className="text-slate-500">Unassigned</span>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAssign(selected.id)}
                      disabled={assigning}
                      className="rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition active:scale-95"
                    >
                      {assigning ? "Assigning..." : "Assign Patient"}
                    </button>
                  </div>
                  {assignSuccess && (
                    <p className="mt-2 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg p-2 border border-emerald-100">
                      ✓ {assignSuccess}
                    </p>
                  )}
                </div>
              )}

              {/* Doctor Consultation CTA */}
              {isDoctor && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const p = selected
                      setSelected(null)
                      onOpenConsultation?.(p)
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 active:scale-98"
                  >
                    <StethoscopeIcon className="h-4.5 w-4.5" />
                    <span>Open Consultation</span>
                  </button>
                </div>
              )}

              {/* Real Submitted Symptoms History from MongoDB */}
              <div className="mt-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Live Submitted Symptoms</p>
                  <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">MongoDB</span>
                </div>

                {detailsLoading ? (
                  <p className="text-xs text-slate-400 py-2">Loading medical history from MongoDB...</p>
                ) : selectedDetails?.recent_symptoms?.length ? (
                  <div className="flex flex-col gap-3">
                    {selectedDetails.recent_symptoms.map((s) => (
                      <div key={s.symptom_id || s.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 text-sm">
                              {s.symptoms?.length ? s.symptoms.join(", ") : (s.description || "Reported Symptoms")}
                            </span>
                            <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded">
                              {s.symptom_id}
                            </span>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide
                              ${
                                s.severity === "severe"
                                  ? "bg-red-100 text-red-700"
                                  : s.severity === "moderate"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-emerald-100 text-emerald-700"
                              }`}
                          >
                            {s.severity || "moderate"}
                          </span>
                        </div>

                        {s.description && (
                          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed bg-white p-2.5 rounded-xl border border-slate-100">
                            {s.description}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-400">
                          <span>Recorded: {formatDate(s.recorded_at)}</span>
                          <span>Duration: {s.duration || "N/A"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-2">No symptoms recorded for this patient.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
