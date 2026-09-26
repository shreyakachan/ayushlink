import { useState, useEffect } from "react"
import {
  getPatientMedicalRecord,
  getPatientConsultations,
  getPatientPrescriptions,
  submitDoctorConsultation,
  getAuthUser,
} from "../lib/api.js"

function formatDate(iso) {
  if (!iso) return "Today"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function formatTime(iso) {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatPatientName(name) {
  if (!name || typeof name !== "string") return "Patient"
  return name
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ")
}

const COMMON_DIAGNOSES = [
  "Acute Gastritis",
  "Viral Fever",
  "Upper Respiratory Infection",
  "Acute Gastroenteritis",
  "Hypertension Follow-up",
  "ANC Follow-up (2nd Trimester)",
  "Allergic Rhinitis / Cough",
  "Tension Headache",
  "General Weakness & Fatigue",
]

const QUICK_MEDICINES = [
  {
    name: "Pantoprazole 40mg",
    dosage: "1 tablet",
    frequency: "Once daily before breakfast",
    duration: "5 days",
    instructions: "Take 30 mins before breakfast on empty stomach with water",
  },
  {
    name: "Paracetamol 650mg",
    dosage: "1 tablet",
    frequency: "Thrice daily after food",
    duration: "3 days",
    instructions: "Take with warm water after meals; SOS if fever > 100°F",
  },
  {
    name: "ORS Oral Rehydration Salts",
    dosage: "1 sachet in 1L water",
    frequency: "Sip throughout day",
    duration: "3 days",
    instructions: "Dissolve 1 sachet in 1 liter clean drinking water, consume within 24h",
  },
  {
    name: "Ayush 64 Tablet (500mg)",
    dosage: "2 tablets",
    frequency: "Twice daily after food",
    duration: "7 days",
    instructions: "Take with lukewarm water after food",
  },
  {
    name: "Cetirizine 10mg",
    dosage: "1 tablet",
    frequency: "Once daily at night",
    duration: "5 days",
    instructions: "Take at bedtime; may cause mild drowsiness",
  },
  {
    name: "Amoxicillin 500mg",
    dosage: "1 capsule",
    frequency: "Twice daily after food",
    duration: "5 days",
    instructions: "Complete the full 5-day course without skipping",
  },
]

export default function DoctorConsultationScreen({
  patient,
  onBack,
  onConsultationComplete,
}) {
  const doctor = getAuthUser()
  const patientId = patient?.id || patient?.patient_id || "P-4559"
  const rawPatientName = patient?.name || patient?.full_name || "Patient"
  const patientName = formatPatientName(rawPatientName)

  const [patientRecord, setPatientRecord] = useState(null)
  const [consultationsHistory, setConsultationsHistory] = useState([])
  const [patientPrescriptions, setPatientPrescriptions] = useState([])
  const [viewingPrescription, setViewingPrescription] = useState(null)
  const [loading, setLoading] = useState(true)

  // Form state
  const [diagnosis, setDiagnosis] = useState("")
  const [notes, setNotes] = useState("")
  const [advice, setAdvice] = useState("")
  const [medicines, setMedicines] = useState([
    {
      name: "",
      dosage: "1 tablet",
      frequency: "Twice daily after food",
      duration: "3 days",
      instructions: "Take with warm water after meals",
    },
  ])

  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)
  const [validationError, setValidationError] = useState(null)

  // Live Consultation Timestamp
  const [consultationTime] = useState(() => new Date().toISOString())

  // Load real patient record & history from MongoDB on mount (ZERO automatic consultation creation)
  useEffect(() => {
    let isMounted = true
    async function loadData() {
      try {
        setLoading(true)
        const [recordRes, historyRes, rxRes] = await Promise.allSettled([
          getPatientMedicalRecord(patientId),
          getPatientConsultations(patientId),
          getPatientPrescriptions(patientId),
        ])

        if (!isMounted) return

        if (recordRes.status === "fulfilled" && recordRes.value) {
          setPatientRecord(recordRes.value)
        }
        if (historyRes.status === "fulfilled" && Array.isArray(historyRes.value)) {
          setConsultationsHistory(historyRes.value)
        }
        if (rxRes.status === "fulfilled" && Array.isArray(rxRes.value)) {
          setPatientPrescriptions(rxRes.value)
        }
      } catch (err) {
        console.error("Error loading consultation data:", err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    loadData()
    return () => {
      isMounted = false
    }
  }, [patientId])

  // Medicine management
  const handleAddMedicine = () => {
    setMedicines((prev) => [
      ...prev,
      {
        name: "",
        dosage: "1 tablet",
        frequency: "Twice daily after food",
        duration: "3 days",
        instructions: "",
      },
    ])
  }

  const handleQuickAddMedicine = (quickMed) => {
    setMedicines((prev) => {
      // If the only row is empty, replace it
      if (prev.length === 1 && !prev[0].name.trim()) {
        return [{ ...quickMed }]
      }
      return [...prev, { ...quickMed }]
    })
  }

  const handleUpdateMedicine = (index, field, value) => {
    setMedicines((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    )
  }

  const handleRemoveMedicine = (index) => {
    setMedicines((prev) => {
      const updated = prev.filter((_, i) => i !== index)
      return updated.length > 0
        ? updated
        : [
            {
              name: "",
              dosage: "1 tablet",
              frequency: "Twice daily after food",
              duration: "3 days",
              instructions: "",
            },
          ]
    })
  }

  // Handle consultation submit
  const handleSubmitConsultation = async (e) => {
    if (e) e.preventDefault()
    setValidationError(null)
    setErrorMessage(null)

    if (!diagnosis.trim() && !notes.trim()) {
      setValidationError("Please enter a Diagnosis or Doctor's Clinical Notes.")
      return
    }

    // Filter out completely blank medicines
    const validMedicines = medicines
      .filter((m) => m.name && m.name.trim())
      .map((m) => ({
        name: m.name.trim(),
        dosage: m.dosage ? m.dosage.trim() : "1 tablet",
        frequency: m.frequency ? m.frequency.trim() : "Twice daily",
        duration: m.duration ? m.duration.trim() : "3 days",
        instructions: m.instructions ? m.instructions.trim() : null,
      }))

    const payload = {
      patient_id: patientId,
      date_time: consultationTime,
      diagnosis: diagnosis.trim() || "Consultation Completed",
      notes: notes.trim() || "Routine clinical consultation conducted.",
      advice: advice.trim(),
      medicines: validMedicines,
      status: "completed",
    }

    try {
      setSaving(true)
      const res = await submitDoctorConsultation(payload)
      setSaveSuccess(res)

      // Update local history
      setConsultationsHistory((prev) => [res, ...prev])

      if (onConsultationComplete) {
        onConsultationComplete(res)
      }
    } catch (err) {
      console.error("Error saving consultation:", err)
      setErrorMessage(err.message || "Failed to save consultation. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  // Active symptoms from record or patient prop
  const recentSymptoms =
    patientRecord?.recent_symptoms || patient?.symptoms || patient?.recent_symptoms || []
  const latestSymptom = recentSymptoms[0]

  return (
    <div className="min-h-dvh w-full bg-slate-50 text-slate-800">
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col">
        {/* Sticky Header */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-5 py-3.5 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to patients"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 active:scale-95"
            >
              <BackIcon className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                  <StethoscopeIcon className="h-3.5 w-3.5" />
                </span>
                <h1 className="text-lg font-bold tracking-tight text-slate-800">
                  Clinical Consultation
                </h1>
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                  Active Session
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Doctor: {doctor?.full_name || doctor?.name || "Doctor"} • {formatDate(consultationTime)} {formatTime(consultationTime)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="hidden sm:inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmitConsultation}
              disabled={saving || !!saveSuccess}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 active:scale-95 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <SpinnerIcon className="h-4 w-4 animate-spin" />
                  <span>Saving to MongoDB…</span>
                </>
              ) : saveSuccess ? (
                <>
                  <CheckIcon className="h-4 w-4" />
                  <span>Consultation Saved!</span>
                </>
              ) : (
                <>
                  <SaveIcon className="h-4 w-4" />
                  <span>Save Consultation</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col gap-6 p-4 lg:p-8">
          {/* Patient Overview Banner */}
          <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white shadow-md shadow-blue-500/20">
                  {patientName
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-xl font-bold text-slate-800">{patientName}</h2>
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">
                      {patientId}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                      {patient?.gender || patientRecord?.gender || "Female"}, {patient?.age || patientRecord?.age || 20} yrs
                    </span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <MapPinIcon className="h-3.5 w-3.5 text-slate-400" />
                      {patient?.village || patientRecord?.village || "Chandapur"}
                    </span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1">
                      <PhoneIcon className="h-3.5 w-3.5 text-slate-400" />
                      +91 {patient?.phone || patientRecord?.phone || "9324998108"}
                    </span>
                    <span>•</span>
                    <span>
                      Blood: <strong className="text-slate-700">{patientRecord?.blood_group || patient?.bloodGroup || "—"}</strong>
                    </span>
                  </p>
                </div>
              </div>

              {/* Patient Badges */}
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-2.5 text-xs">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Allergies</p>
                  <p className="font-semibold text-slate-700">
                    {patientRecord?.allergies?.length ? patientRecord.allergies.join(", ") : "None reported"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-2.5 text-xs">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Chronic Conditions</p>
                  <p className="font-semibold text-slate-700">
                    {patientRecord?.chronic_conditions?.length ? patientRecord.chronic_conditions.join(", ") : "None"}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Feedback Banners */}
          {validationError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700 flex items-center gap-2">
              <AlertCircleIcon className="h-5 w-5 shrink-0 text-red-500" />
              <span>{validationError}</span>
            </div>
          )}

          {errorMessage && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700 flex items-center gap-2">
              <AlertCircleIcon className="h-5 w-5 shrink-0 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50/90 p-5 text-emerald-900 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                  <CheckIcon className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-emerald-900">
                    Consultation #{saveSuccess.consultation_id} Recorded Successfully!
                  </h3>
                  <p className="text-xs text-emerald-700">
                    Diagnosis: <strong>{saveSuccess.diagnosis}</strong> • Prescribed: {saveSuccess.medicines?.length || 0} medicine(s)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onBack}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-800 transition active:scale-95 self-start sm:self-center"
              >
                Back to Patients Queue →
              </button>
            </div>
          )}

          {/* Two-Column Clinical Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Column: Live Symptoms & Patient History (4 cols) */}
            <div className="flex flex-col gap-6 lg:col-span-4">
              {/* Latest Submitted Symptoms Card */}
              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                      <PulseIcon className="h-4 w-4" />
                    </span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Latest Symptoms
                    </h3>
                  </div>
                  {latestSymptom && (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide
                        ${
                          latestSymptom.severity === "severe"
                            ? "bg-red-100 text-red-700"
                            : latestSymptom.severity === "moderate"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                    >
                      {latestSymptom.severity || "moderate"}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-3">
                  {latestSymptom ? (
                    <div>
                      {/* Symptom Tags */}
                      <div className="flex flex-wrap gap-1.5">
                        {latestSymptom.symptoms?.map((s, idx) => (
                          <span
                            key={idx}
                            className="rounded-xl bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 border border-rose-100"
                          >
                            {s}
                          </span>
                        ))}
                      </div>

                      {/* Description */}
                      {latestSymptom.description && (
                        <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs text-slate-700 leading-relaxed border border-slate-100">
                          <p className="font-semibold text-slate-500 text-[10px] uppercase mb-0.5">Complaint Details</p>
                          <p>{latestSymptom.description}</p>
                        </div>
                      )}

                      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                        <span>Submitted: {formatDate(latestSymptom.recorded_at)}</span>
                        <span>Duration: {latestSymptom.duration || "2-3 days"}</span>
                      </div>
                    </div>
                  ) : patient?.reason || patient?.condition ? (
                    <div className="rounded-2xl bg-blue-50/60 p-3 text-xs font-medium text-slate-800">
                      {patient.reason || patient.condition}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 py-4 text-center">
                      No symptoms recorded.
                    </p>
                  )}
                </div>
              </div>

              {/* Consultation History Timeline */}
              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <ClockIcon className="h-4 w-4" />
                    </span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Consultation History
                    </h3>
                  </div>
                  <span className="text-xs font-bold text-slate-400">
                    {consultationsHistory.length}
                  </span>
                </div>

                <div className="mt-4 flex flex-col gap-3 max-h-[380px] overflow-y-auto pr-1">
                  {loading ? (
                    <p className="text-xs text-slate-400 py-4 text-center">Loading past consultations…</p>
                  ) : consultationsHistory.length > 0 || patientPrescriptions.length > 0 ? (
                    <>
                      {consultationsHistory.map((cons) => {
                        const matchingRx = patientPrescriptions.find(
                          (rx) => rx.consultation_id === cons.consultation_id || rx.id === cons.consultation_id
                        )
                        const hasMedicines = (cons.medicines && cons.medicines.length > 0) || (matchingRx && matchingRx.medicines && matchingRx.medicines.length > 0)

                        return (
                          <div
                            key={cons.consultation_id || cons.id}
                            className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5 text-xs transition hover:border-blue-200"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono font-bold text-blue-700 text-[11px]">
                                {cons.consultation_id}
                              </span>
                              <span
                                className={`rounded-md px-2 py-0.5 text-[9px] font-bold uppercase ${
                                  cons.status === "completed"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {cons.status}
                              </span>
                            </div>

                            {cons.diagnosis && (
                              <p className="mt-1 font-bold text-slate-800">
                                {cons.diagnosis}
                              </p>
                            )}

                            {cons.notes && (
                              <p className="mt-1 text-slate-600 line-clamp-2 leading-relaxed">
                                {cons.notes}
                              </p>
                            )}

                            {cons.medicines?.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {cons.medicines.map((m, i) => (
                                  <span
                                    key={i}
                                    className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 border border-slate-200"
                                  >
                                    💊 {m.name}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* View Prescription Action */}
                            {hasMedicines && (
                              <button
                                type="button"
                                onClick={() => {
                                  setViewingPrescription({
                                    prescription_id: matchingRx?.prescription_id || (cons.consultation_id ? `RX-${cons.consultation_id.replace('CONS-', '')}` : "RX-4454"),
                                    consultation_id: cons.consultation_id,
                                    doctor_name: cons.doctor_name || matchingRx?.doctor_name || doctor?.full_name || doctor?.name || "Doctor",
                                    diagnosis: cons.diagnosis || matchingRx?.diagnosis,
                                    notes: cons.notes,
                                    advice: cons.advice || matchingRx?.advice || matchingRx?.instructions || cons.notes || "",
                                    medicines: cons.medicines?.length ? cons.medicines : matchingRx?.medicines || [],
                                    date: cons.date_time || matchingRx?.date,
                                    status: cons.status,
                                  })
                                }}
                                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 border border-indigo-200/80 transition active:scale-95 shadow-sm"
                              >
                                <RxIcon className="h-3.5 w-3.5" />
                                <span>View Prescription</span>
                              </button>
                            )}

                            <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between">
                              <span>{cons.doctor_name || "Doctor"}</span>
                              <span>{formatDate(cons.date_time)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </>
                  ) : (
                    <div className="py-6 text-center text-xs text-slate-400">
                      <span className="flex h-9 w-9 mx-auto items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-2">
                        <RxIcon className="h-4.5 w-4.5" />
                      </span>
                      <p className="font-bold text-slate-600">No prescriptions issued yet</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">Prescriptions are generated when you complete and submit a consultation for this patient.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Doctor Consultation Input Section (8 cols) */}
            <div className="flex flex-col gap-6 lg:col-span-8">
              {/* Clinical Assessment Card */}
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <FileTextIcon className="h-4 w-4" />
                    </span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Diagnosis & Clinical Assessment
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400">Step 1 of 3</span>
                </div>

                {/* Diagnosis Input */}
                <div>
                  <label htmlFor="diagnosis-input" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Primary Diagnosis <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="diagnosis-input"
                    type="text"
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    placeholder="e.g. Acute Gastritis, Viral Fever with Dehydration, ANC Follow-up"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
                  />

                  {/* Quick Diagnosis Chips */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-400 mr-1">Quick:</span>
                    {COMMON_DIAGNOSES.map((diag) => (
                      <button
                        key={diag}
                        type="button"
                        onClick={() => setDiagnosis(diag)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                          diagnosis === diag
                            ? "bg-blue-600 text-white shadow-sm"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {diag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Doctor's Notes */}
                <div className="mt-5">
                  <label htmlFor="notes-input" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Doctor&apos;s Notes & Examination Findings
                  </label>
                  <textarea
                    id="notes-input"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Physical examination notes, vitals review, patient's reported history, differential diagnosis..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
                  />
                </div>
              </div>

              {/* Digital Prescription & Medicines Builder */}
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                      <RxIcon className="h-4 w-4" />
                    </span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Prescription & Medicines
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddMedicine}
                    className="flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition"
                  >
                    <span>+ Add Medicine</span>
                  </button>
                </div>

                {/* Quick Add Common Drugs */}
                <div className="mb-4 rounded-2xl bg-blue-50/60 p-3.5 border border-blue-100">
                  <p className="text-[11px] font-bold uppercase text-blue-800 mb-2">
                    ⚡ Quick Add Essential / AYUSH Formulations
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_MEDICINES.map((qm) => (
                      <button
                        key={qm.name}
                        type="button"
                        onClick={() => handleQuickAddMedicine(qm)}
                        className="rounded-xl border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-900 shadow-sm hover:bg-blue-600 hover:text-white transition active:scale-95"
                      >
                        + {qm.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Medicine Items List */}
                <div className="flex flex-col gap-3">
                  {medicines.map((med, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition focus-within:border-blue-300 focus-within:bg-white"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <span className="text-xs font-bold text-slate-500">
                          Medicine #{idx + 1}
                        </span>
                        {medicines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMedicine(idx)}
                            className="text-xs font-semibold text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                        {/* Name */}
                        <div className="sm:col-span-5">
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Medicine Name & Strength
                          </label>
                          <input
                            type="text"
                            value={med.name}
                            onChange={(e) => handleUpdateMedicine(idx, "name", e.target.value)}
                            placeholder="e.g. Paracetamol 650mg"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                          />
                        </div>

                        {/* Dosage */}
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Dosage
                          </label>
                          <input
                            type="text"
                            value={med.dosage}
                            onChange={(e) => handleUpdateMedicine(idx, "dosage", e.target.value)}
                            placeholder="1 tab / 5ml"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                          />
                        </div>

                        {/* Frequency */}
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Frequency
                          </label>
                          <select
                            value={med.frequency}
                            onChange={(e) => handleUpdateMedicine(idx, "frequency", e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                          >
                            <option value="Once daily in morning">Once daily (Morning)</option>
                            <option value="Once daily at night">Once daily (Night)</option>
                            <option value="Twice daily after food">Twice daily (After food)</option>
                            <option value="Thrice daily after food">Thrice daily (After food)</option>
                            <option value="Every 6 hours">Every 6 hours</option>
                            <option value="As needed / SOS">As needed / SOS</option>
                          </select>
                        </div>

                        {/* Duration */}
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Duration
                          </label>
                          <input
                            type="text"
                            value={med.duration}
                            onChange={(e) => handleUpdateMedicine(idx, "duration", e.target.value)}
                            placeholder="3 days / 5 days"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                          />
                        </div>

                        {/* Instructions */}
                        <div className="sm:col-span-12">
                          <input
                            type="text"
                            value={med.instructions}
                            onChange={(e) => handleUpdateMedicine(idx, "instructions", e.target.value)}
                            placeholder="Instructions: Take with warm water, avoid dairy, take after meals..."
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Advice, Diet & Lifestyle */}
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                      <HeartIcon className="h-4 w-4" />
                    </span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Doctor&apos;s Advice & Follow-up Instructions
                    </h3>
                  </div>
                </div>

                <textarea
                  rows={3}
                  value={advice}
                  onChange={(e) => setAdvice(e.target.value)}
                  placeholder="Dietary instructions (e.g. avoid oily/spicy foods, drink boiled water), hydration advice, follow-up date in 3-5 days, warning signs..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
                />
              </div>

              {/* Bottom Submit Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div>
                  <p className="text-xs font-bold text-slate-800">Ready to complete consultation?</p>
                  <p className="text-[11px] text-slate-500">
                    This will save the diagnosis, notes, and digital prescription directly to MongoDB.
                  </p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={onBack}
                    className="flex-1 sm:flex-none rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-bold text-slate-600 hover:bg-slate-50 transition active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitConsultation}
                    disabled={saving || !!saveSuccess}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-xs font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition active:scale-95 disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <SpinnerIcon className="h-4 w-4 animate-spin" />
                        <span>Saving…</span>
                      </>
                    ) : saveSuccess ? (
                      <>
                        <CheckIcon className="h-4 w-4" />
                        <span>Completed</span>
                      </>
                    ) : (
                      <>
                        <SaveIcon className="h-4 w-4" />
                        <span>Submit & Complete Consultation</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Read-Only Digital Prescription Viewer Modal */}
      {viewingPrescription && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => setViewingPrescription(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white shadow-2xl border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 sm:p-8">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/30">
                    <RxIcon className="h-6 w-6" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-800">Digital Prescription</h2>
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                        Verified Record
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono">
                      {viewingPrescription.prescription_id || `RX-${viewingPrescription.consultation_id}`} • Consultation #{viewingPrescription.consultation_id || "CONS-4226"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    <PrinterIcon className="h-3.5 w-3.5" />
                    <span>Print</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewingPrescription(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Patient & Doctor Context Header */}
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-4 border border-slate-100 text-xs">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">Patient Details</p>
                  <p className="text-sm font-bold text-slate-800 mt-0.5">{patientName}</p>
                  <p className="text-slate-600 mt-0.5">
                    ID: <strong className="font-mono text-blue-700">{patientId}</strong> • {patientRecord?.gender || patient?.gender || "Female"}, {patientRecord?.age || patient?.age || 20} yrs
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    {patientRecord?.village || patient?.village || "Chandapur"} • +91 {patientRecord?.phone || patient?.phone || "9324998108"}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">Prescribing Doctor</p>
                  <p className="text-sm font-bold text-slate-800 mt-0.5">{viewingPrescription.doctor_name || doctor?.full_name || doctor?.name || "Doctor"}</p>
                  <p className="text-slate-600 mt-0.5">{doctor?.specialization || "Medical Officer"}</p>
                  <p className="text-slate-500 mt-0.5">{(doctor?.assigned_facility || doctor?.facility) ? `${doctor.assigned_facility || doctor.facility} • ` : ""}Date: {formatDate(viewingPrescription.date || viewingPrescription.date_time)}</p>
                </div>
              </div>

              {/* Clinical Diagnosis */}
              {viewingPrescription.diagnosis && (
                <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-3.5 text-xs">
                  <p className="text-[10px] font-bold uppercase text-blue-700">Clinical Diagnosis</p>
                  <p className="text-sm font-bold text-slate-800 mt-0.5">{viewingPrescription.diagnosis}</p>
                  {viewingPrescription.notes && (
                    <p className="mt-1 text-slate-600 leading-relaxed">{viewingPrescription.notes}</p>
                  )}
                </div>
              )}

              {/* Medicines List */}
              <div className="mt-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Prescribed Formulations</p>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {viewingPrescription.medicines?.length || 0} formulation(s)
                  </span>
                </div>

                {viewingPrescription.medicines?.length > 0 ? (
                  <div className="flex flex-col gap-2.5">
                    {viewingPrescription.medicines.map((med, idx) => (
                      <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-800 text-sm">
                            {idx + 1}. {med.name}
                          </span>
                          <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-100">
                            {med.dosage || "1 tablet"}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600">
                          <span>Frequency: <strong className="text-slate-700">{med.frequency || "Twice daily"}</strong></span>
                          <span>Duration: <strong className="text-slate-700">{med.duration || "3 days"}</strong></span>
                        </div>
                        {med.instructions && (
                          <p className="mt-1.5 text-[11px] text-slate-500 bg-slate-50 p-2 rounded-xl border border-slate-100">
                            💡 {med.instructions}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-3">No specific medicines attached to this record.</p>
                )}
              </div>

              {/* Advice & Instructions */}
              {(viewingPrescription.advice || viewingPrescription.instructions) && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
                  <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Doctor&apos;s Advice & Dietary Guidelines</p>
                  <p className="leading-relaxed">{viewingPrescription.advice || viewingPrescription.instructions}</p>
                </div>
              )}

              {/* Footer Sign-off */}
              <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-400">
                <span>AyushLink Verified Clinical Record</span>
                <button
                  type="button"
                  onClick={() => setViewingPrescription(null)}
                  className="rounded-xl bg-slate-800 px-4 py-2 font-bold text-white hover:bg-slate-900 transition active:scale-95"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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

function StethoscopeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.8 2.3A2 2 0 0 0 3 4v6a5 5 0 0 0 10 0V4" />
      <path d="M8 15v1a6 6 0 0 0 12 0v-3" />
      <circle cx="20" cy="10" r="2" />
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

function MapPinIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function PhoneIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function PulseIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h4l2 5 4-10 2 5h6" />
    </svg>
  )
}

function ClockIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function FileTextIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  )
}

function HeartIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  )
}

function SaveIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  )
}

function CheckIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function AlertCircleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function SpinnerIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

function PrinterIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect width="12" height="8" x="6" y="14" />
    </svg>
  )
}
