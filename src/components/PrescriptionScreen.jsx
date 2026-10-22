import { useState, useEffect, useMemo } from "react"
import { ashaT } from "../lib/ashaI18n.js"
import { getPatientsList, getPatientPrescriptions } from "../lib/api.js"

/**
 * AyushLink — Digital Prescription (ASHA Worker Screen)
 * React + JavaScript + Tailwind CSS
 *
 * Workflow:
 * 1. ASHA worker selects a patient from their assigned village registry.
 * 2. Search / filter patients by name, ID, phone, or village.
 * 3. Clearly display the selected patient's identity.
 * 4. Load & display all digital prescriptions issued by doctors for this patient.
 * 5. If no prescriptions exist, show "No prescriptions found for this patient".
 * 6. Detailed clinical prescription view with medicine dosage, advice, and print/PDF support.
 */

function formatDate(dateVal) {
  if (!dateVal) return "—"
  try {
    const d = new Date(dateVal)
    if (isNaN(d.getTime())) return String(dateVal)
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
  } catch {
    return String(dateVal)
  }
}

/* ---------- Inline Icons ---------- */
function BackIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
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

function SearchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
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

function StethoscopeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 3v6a5 5 0 0 0 10 0V3" />
      <path d="M9 14v2a6 6 0 0 0 12 0v-2" />
      <circle cx="21" cy="10" r="2" />
    </svg>
  )
}

function DownloadIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  )
}

function PillIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
      <path d="m8.5 8.5 7 7" />
    </svg>
  )
}

function RefreshIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 21h5v-5" />
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

