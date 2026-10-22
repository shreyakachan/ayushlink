import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { ashaT } from "../lib/ashaI18n.js"
import { getPatientsList, sendEmergencySOS, getAuthToken, checkTokenExpiry } from "../lib/api.js"

/**
 * AyushLink — ASHA Worker Emergency SOS Screen
 *
 * Dedicated screen for ASHA workers:
 * 1. Requires explicitly selecting an assigned village patient.
 * 2. Requires a continuous 5-second press-and-hold trigger.
 * 3. Release before 5s cancels immediately without submitting.
 * 4. On full 5-second hold, dispatches exactly one authenticated SOS request
 *    for the selected patient ID without clobbering patient identity.
 */

const HOLD_DURATION = 5000 // 5 seconds in ms

function formatPatientName(name) {
  if (!name || typeof name !== "string") return "Patient"
  return name
    .replace(/^\[?demo\]?\s*/i, "")
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ")
}

function getInitials(name) {
  if (!name || typeof name !== "string") return "P"
  return (
    name
      .replace(/^\[?demo\]?\s*/i, "")
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0].toUpperCase())
      .slice(0, 2)
      .join("") || "P"
  )
}

export default function AshaEmergencySOSScreen({ lang = "en", onBack }) {
  // Patient registry state
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [patientListError, setPatientListError] = useState(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedPatient, setSelectedPatient] = useState(null)

  // Hold & submission states: "idle" | "holding" | "submitting" | "success" | "error"
  const [status, setStatus] = useState("idle")
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState(null)
  const [sosResponse, setSosResponse] = useState(null)

  const holdStart = useRef(null)
  const rafId = useRef(null)
  const isSubmittingRef = useRef(false)
  const activePointerId = useRef(null)

  const t = ashaT(lang)

  // 1. Load village patients
  const loadPatients = async () => {
    try {
      setLoading(true)
      setPatientListError(null)
      const data = await getPatientsList()
      if (Array.isArray(data)) {
        setPatients(data)
      } else {
        setPatients([])
      }
    } catch (err) {
      console.error("[AshaEmergencySOSScreen] Failed to load patients:", err)
      setPatientListError(err?.message || "Unable to load patient records. Please check your network and retry.")
      setPatients([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPatients()
  }, [])

  // 2. Filter patients by name, ID, phone, or village
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

  // 3. Selection Handlers
  const handleSelectPatient = (p) => {
    if (status === "submitting" || status === "holding") return
    if (selectedPatient && (selectedPatient.patient_id === p.patient_id || selectedPatient.id === p.id)) {
      setSelectedPatient(null)
    } else {
      setSelectedPatient(p)
    }
    // Clear previous submit results when switching patient
    if (status === "success" || status === "error") {
      setStatus("idle")
      setErrorMessage(null)
      setSosResponse(null)
    }
  }

  const handleClearSelection = () => {
    if (status === "submitting" || status === "holding") return
    setSelectedPatient(null)
    setStatus("idle")
    setProgress(0)
    setErrorMessage(null)
    setSosResponse(null)
  }

  // 4. Cancel Hold (called on release, blur, cancel, or tab switch)
  const cancelHold = useCallback(() => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current)
      rafId.current = null
    }
    holdStart.current = null
    activePointerId.current = null
    setProgress(0)
    setStatus((prev) => (prev === "holding" ? "idle" : prev))
  }, [])

  // Safely cleanup RAF & listeners on unmount or blur
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) cancelHold()
    }
    const handleWindowBlur = () => {
      cancelHold()
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("blur", handleWindowBlur)

    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("blur", handleWindowBlur)
    }
  }, [cancelHold])

  // 5. Submit Emergency SOS after full 5-second hold
  const executeEmergencySos = async () => {
    // Strictly prevent duplicate submissions
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true

    // Validate that a patient is explicitly selected
    if (!selectedPatient) {
      isSubmittingRef.current = false
      setStatus("idle")
      return
    }

    const patientId = selectedPatient.patient_id || selectedPatient.id
    if (!patientId) {
      isSubmittingRef.current = false
      setStatus("error")
      setErrorMessage("Selected patient does not have a valid Patient ID.")
      return
    }

    // Validate ASHA worker authentication
    const token = getAuthToken()
    const tokenCheck = checkTokenExpiry(token)
    if (!token || tokenCheck.expired) {
      isSubmittingRef.current = false
      setStatus("error")
      setErrorMessage("Authentication session expired. Please sign in again before submitting an Emergency SOS.")
      return
    }

    setStatus("submitting")
    setErrorMessage(null)

    const patientName = formatPatientName(selectedPatient.full_name || selectedPatient.name)
    const patientVillage = selectedPatient.village || null

    try {
      const payload = {
        patient_id: patientId,
        patient_name: patientName,
        village: patientVillage,
        emergency_type: "general_sos",
        emergency_notes: `Emergency SOS triggered by ASHA Worker for patient ${patientName} (${patientId})`,
        caller_role: "asha",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }

      const response = await sendEmergencySOS(payload)
      setSosResponse(response)
      setStatus("success")
    } catch (err) {
      console.error("[AshaEmergencySOSScreen] Emergency SOS submission failed:", err)
      setStatus("error")
      if (err.status === 401 || err.status === 403) {
        setErrorMessage("Authentication session expired or unauthorized. Please sign in again.")
      } else {
        setErrorMessage(err.message || "Failed to transmit emergency SOS. Please retry or dial 108 directly.")
      }
    } finally {
      isSubmittingRef.current = false
      holdStart.current = null
      activePointerId.current = null
    }
  }

  // 6. Hold Animation Loop
  const tick = useCallback(() => {
    if (!holdStart.current) return
    const elapsed = performance.now() - holdStart.current
    const pct = Math.min(100, (elapsed / HOLD_DURATION) * 100)
    setProgress(pct)

    if (pct >= 100) {
      if (rafId.current) cancelAnimationFrame(rafId.current)
      holdStart.current = null
      activePointerId.current = null
      executeEmergencySos()
      return
    }

    rafId.current = requestAnimationFrame(tick)
  }, [selectedPatient])

  // 7. Start Hold on pointer down
  const startHold = (e) => {
    // Only primary mouse click or direct touch
    if (e && e.button !== undefined && e.button !== 0) return
    if (!selectedPatient || status === "submitting" || status === "success" || isSubmittingRef.current) return

    activePointerId.current = e.pointerId
    if (e.currentTarget && typeof e.currentTarget.setPointerCapture === "function") {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
    }

    setStatus("holding")
    setProgress(0)
    holdStart.current = performance.now()
    rafId.current = requestAnimationFrame(tick)
  }

  const handlePointerUpOrCancel = (e) => {
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
    cancelHold()
  }

  const handleReset = () => {
    cancelHold()
    setStatus("idle")
    setProgress(0)
    setErrorMessage(null)
    setSosResponse(null)
    setSelectedPatient(null)
    isSubmittingRef.current = false
  }

  const handleRetry = () => {
    setStatus("idle")
    setProgress(0)
    setErrorMessage(null)
    isSubmittingRef.current = false
  }

  const remainingSeconds = Math.max(1, Math.ceil((HOLD_DURATION * (1 - progress / 100)) / 1000))

  return (
    <main className="min-h-dvh w-full bg-gradient-to-b from-red-50/60 via-slate-50 to-slate-100 text-slate-800">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        {/* Sticky Header */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-red-100 bg-white/95 px-4 py-3.5 backdrop-blur shadow-sm">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              disabled={status === "submitting"}
              aria-label={t?.common?.goBack || "Go Back"}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95 disabled:opacity-50"
            >
              <BackIcon className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-600 shadow-md shadow-red-600/30 text-white">
                <SosIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold leading-tight text-slate-800">
                  {t?.sos?.title || "Emergency SOS"}
                </h1>
                <p className="truncate text-xs text-slate-500">
                  ASHA Worker Emergency Dispatch
                </p>
              </div>
            </div>
          </div>

          <a
            href="tel:108"
            className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 shadow-sm transition hover:bg-red-100 active:scale-95"
            aria-label="Call 108 Emergency Ambulance directly"
          >
            <PhoneIcon className="h-3.5 w-3.5" />
            <span>Call 108</span>
          </a>
        </header>

        {/* Content Body */}
        <div className="flex flex-1 flex-col gap-5 px-4 py-5">
          {/* Section 1: Selected Patient Banner / Required Selection Notice */}
          {selectedPatient ? (
            <section
              aria-labelledby="selected-patient-heading"
              className="rounded-3xl border-2 border-emerald-500/80 bg-white p-4.5 shadow-md shadow-emerald-500/10 transition"
            >
              <div className="flex items-center justify-between gap-2 border-b border-emerald-100 pb-3">
                <div className="flex items-center gap-2 text-emerald-800">
                  <CheckCircleIcon className="h-5 w-5 text-emerald-600 shrink-0" />
                  <span id="selected-patient-heading" className="text-xs font-bold uppercase tracking-wider">
                    Selected Patient for Emergency SOS
                  </span>
                </div>
                {status !== "submitting" && (
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 active:scale-95"
                  >
                    Change Patient
                  </button>
                )}
              </div>

              <div className="mt-3.5 flex items-start gap-3.5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-sm font-extrabold text-emerald-800 border border-emerald-200">
                  {getInitials(selectedPatient.full_name || selectedPatient.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-bold text-slate-800">
                      {formatPatientName(selectedPatient.full_name || selectedPatient.name)}
                    </p>
                    <span className="font-mono text-xs font-semibold text-slate-500">
                      ({selectedPatient.patient_id || selectedPatient.id})
                    </span>
                  </div>

                  {/* Real demographic attributes only (no invented info) */}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    {selectedPatient.village && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                        <MapPinIcon className="h-3 w-3 text-slate-400" />
                        {selectedPatient.village}
                      </span>
                    )}
                    {selectedPatient.age && (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                        {selectedPatient.age} yrs
                      </span>
                    )}
                    {selectedPatient.gender && (
                      <span className="capitalize rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                        {selectedPatient.gender}
                      </span>
                    )}
                    {selectedPatient.blood_group && (
                      <span className="rounded-md bg-rose-50 px-2 py-0.5 font-bold text-rose-700 border border-rose-100">
                        Blood: {selectedPatient.blood_group}
                      </span>
                    )}
                    {selectedPatient.phone && (
                      <span className="font-mono rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">
                        +91 {selectedPatient.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-amber-900 shadow-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 font-bold text-sm">
                !
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                  Patient Selection Required
                </p>
                <p className="mt-0.5 text-xs text-amber-700 leading-relaxed">
                  Please select an affected patient from your assigned village registry below before initiating an Emergency SOS dispatch.
                </p>
              </div>
            </div>
          )}

          {/* Section 2: Patient Search & Selection List (Visible when not yet submitted) */}
          {status !== "success" && (
            <section className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-800">
                  Assigned Village Patients
                </h2>
                <span className="text-xs font-semibold text-slate-400">
                  {patients.length} registered
                </span>
              </div>

              {/* Search input */}
              <div className="relative">
                <SearchIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={status === "submitting" || status === "holding"}
                  placeholder={t?.patients?.searchPlaceholder || "Search by name, patient ID, phone, or village..."}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 py-2.5 pl-10 pr-4 text-xs font-medium text-slate-800 placeholder-slate-400 outline-none transition focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-100 disabled:opacity-50"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* List / Loading / Error States */}
              {loading ? (
                <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-center">
                  <SpinnerIcon className="h-8 w-8 animate-spin text-red-600" />
                  <p className="text-xs font-semibold text-slate-600">
                    Loading village patient registry…
                  </p>
                </div>
              ) : patientListError ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-center">
                  <AlertTriangleIcon className="h-7 w-7 text-rose-600" />
                  <div>
                    <p className="text-xs font-bold text-rose-900">Failed to load patients</p>
                    <p className="mt-0.5 text-xs text-rose-700">{patientListError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={loadPatients}
                    className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700 active:scale-95"
                  >
                    Retry Loading
                  </button>
                </div>
              ) : patients.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center">
                  <UserIcon className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-xs font-bold text-slate-700">No patients registered in your village</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Patients must be registered to trigger an SOS alert on their behalf.
                  </p>
                </div>
              ) : filteredPatients.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-8 text-center">
                  <p className="text-xs font-bold text-slate-700">
                    No patients match "{searchQuery}"
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="mt-2 text-xs font-semibold text-red-600 underline"
                  >
                    Clear Search
                  </button>
                </div>
              ) : (
                <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
                  {filteredPatients.map((p) => {
                    const isSelected = selectedPatient && (selectedPatient.patient_id === p.patient_id || selectedPatient.id === p.id)
                    const pName = formatPatientName(p.full_name || p.name)
                    const pId = p.patient_id || p.id
                    return (
                      <button
                        key={pId}
                        type="button"
                        onClick={() => handleSelectPatient(p)}
                        disabled={status === "submitting" || status === "holding"}
                        aria-pressed={isSelected}
                        className={`flex items-center justify-between gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99] disabled:opacity-50
                          ${
                            isSelected
                              ? "border-emerald-500 bg-emerald-50/70 shadow-sm ring-1 ring-emerald-400"
                              : "border-slate-100 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                          }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold
                              ${isSelected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
                          >
                            {getInitials(p.full_name || p.name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-xs font-bold text-slate-800">{pName}</p>
                              <span className="font-mono text-[11px] text-slate-400">({pId})</span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                              {p.village && <span>{p.village}</span>}
                              {p.age && <span>• {p.age} yrs</span>}
                              {p.blood_group && (
                                <span className="font-semibold text-rose-600">• {p.blood_group}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold transition
                              ${
                                isSelected
                                  ? "border-emerald-600 bg-emerald-600 text-white"
                                  : "border-slate-300 bg-white text-transparent"
                              }`}
                          >
                            ✓
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {/* Section 3: ASHA Emergency SOS Button & Lifecycle States */}
          {status === "success" && sosResponse ? (
            /* Successful State: Honest Confirmation Screen */
            <section className="flex flex-col items-center gap-5 rounded-3xl border border-emerald-200 bg-white p-6 sm:p-8 text-center shadow-lg shadow-emerald-900/5">
              {/* Prominent Ambulance Badge with Pulsing Ring */}
              <div className="relative flex items-center justify-center">
                <span className="absolute -inset-2.5 rounded-3xl bg-emerald-100/70 animate-pulse" />
                <span className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/30">
                  <AmbulanceIcon className="h-10 w-10 text-white" />
                </span>
              </div>

              {/* Confirmation Heading & Verified Patient Identity */}
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                  <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-600" />
                  Alert Dispatched via AyushLink Network
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
                  Emergency Alert Sent
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 max-w-md">
                  Emergency alert transmitted for{" "}
                  <strong className="text-slate-900 font-bold">
                    {formatPatientName(sosResponse.patient_name || selectedPatient?.full_name || selectedPatient?.name)}
                  </strong>{" "}
                  <span className="font-mono text-slate-500">
                    ({sosResponse.patient_id || selectedPatient?.patient_id || selectedPatient?.id})
                  </span>
                  {sosResponse.village || selectedPatient?.village ? (
                    <span> in {sosResponse.village || selectedPatient?.village}</span>
                  ) : null}
                  .
                </p>
              </div>

              {/* Status Cards: "Ambulance is coming" & "PHC has been informed" */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full max-w-lg text-left">
                {/* Ambulance Transport Card */}
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 flex flex-col justify-between gap-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                      <AmbulanceIcon className="h-5 w-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-slate-900 leading-snug">
                        Ambulance is coming
                      </h4>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                        Emergency transport requested on network.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/90 p-2.5 text-[11px] border border-emerald-100 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-500">Dispatch Status:</span>
                      <span className="font-bold text-emerald-800">
                        {sosResponse.ambulance_status && sosResponse.ambulance_status !== "NOT_REQUESTED"
                          ? sosResponse.ambulance_status
                          : "Emergency request registered"}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 leading-tight">
                      Ambulance dispatch pending coordination — dial 108 directly for live vehicle dispatch.
                    </span>
                  </div>
                </div>

                {/* PHC Notification Card */}
                <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 flex flex-col justify-between gap-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
                      <HospitalIcon className="h-5 w-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-slate-900 leading-snug">
                        PHC has been informed
                      </h4>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                        High-priority alert sent to {sosResponse.primary_phc || "Primary Health Centre"}.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/90 p-2.5 text-[11px] border border-teal-100 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-500">PHC Status:</span>
                      <span className="font-bold text-teal-800">
                        {sosResponse.phc_status === "PENDING"
                          ? "PENDING (Doctor notification queued)"
                          : sosResponse.phc_status || "DISPATCHED"}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 leading-tight">
                      Notification logged in PHC system; awaiting medical officer review.
                    </span>
                  </div>
                </div>
              </div>

              {/* Actual Backend Details Table */}
              <div className="w-full max-w-lg rounded-2xl bg-slate-50 p-4 text-left text-xs border border-slate-200/80 space-y-2">
                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="font-semibold text-slate-500">Alert ID:</span>
                  <span className="font-mono font-bold text-slate-900">{sosResponse.alert_id || "SOS-RECORDED"}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="font-semibold text-slate-500">Patient Name:</span>
                  <span className="font-bold text-slate-900">
                    {formatPatientName(sosResponse.patient_name || selectedPatient?.full_name || selectedPatient?.name)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="font-semibold text-slate-500">Patient ID:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {sosResponse.patient_id || selectedPatient?.patient_id || selectedPatient?.id}
                  </span>
                </div>
                {sosResponse.village && (
                  <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                    <span className="font-semibold text-slate-500">Village:</span>
                    <span className="text-slate-800">{sosResponse.village}</span>
                  </div>
                )}
                {sosResponse.primary_phc && (
                  <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                    <span className="font-semibold text-slate-500">Assigned PHC:</span>
                    <span className="text-slate-800">{sosResponse.primary_phc}</span>
                  </div>
                )}
                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="font-semibold text-slate-500">Backend Alert Status:</span>
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                    {sosResponse.status || "REGISTERED"}
                  </span>
                </div>
                {sosResponse.lora_status && (
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-500">LoRa Gateway ACK:</span>
                    <span className="font-mono font-semibold text-emerald-700">{sosResponse.lora_status}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons: Return to Dashboard, Call 108, Reset */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 w-full max-w-lg pt-1">
                <button
                  type="button"
                  onClick={onBack}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-xs sm:text-sm font-bold text-white shadow-md shadow-emerald-600/25 transition hover:bg-emerald-700 active:scale-95 cursor-pointer"
                >
                  <BackIcon className="h-4 w-4" />
                  Return to Dashboard
                </button>

                <a
                  href="tel:108"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-xs sm:text-sm font-bold text-red-700 transition hover:bg-red-100 active:scale-95"
                >
                  <PhoneIcon className="h-4 w-4" />
                  Call 108 Directly
                </a>

                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs sm:text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-95 cursor-pointer"
                >
                  New Emergency
                </button>
              </div>
            </section>
          ) : status === "error" ? (
            /* Failed State: Show error and allow retry */
            <section className="flex flex-col items-center gap-4 rounded-3xl border border-rose-200 bg-rose-50/60 p-6 sm:p-8 text-center shadow-sm">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                <AlertTriangleIcon className="h-8 w-8" />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Emergency Alert Failed
                </h3>
                <p className="mt-1 text-xs text-rose-700 max-w-sm">
                  {errorMessage || "Unable to submit emergency alert. Please retry or call emergency services directly."}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={handleRetry}
                  className="rounded-2xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/25 transition hover:bg-rose-700 active:scale-95"
                >
                  Retry SOS
                </button>
                <a
                  href="tel:108"
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-rose-200 bg-white px-5 py-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50 active:scale-95"
                >
                  <PhoneIcon className="h-3.5 w-3.5" /> Call 108
                </a>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </section>
          ) : (
            /* Idle, Holding, or Submitting State */
            <section className="flex flex-col items-center gap-4 rounded-3xl border border-red-200 bg-white p-7 text-center shadow-sm">
              <div className="flex flex-col items-center gap-1">
                <h3 className="text-sm font-bold uppercase tracking-wide text-red-700">
                  {selectedPatient ? "5-Second Emergency Hold" : "Emergency SOS Trigger"}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm">
                  {status === "submitting"
                    ? "Submitting emergency request to AyushLink network…"
                    : status === "holding"
                    ? `Hold continuously for 5 seconds to confirm (${remainingSeconds}s remaining)`
                    : selectedPatient
                    ? `Press and hold the button for 5 seconds for ${formatPatientName(selectedPatient.full_name || selectedPatient.name)}.`
                    : "Select a patient from the list above before emergency SOS can be triggered."}
                </p>
              </div>

              {/* The 5-Second Hold Button */}
              <div className="relative flex flex-col items-center">
                <button
                  type="button"
                  disabled={!selectedPatient || status === "submitting"}
                  onPointerDown={startHold}
                  onPointerUp={handlePointerUpOrCancel}
                  onPointerLeave={handlePointerUpOrCancel}
                  onPointerCancel={handlePointerUpOrCancel}
                  onContextMenu={(e) => e.preventDefault()}
                  aria-label={
                    !selectedPatient
                      ? "SOS Disabled: Select patient first"
                      : status === "submitting"
                      ? "Submitting Emergency SOS"
                      : status === "holding"
                      ? `Holding: ${remainingSeconds} seconds remaining`
                      : "Press and hold for 5 seconds to trigger Emergency SOS"
                  }
                  className={`relative flex h-48 w-48 flex-col items-center justify-center rounded-full text-white shadow-xl transition select-none touch-none
                    ${
                      !selectedPatient
                        ? "bg-slate-300 shadow-none cursor-not-allowed opacity-60"
                        : status === "submitting"
                        ? "bg-red-700 shadow-md cursor-wait opacity-80"
                        : status === "holding"
                        ? "bg-red-700 shadow-2xl scale-105 ring-4 ring-red-300 cursor-pointer"
                        : "bg-red-600 shadow-red-600/35 hover:bg-red-700 active:scale-95 cursor-pointer ring-4 ring-red-100"
                    }`}
                >
                  {/* Radial progress ring SVG */}
                  {selectedPatient && (
                    <svg className="absolute inset-0 h-full w-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="6" />
                      <circle
                        cx="50"
                        cy="50"
                        r="44"
                        fill="none"
                        stroke="white"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 44}
                        strokeDashoffset={2 * Math.PI * 44 * (1 - progress / 100)}
                        style={{ transition: status === "holding" ? "none" : "stroke-dashoffset 0.15s ease-out" }}
                      />
                    </svg>
                  )}

                  <span className="flex flex-col items-center gap-1 pointer-events-none z-10 px-3 text-center">
                    {status === "submitting" ? (
                      <SpinnerIcon className="h-10 w-10 animate-spin text-white" />
                    ) : (
                      <SosIcon className="h-10 w-10 text-white" />
                    )}
                    <span className="mt-1 text-sm font-black uppercase tracking-wider">
                      {status === "submitting"
                        ? "SENDING SOS..."
                        : status === "holding"
                        ? `${remainingSeconds}s`
                        : selectedPatient
                        ? "HOLD 5 SECONDS"
                        : "SOS DISABLED"}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide opacity-90">
                      {status === "submitting"
                        ? "DISPATCHING"
                        : status === "holding"
                        ? "KEEP HOLDING..."
                        : selectedPatient
                        ? "PRESS & HOLD"
                        : "SELECT PATIENT"}
                    </span>
                  </span>
                </button>

                {/* Linear progress bar during holding */}
                {status === "holding" && (
                  <div className="w-48 bg-red-100 rounded-full h-2 mt-4 overflow-hidden shadow-inner">
                    <div
                      className="bg-red-600 h-2 rounded-full transition-all duration-75"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>

              <p className="text-[11px] text-slate-400 max-w-xs">
                {status === "holding"
                  ? "Release before 5 seconds to cancel without sending any request."
                  : selectedPatient
                  ? "Continuous 5-second hold required to prevent accidental triggers."
                  : "Select an affected patient from the list above to enable the emergency trigger."}
              </p>
            </section>
          )}

          {/* Direct Emergency Telephone Helpline */}
          <section className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <AmbulanceIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-bold text-slate-800">Direct Emergency Helpline</p>
                <p className="text-[11px] text-slate-500">Government 108 Emergency Ambulance Service</p>
              </div>
            </div>
            <a
              href="tel:108"
              className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 active:scale-95"
            >
              Call 108
            </a>
          </section>
        </div>
      </div>
    </main>
  )
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

function SosIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
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

function UserIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function CheckCircleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function AlertTriangleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function SpinnerIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

function AmbulanceIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 17V8a1 1 0 0 1 1-1h9l4 4h3a1 1 0 0 1 1 1v5" />
      <path d="M3 17h1m16 0h1" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
      <path d="M9 8v6M6 11h6" />
    </svg>
  )
}

function HospitalIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 21V7l8-4 8 4v14" />
      <path d="M9 21v-4h6v4" />
      <path d="M12 8v4M10 10h4" />
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