export default function PrescriptionScreen({ lang = "en", onBack }) {
  // Patient selection states
  const [patients, setPatients] = useState([])
  const [loadingPatients, setLoadingPatients] = useState(true)
  const [patientListError, setPatientListError] = useState(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedPatient, setSelectedPatient] = useState(null)

  // Prescriptions state for selected patient
  const [prescriptions, setPrescriptions] = useState([])
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(false)
  const [prescriptionsError, setPrescriptionsError] = useState(null)
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState(null)

  const [toast, setToast] = useState("")
  const t = ashaT(lang)

  // 1. Fetch village-assigned patients
  const loadPatients = async () => {
    try {
      setLoadingPatients(true)
      setPatientListError(null)
      const data = await getPatientsList()
      if (Array.isArray(data)) {
        setPatients(data)
      } else {
        setPatients([])
      }
    } catch (err) {
      console.error("[PrescriptionScreen] Failed to load patients:", err)
      setPatientListError(err?.message || "Failed to load assigned village patients. Please check your network and retry.")
      setPatients([])
    } finally {
      setLoadingPatients(false)
    }
  }

  useEffect(() => {
    loadPatients()
  }, [])

  // 2. Fetch prescriptions when a patient is selected
  const fetchPrescriptions = async (patient) => {
    if (!patient) return
    const pid = patient.patient_id || patient.id
    if (!pid) return

    try {
      setLoadingPrescriptions(true)
      setPrescriptionsError(null)
      const list = await getPatientPrescriptions(pid)
      if (Array.isArray(list)) {
        setPrescriptions(list)
      } else {
        setPrescriptions([])
      }
    } catch (err) {
      console.error("[PrescriptionScreen] Failed to load prescriptions:", err)
      setPrescriptionsError(err?.message || "Failed to load digital prescriptions for this patient.")
      setPrescriptions([])
    } finally {
      setLoadingPrescriptions(false)
    }
  }

  useEffect(() => {
    if (selectedPatient) {
      fetchPrescriptions(selectedPatient)
    } else {
      setPrescriptions([])
      setPrescriptionsError(null)
      setSelectedPrescriptionId(null)
    }
  }, [selectedPatient])

  // 3. Filter patients by search query
  const filteredPatients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return patients
    return patients.filter((p) => {
      const name = (p.full_name || p.name || "").toLowerCase()
      const pid = (p.patient_id || p.id || "").toLowerCase()
      const phone = (p.phone || "").toLowerCase()
      const village = (p.village || "").toLowerCase()
      return name.includes(q) || pid.includes(q) || phone.includes(q) || village.includes(q)
    })
  }, [patients, searchQuery])

  // Active detail prescription
  const selectedPrescription = useMemo(() => {
    if (!selectedPrescriptionId) return null
    return (
      prescriptions.find(
        (p) => (p.prescription_id || p.id) === selectedPrescriptionId
      ) || null
    )
  }, [prescriptions, selectedPrescriptionId])

  const flash = (msg) => {
    setToast(msg)
    window.clearTimeout(flash._t)
    flash._t = window.setTimeout(() => setToast(""), 2800)
  }

  const handleDownloadPdf = () => {
    window.print()
  }

  const handleBack = () => {
    if (selectedPrescriptionId) {
      setSelectedPrescriptionId(null)
    } else if (selectedPatient) {
      setSelectedPatient(null)
      setSearchQuery("")
    } else {
      onBack?.()
    }
  }

  return (
    <main className="min-h-dvh w-full bg-gradient-to-b from-blue-50 via-white to-sky-50 print:bg-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col print:hidden">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-blue-100 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={handleBack}
            aria-label={t.common?.goBack || "Back"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-blue-50 active:scale-95"
          >
            <BackIcon className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold text-slate-800">
              {t.prescriptions?.title || "Digital Prescription"}
            </h1>
            <p className="truncate text-xs text-slate-500">
              {selectedPrescription
                ? `Prescription ${selectedPrescription.prescription_id || selectedPrescription.id}`
                : selectedPatient
                ? `Patient: ${selectedPatient.full_name || selectedPatient.name} (${selectedPatient.patient_id || selectedPatient.id})`
                : "Select an assigned village patient"}
            </p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/30">
            <RxIcon className="h-5 w-5" />
          </span>
        </header>

        <div className="flex-1 px-4 py-5 sm:px-6">
          {/* Toast */}
          {toast && (
            <div
              role="status"
              className="mb-4 flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 animate-fadeIn"
            >
              <CheckIcon className="h-5 w-5 shrink-0" />
              <span>{toast}</span>
            </div>
          )}

          {/* =========================================================================
              VIEW 1: PATIENT SELECTION (When no patient is selected)
             ========================================================================= */}
          {!selectedPatient && (
            <div className="flex flex-col gap-5">
              {/* Introduction Card */}
              <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                    <UserIcon className="h-6 w-6" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-slate-800">Select Patient</h2>
                    <p className="text-xs text-slate-500">
                      Choose an assigned patient from your village to view their digital prescriptions.
                    </p>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative mt-4">
                  <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search patient by name, ID, village, or phone..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 py-3 pl-11 pr-10 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Patient List State: Loading */}
              {loadingPatients && (
                <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-slate-100 bg-white p-12 text-center shadow-sm">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  <p className="text-sm font-semibold text-slate-700">Loading assigned village patients...</p>
                </div>
              )}

              {/* Patient List State: Error */}
              {!loadingPatients && patientListError && (
                <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-red-200 bg-red-50/60 p-8 text-center">
                  <p className="text-sm font-semibold text-red-700">{patientListError}</p>
                  <button
                    type="button"
                    onClick={loadPatients}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-red-700"
                  >
                    <RefreshIcon className="h-4 w-4" />
                    Retry Loading Patients
                  </button>
                </div>
              )}

              {/* Patient List State: Empty Registry */}
              {!loadingPatients && !patientListError && patients.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-white/70 p-12 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                    <UserIcon className="h-6 w-6" />
                  </span>
                  <p className="text-sm font-bold text-slate-700">No patients found</p>
                  <p className="text-xs text-slate-500 max-w-xs">
                    No patients are currently registered in your assigned village.
                  </p>
                </div>
              )}

              {/* Patient List State: No Search Match */}
              {!loadingPatients && !patientListError && patients.length > 0 && filteredPatients.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-slate-200 bg-white/70 p-10 text-center">
                  <p className="text-sm font-semibold text-slate-700">No patients match "{searchQuery}"</p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="text-xs font-semibold text-blue-600 underline"
                  >
                    Clear search filter
                  </button>
                </div>
              )}

              {/* Patient List: Cards */}
              {!loadingPatients && !patientListError && filteredPatients.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Assigned Patients ({filteredPatients.length})
                    </span>
                    <span className="text-xs text-slate-500">Tap to select</span>
                  </div>

                  {filteredPatients.map((patient) => {
                    const pid = patient.patient_id || patient.id
                    const name = patient.full_name || patient.name || "Patient"
                    const village = patient.village || "Chandapur"
                    const age = patient.age ? `${patient.age}y` : null
                    const gender = patient.gender
                      ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)
                      : null

                    return (
                      <button
                        key={pid}
                        type="button"
                        onClick={() => setSelectedPatient(patient)}
                        className="group flex items-center gap-4 rounded-3xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 active:scale-[0.99]"
                      >
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                          <UserIcon className="h-6 w-6" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-base font-bold capitalize text-slate-800">{name}</span>
                            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                              {pid}
                            </span>
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <MapPinIcon className="h-3.5 w-3.5 text-slate-400" />
                              {village}
                            </span>
                            {age && <span>{age}</span>}
                            {gender && <span>{gender}</span>}
                            {patient.phone && (
                              <span className="text-slate-400">+91 {patient.phone}</span>
                            )}
                          </div>
                        </div>

                        <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-600" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              VIEW 2: SELECTED PATIENT'S PRESCRIPTIONS
             ========================================================================= */}
          {selectedPatient && !selectedPrescription && (
            <div className="flex flex-col gap-5">
              {/* Selected Patient Identity Card */}
              <div className="rounded-3xl border border-blue-200 bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white">
                      <UserIcon className="h-7 w-7" />
                    </span>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-blue-100">
                        Selected Patient
                      </p>
                      <h2 className="text-xl font-extrabold leading-tight capitalize text-white">
                        {selectedPatient.full_name || selectedPatient.name}
                      </h2>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-md bg-white/20 px-2 py-0.5 font-semibold text-white">
                          {selectedPatient.patient_id || selectedPatient.id}
                        </span>
                        <span className="rounded-md bg-white/20 px-2 py-0.5 font-medium text-blue-50">
                          {selectedPatient.village || "Chandapur"}
                        </span>
                        {selectedPatient.age && (
                          <span className="rounded-md bg-white/20 px-2 py-0.5 text-blue-50">
                            {selectedPatient.age} yrs
                          </span>
                        )}
                        {selectedPatient.gender && (
                          <span className="rounded-md bg-white/20 px-2 py-0.5 text-blue-50 capitalize">
                            {selectedPatient.gender}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatient(null)
                      setSelectedPrescriptionId(null)
                      setSearchQuery("")
                    }}
                    className="shrink-0 rounded-xl bg-white/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/30 active:scale-95"
                  >
                    Change Patient
                  </button>
                </div>
              </div>

              {/* Prescription Loading */}
              {loadingPrescriptions && (
                <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-slate-100 bg-white p-12 text-center shadow-sm">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  <p className="text-sm font-semibold text-slate-700">
                    Loading digital prescriptions for {selectedPatient.full_name || selectedPatient.name}...
                  </p>
                </div>
              )}

              {/* Prescription Error */}
              {!loadingPrescriptions && prescriptionsError && (
                <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-red-200 bg-red-50/70 p-8 text-center">
                  <p className="text-sm font-semibold text-red-700">{prescriptionsError}</p>
                  <button
                    type="button"
                    onClick={() => fetchPrescriptions(selectedPatient)}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-red-700"
                  >
                    <RefreshIcon className="h-4 w-4" />
                    Retry
                  </button>
                </div>
              )}

              {/* Requirement 5: Empty Prescriptions Message */}
              {!loadingPrescriptions && !prescriptionsError && prescriptions.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-white/80 p-12 text-center shadow-sm">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                    <RxIcon className="h-7 w-7" />
                  </span>
                  <h3 className="text-base font-bold text-slate-800">
                    No prescriptions found for this patient
                  </h3>
                  <p className="max-w-md text-xs leading-relaxed text-slate-500">
                    There are no digital prescriptions on record for{" "}
                    <span className="font-semibold text-slate-700">
                      {selectedPatient.full_name || selectedPatient.name}
                    </span>
                    . Prescriptions issued by a doctor during consultation will appear here.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatient(null)
                      setSearchQuery("")
                    }}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                  >
                    <UserIcon className="h-4 w-4" />
                    Select Another Patient
                  </button>
                </div>
              )}

              {/* Prescriptions List */}
              {!loadingPrescriptions && !prescriptionsError && prescriptions.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Issued Prescriptions ({prescriptions.length})
                    </span>
                    <span className="text-xs text-slate-500">Tap to inspect details</span>
                  </div>

                  {prescriptions.map((rx) => {
                    const rxId = rx.prescription_id || rx.id
                    const doctorName = rx.doctor_name || "Primary Doctor"
                    const diagnosis = rx.diagnosis || "Medical Consultation"
                    const dateStr = formatDate(rx.date || rx.created_at)
                    const medicinesCount = Array.isArray(rx.medicines) ? rx.medicines.length : 0
                    const statusVal = rx.status || "active"

                    return (
                      <button
                        key={rxId}
                        type="button"
                        onClick={() => setSelectedPrescriptionId(rxId)}
                        className="group flex items-start gap-4 rounded-3xl border border-slate-100 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 active:scale-[0.99]"
                      >
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                          <RxIcon className="h-6 w-6" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="rounded-md bg-blue-50 px-2.5 py-0.5 text-xs font-bold tracking-wide text-blue-700">
                              {rxId}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                statusVal === "requested"
                                  ? "bg-amber-100 text-amber-700"
                                  : statusVal === "completed" || rx.is_dispensed
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {statusVal}
                            </span>
                          </div>

                          <h3 className="mt-2 text-base font-bold text-slate-800 line-clamp-1">
                            {diagnosis}
                          </h3>

                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1 font-medium text-slate-700">
                              <StethoscopeIcon className="h-3.5 w-3.5 text-blue-600" />
                              {doctorName}
                            </span>
                            <span>·</span>
                            <span>{dateStr}</span>
                            <span>·</span>
                            <span className="flex items-center gap-1 text-slate-600">
                              <PillIcon className="h-3.5 w-3.5 text-slate-400" />
                              {medicinesCount} {medicinesCount === 1 ? "medicine" : "medicines"}
                            </span>
                          </div>

                          {/* Medicine names preview */}
                          {medicinesCount > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {rx.medicines.slice(0, 3).map((m, idx) => (
                                <span
                                  key={idx}
                                  className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                                >
                                  {m.name}
                                </span>
                              ))}
                              {medicinesCount > 3 && (
                                <span className="rounded-lg bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-400 font-medium">
                                  +{medicinesCount - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <ChevronRightIcon className="mt-2 h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-600" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              VIEW 3: PRESCRIPTION DETAIL VIEW
             ========================================================================= */}
          {selectedPrescription && (
            <div className="flex flex-col gap-4">
              {/* Prescription Header Card */}
              <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/30">
                      <RxIcon className="h-6 w-6" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Digital Prescription
                      </p>
                      <h2 className="text-lg font-extrabold text-slate-800">
                        {selectedPrescription.prescription_id || selectedPrescription.id}
                      </h2>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                      selectedPrescription.status === "requested"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {selectedPrescription.status || "active"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">Patient</p>
                    <p className="font-bold text-slate-800">
                      {selectedPrescription.patient_name || selectedPatient?.full_name || selectedPatient?.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {selectedPrescription.patient_id || selectedPatient?.patient_id} ·{" "}
                      {selectedPrescription.patient_village || selectedPatient?.village || "Chandapur"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Prescribing Doctor</p>
                    <p className="font-bold text-slate-800">
                      {selectedPrescription.doctor_name || "Doctor"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(selectedPrescription.date || selectedPrescription.created_at)}
                    </p>
                  </div>
                </div>
              </section>

              {/* Diagnosis */}
              <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600">Clinical Diagnosis</h3>
                <p className="mt-2 text-base font-semibold leading-relaxed text-slate-800">
                  {selectedPrescription.diagnosis || "General Consultation"}
                </p>
              </section>

              {/* Medicines List */}
              <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600">
                    Prescribed Medicines ({(selectedPrescription.medicines || []).length})
                  </h3>
                  <span className="text-xs font-medium text-slate-400">Dosage & Instructions</span>
                </div>

                <div className="mt-3 flex flex-col gap-2.5">
                  {(selectedPrescription.medicines || []).map((m, idx) => (
                    <div key={idx} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-800">{m.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                            {m.dosage && (
                              <span className="rounded bg-white px-2 py-0.5 font-medium border border-slate-200">
                                {m.dosage}
                              </span>
                            )}
                            {m.frequency && (
                              <span className="rounded bg-white px-2 py-0.5 text-slate-600 border border-slate-200">
                                {m.frequency}
                              </span>
                            )}
                            {m.duration && (
                              <span className="rounded bg-white px-2 py-0.5 text-slate-600 border border-slate-200">
                                {m.duration}
                              </span>
                            )}
                          </div>
                          {m.instructions && (
                            <p className="mt-1.5 text-xs italic text-slate-500">
                              Note: {m.instructions}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Advice & Instructions */}
              {(selectedPrescription.instructions || selectedPrescription.advice) && (
                <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600">
                    Doctor's Advice & Guidelines
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">
                    {selectedPrescription.instructions || selectedPrescription.advice}
                  </p>
                </section>
              )}

              {/* Clinical Notes */}
              {selectedPrescription.notes && (
                <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600">Additional Notes</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{selectedPrescription.notes}</p>
                </section>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-3 sm:flex-row pt-2">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm font-bold text-blue-700 transition hover:bg-blue-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 active:scale-[0.98]"
                >
                  <DownloadIcon className="h-5 w-5" />
                  Print / Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPrescriptionId(null)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 active:scale-[0.98]"
                >
                  Back to Patient Prescriptions
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          PRINT-ONLY LAYOUT (Active during window.print())
         ========================================================================= */}
      {selectedPrescription && (
        <div className="hidden print:block p-10 text-slate-900">
          <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4">
            <div>
              <p className="text-2xl font-bold">
                Ayush<span className="text-blue-600">Link</span>
              </p>
              <p className="text-xs text-slate-600">National Rural Health Digital Network</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-bold">{selectedPrescription.doctor_name || "Doctor"}</p>
              <p className="text-xs text-slate-600">
                Rx ID: {selectedPrescription.prescription_id || selectedPrescription.id}
              </p>
              <p className="text-xs text-slate-600">
                Date: {formatDate(selectedPrescription.date || selectedPrescription.created_at)}
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase text-slate-500 font-semibold">Patient</p>
              <p className="font-bold">
                {selectedPrescription.patient_name || selectedPatient?.full_name || selectedPatient?.name}
              </p>
              <p className="text-xs text-slate-600">
                ID: {selectedPrescription.patient_id || selectedPatient?.patient_id} · Village:{" "}
                {selectedPrescription.patient_village || selectedPatient?.village || "Chandapur"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500 font-semibold">Diagnosis</p>
              <p className="font-bold">{selectedPrescription.diagnosis || "General Consultation"}</p>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-xs uppercase text-slate-500 font-bold border-b border-slate-300 pb-1">
              Rx — Prescribed Medicines
            </p>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-400 text-left text-xs uppercase text-slate-600">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Medicine Name</th>
                  <th className="py-2 pr-2">Dosage</th>
                  <th className="py-2 pr-2">Frequency</th>
                  <th className="py-2">Duration</th>
                </tr>
              </thead>
              <tbody>
                {(selectedPrescription.medicines || []).map((m, i) => (
                  <tr key={i} className="border-b border-slate-200">
                    <td className="py-2 pr-2">{i + 1}</td>
                    <td className="py-2 pr-2 font-semibold">{m.name}</td>
                    <td className="py-2 pr-2">{m.dosage || "As directed"}</td>
                    <td className="py-2 pr-2">{m.frequency || "Twice daily"}</td>
                    <td className="py-2">{m.duration || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(selectedPrescription.instructions || selectedPrescription.advice) && (
            <div className="mt-6">
              <p className="text-xs uppercase text-slate-500 font-bold">Doctor's Advice & Guidelines</p>
              <p className="mt-1 text-sm">{selectedPrescription.instructions || selectedPrescription.advice}</p>
            </div>
          )}

          {selectedPrescription.notes && (
            <div className="mt-4">
              <p className="text-xs uppercase text-slate-500 font-bold">Notes</p>
              <p className="mt-1 text-sm">{selectedPrescription.notes}</p>
            </div>
          )}

          <div className="mt-16 flex justify-end">
            <div className="text-center text-sm">
              <p className="border-t border-slate-500 px-8 pt-1 font-semibold">
                {selectedPrescription.doctor_name || "Doctor"}
              </p>
              <p className="text-xs text-slate-500">Authorized Medical Officer</p>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
