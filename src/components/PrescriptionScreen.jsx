import { useState, useEffect } from "react"
import { ashaT } from "../lib/ashaI18n.js"
import { getPatientPrescriptions, createDoctorPrescription } from "../lib/api.js"

/**
 * AyushLink — Digital Prescription
 * React + JavaScript + Tailwind CSS
 * Reuses the app's existing header / card / form / toast conventions.
 *
 * Doctor: fills diagnosis, medicines (name, dosage, duration) and notes to
 *         generate a new digital prescription for a patient.
 * Patient: can view any issued prescription, download it as a PDF (via the
 *          browser print dialog — no external dependency), and request the
 *          medicines from the pharmacy.
 */

const DOCTOR_NAME = "Dr. Anjali Rao"

const SEED_PRESCRIPTIONS = [
  {
    id: "RX-1042",
    patientName: "Sunita Devi",
    village: "Chandapur",
    date: "2026-07-10",
    doctorName: DOCTOR_NAME,
    diagnosis: "Viral fever with mild dehydration",
    medicines: [
      { id: "m1", name: "Paracetamol 650mg", dosage: "1 tablet", duration: "5 days" },
      { id: "m2", name: "ORS Sachet", dosage: "1 sachet after each loose motion", duration: "3 days" },
    ],
    notes: "Increase fluid intake. Return to the clinic if fever persists beyond 3 days.",
    status: "active",
  },
  {
    id: "RX-1039",
    patientName: "Ramesh Kumar",
    village: "Chandapur",
    date: "2026-07-08",
    doctorName: DOCTOR_NAME,
    diagnosis: "Type 2 Diabetes — follow-up",
    medicines: [
      { id: "m1", name: "Metformin 500mg", dosage: "1 tablet, twice daily after meals", duration: "30 days" },
    ],
    notes: "Monitor blood sugar weekly. Avoid sugary food and maintain a walking routine.",
    status: "requested",
  },
  {
    id: "RX-1035",
    patientName: "Kavita Patil",
    village: "Nandgaon",
    date: "2026-07-05",
    doctorName: DOCTOR_NAME,
    diagnosis: "Upper respiratory tract infection",
    medicines: [
      { id: "m1", name: "Amoxicillin 500mg", dosage: "1 capsule, thrice daily", duration: "7 days" },
      { id: "m2", name: "Cetirizine 10mg", dosage: "1 tablet at night", duration: "5 days" },
    ],
    notes: "Complete the full antibiotic course even if symptoms improve earlier.",
    status: "active",
  },
]

const EMPTY_MEDICINE = () => ({ id: `m-${Date.now()}-${Math.random().toString(16).slice(2)}`, name: "", dosage: "", duration: "" })

const EMPTY_FORM = {
  patientName: "",
  village: "",
  diagnosis: "",
  medicines: [EMPTY_MEDICINE()],
  notes: "",
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
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
function RxIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 21V4a1 1 0 0 1 1-1h6a4.5 4.5 0 0 1 0 9H6" />
      <path d="M11 12l6 9" />
      <path d="M15 17h4" />
    </svg>
  )
}
function PlusIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
function TrashIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
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
function SendIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
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
function UserIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 " +
  "placeholder:text-slate-400 shadow-sm outline-none transition " +
  "focus:border-blue-500 focus:ring-4 focus:ring-blue-100"

function Field({ label, htmlFor, required, children, full }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-blue-600">*</span>}
      </label>
      {children}
    </div>
  )
}

export default function PrescriptionScreen({ lang = "en", onBack }) {
  const [role, setRole] = useState("doctor") // "doctor" | "patient"
  const [view, setView] = useState("list") // "list" | "form" | "detail"
  const [prescriptions, setPrescriptions] = useState(SEED_PRESCRIPTIONS)
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [toast, setToast] = useState("")
  const t = ashaT(lang)

  useEffect(() => {
    async function loadPrescriptions() {
      try {
        const liveList = await getPatientPrescriptions()
        if (Array.isArray(liveList) && liveList.length > 0) {
          const formatted = liveList.map((p) => ({
            id: p.prescription_id || p.id,
            patientName: p.patient_name || "Patient",
            village: p.village || "Chandapur",
            date: p.date ? new Date(p.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
            doctorName: p.doctor_name || DOCTOR_NAME,
            diagnosis: p.diagnosis || "Medical Consultation",
            medicines: (p.medicines || []).map((m, idx) => ({
              id: `m-${idx}`,
              name: m.name || m.medicine_name,
              dosage: m.dosage || "",
              duration: m.duration || "5 days",
            })),
            notes: p.advice || p.notes || "",
            status: "active",
          }))
          const liveIds = new Set(formatted.map((p) => p.id))
          setPrescriptions([...formatted, ...SEED_PRESCRIPTIONS.filter((p) => !liveIds.has(p.id))])
        }
      } catch {}
    }
    loadPrescriptions()
  }, [])

  const selected = prescriptions.find((p) => p.id === selectedId) || null

  const flash = (msg) => {
    setToast(msg)
    window.clearTimeout(flash._t)
    flash._t = window.setTimeout(() => setToast(""), 2800)
  }

  const openDetail = (id) => {
    setSelectedId(id)
    setView("detail")
  }

  const updateMedicine = (idx, key, value) => {
    setForm((f) => {
      const medicines = [...f.medicines]
      medicines[idx] = { ...medicines[idx], [key]: value }
      return { ...f, medicines }
    })
  }

  const addMedicineRow = () => setForm((f) => ({ ...f, medicines: [...f.medicines, EMPTY_MEDICINE()] }))

  const removeMedicineRow = (idx) =>
    setForm((f) => ({ ...f, medicines: f.medicines.filter((_, i) => i !== idx) }))

  const handleGenerate = async (e) => {
    e.preventDefault()
    const cleanMedicines = form.medicines
      .map((m) => ({ ...m, name: m.name.trim(), dosage: m.dosage.trim(), duration: m.duration.trim() }))
      .filter((m) => m.name)
    if (!form.patientName.trim() || !form.diagnosis.trim() || cleanMedicines.length === 0) return

    const generatedId = `RX-${Math.floor(1000 + Math.random() * 9000)}`
    const newRx = {
      id: generatedId,
      patientName: form.patientName.trim(),
      village: form.village.trim(),
      date: new Date().toISOString().slice(0, 10),
      doctorName: DOCTOR_NAME,
      diagnosis: form.diagnosis.trim(),
      medicines: cleanMedicines,
      notes: form.notes.trim(),
      status: "active",
    }
    setPrescriptions((list) => [newRx, ...list])
    setForm(EMPTY_FORM)
    flash(`${t.prescriptions.rxGenerated} ${newRx.id} (${newRx.patientName})`)
    setView("list")

    try {
      await createDoctorPrescription({
        patient_id: form.patientName.trim(),
        diagnosis: form.diagnosis.trim(),
        medicines: cleanMedicines.map((m) => ({
          name: m.name,
          dosage: m.dosage || "1 tablet",
          frequency: "twice daily",
          duration: m.duration || "5 days",
          instructions: "after meals",
        })),
        advice: form.notes.trim() || "Follow prescribed dosage and rest well.",
      })
    } catch {}
  }

  const handleRequestMedicine = (id) => {
    setPrescriptions((list) => list.map((p) => (p.id === id ? { ...p, status: "requested" } : p)))
    flash(t.prescriptions.medicineRequestSent)
  }

  const handleDownloadPdf = () => {
    window.print()
  }

  return (
    <main className="min-h-dvh w-full bg-gradient-to-b from-blue-50 via-white to-sky-50 print:bg-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col print:hidden">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-blue-100 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => (view === "list" ? onBack?.() : setView("list"))}
            aria-label={t.common.goBack}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-blue-50 active:scale-95"
          >
            <BackIcon className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold text-slate-800">{t.prescriptions.title}</h1>
            <p className="truncate text-xs text-slate-500">
              {view === "form" ? t.prescriptions.generateNewSubtitle : view === "detail" ? selected?.id : t.prescriptions.subtitle}
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
              className="mb-4 flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700"
            >
              <CheckIcon className="h-5 w-5 shrink-0" />
              <span>{toast}</span>
            </div>
          )}

          {/* ---------------- LIST VIEW ---------------- */}
          {view === "list" && (
            <>
              {/* Role toggle */}
              <div className="mb-5 inline-flex w-full rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
                {[
                  { id: "doctor", label: t.prescriptions.doctorView, Icon: StethoscopeIcon },
                  { id: "patient", label: t.prescriptions.patientView, Icon: UserIcon },
                ].map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setRole(id)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition
                      ${role === id ? "bg-blue-600 text-white shadow-md shadow-blue-600/25" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>

              {role === "doctor" && (
                <button
                  type="button"
                  onClick={() => setView("form")}
                  className="mb-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 active:scale-[0.98]"
                >
                  <PlusIcon className="h-5 w-5" />
                  {t.prescriptions.newPrescription}
                </button>
              )}

              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {role === "doctor" ? t.prescriptions.issuedPrescriptions : t.prescriptions.yourPrescriptions}
              </h2>

              <div className="flex flex-col gap-3">
                {prescriptions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openDetail(p.id)}
                    className="group flex items-center gap-4 rounded-3xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 active:scale-[0.99]"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                      <RxIcon className="h-6 w-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-base font-semibold text-slate-800">{p.patientName}</span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            p.status === "requested" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {p.status === "requested" ? t.prescriptions.requested : t.prescriptions.active}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-slate-500">{p.diagnosis}</span>
                      <span className="mt-0.5 block text-xs text-slate-400">
                        {p.id} · {formatDate(p.date)}
                      </span>
                    </span>
                    <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-500" />
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ---------------- FORM VIEW (doctor generates a prescription) ---------------- */}
          {view === "form" && (
            <form onSubmit={handleGenerate} className="flex flex-col gap-5">
              <section className="rounded-3xl border border-slate-100 bg-white/80 p-4 shadow-sm sm:p-5">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-blue-600">{t.prescriptions.patientSection}</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t.prescriptions.patientName} htmlFor="patientName" required full>
                    <input
                      id="patientName"
                      type="text"
                      value={form.patientName}
                      onChange={(e) => setForm((f) => ({ ...f, patientName: e.target.value }))}
                      placeholder={t.prescriptions.patientNamePlaceholder}
                      className={inputClass}
                      required
                    />
                  </Field>
                  <Field label={t.prescriptions.villageArea} htmlFor="village" full>
                    <input
                      id="village"
                      type="text"
                      value={form.village}
                      onChange={(e) => setForm((f) => ({ ...f, village: e.target.value }))}
                      placeholder={t.prescriptions.villageAreaPlaceholder}
                      className={inputClass}
                    />
                  </Field>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-100 bg-white/80 p-4 shadow-sm sm:p-5">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-blue-600">{t.prescriptions.diagnosisSection}</h2>
                <Field label={t.prescriptions.diagnosisSection} htmlFor="diagnosis" required>
                  <textarea
                    id="diagnosis"
                    rows={2}
                    value={form.diagnosis}
                    onChange={(e) => setForm((f) => ({ ...f, diagnosis: e.target.value }))}
                    placeholder={t.prescriptions.diagnosisPlaceholder}
                    className={inputClass + " resize-y"}
                    required
                  />
                </Field>
              </section>

              <section className="rounded-3xl border border-slate-100 bg-white/80 p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-blue-600">{t.prescriptions.medicinesSection}</h2>
                  <button
                    type="button"
                    onClick={addMedicineRow}
                    className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    {t.prescriptions.addMedicine}
                  </button>
                </div>
                <div className="flex flex-col gap-4">
                  {form.medicines.map((m, idx) => (
                    <div key={m.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">{t.prescriptions.medicinePrefix} {idx + 1}</span>
                        {form.medicines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMedicineRow(idx)}
                            aria-label={t.prescriptions.removeMedicine}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <input
                          type="text"
                          value={m.name}
                          onChange={(e) => updateMedicine(idx, "name", e.target.value)}
                          placeholder={t.prescriptions.medicineNamePlaceholder}
                          className={inputClass + " sm:col-span-3"}
                          required={idx === 0}
                        />
                        <input
                          type="text"
                          value={m.dosage}
                          onChange={(e) => updateMedicine(idx, "dosage", e.target.value)}
                          placeholder={t.prescriptions.dosagePlaceholder}
                          className={inputClass + " sm:col-span-2"}
                        />
                        <input
                          type="text"
                          value={m.duration}
                          onChange={(e) => updateMedicine(idx, "duration", e.target.value)}
                          placeholder={t.prescriptions.durationPlaceholder}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-100 bg-white/80 p-4 shadow-sm sm:p-5">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-blue-600">{t.prescriptions.notesSection}</h2>
                <Field label={t.prescriptions.additionalNotes} htmlFor="notes">
                  <textarea
                    id="notes"
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder={t.prescriptions.notesPlaceholder}
                    className={inputClass + " resize-y"}
                  />
                </Field>
              </section>

              <div className="sticky bottom-0 -mx-4 border-t border-blue-100 bg-white/90 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="submit"
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 active:scale-[0.98]"
                  >
                    <RxIcon className="h-5 w-5" />
                    {t.prescriptions.generateBtn}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm(EMPTY_FORM)
                      setView("list")
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-base font-semibold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 active:scale-[0.98]"
                  >
                    {t.common.cancel}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ---------------- DETAIL VIEW (view / download / request) ---------------- */}
          {view === "detail" && selected && (
            <div className="flex flex-col gap-4">
              <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
                      <RxIcon className="h-6 w-6" />
                    </span>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.prescriptions.detailPrescription}</p>
                      <h2 className="text-lg font-bold text-slate-800">{selected.id}</h2>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      selected.status === "requested" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {selected.status === "requested" ? t.prescriptions.medicineRequested : t.prescriptions.active}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">{t.prescriptions.patient}</p>
                    <p className="font-semibold text-slate-800">{selected.patientName}</p>
                    {selected.village && <p className="text-xs text-slate-500">{selected.village}</p>}
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">{t.prescriptions.dateIssued}</p>
                    <p className="font-semibold text-slate-800">{formatDate(selected.date)}</p>
                    <p className="text-xs text-slate-500">{selected.doctorName}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold uppercase tracking-wide text-blue-600">{t.prescriptions.diagnosisSection}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">{selected.diagnosis}</p>
              </section>

              <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold uppercase tracking-wide text-blue-600">{t.prescriptions.medicinesSection}</h3>
                <div className="mt-3 flex flex-col gap-2">
                  {selected.medicines.map((m, i) => (
                    <div key={m.id} className="rounded-2xl bg-slate-50 p-3">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800">{m.name}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {m.dosage || t.prescriptions.asDirected}
                            {m.duration ? ` · ${m.duration}` : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {selected.notes && (
                <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-blue-600">{t.prescriptions.notesSection}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{selected.notes}</p>
                </section>
              )}

              {/* Patient actions */}
              {role === "patient" && (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-base font-semibold text-blue-700 transition hover:bg-blue-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 active:scale-[0.98]"
                  >
                    <DownloadIcon className="h-5 w-5" />
                    {t.prescriptions.downloadPdf}
                  </button>
                  <button
                    type="button"
                    disabled={selected.status === "requested"}
                    onClick={() => handleRequestMedicine(selected.id)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                  >
                    {selected.status === "requested" ? (
                      <>
                        <CheckIcon className="h-5 w-5" />
                        {t.prescriptions.medicineRequested}
                      </>
                    ) : (
                      <>
                        <SendIcon className="h-5 w-5" />
                        {t.prescriptions.requestMedicine}
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Doctor action */}
              {role === "doctor" && (
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-base font-semibold text-blue-700 transition hover:bg-blue-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 active:scale-[0.98]"
                >
                  <DownloadIcon className="h-5 w-5" />
                  {t.prescriptions.downloadPdfCopy}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---------------- PRINT-ONLY LAYOUT (used for "Download PDF") ---------------- */}
      {selected && (
        <div className="hidden print:block p-10 text-slate-900">
          <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4">
            <div>
              <p className="text-2xl font-bold">
                Ayush<span>Link</span>
              </p>
              <p className="text-sm text-slate-600">{t.prescriptions.title}</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">{selected.doctorName}</p>
              <p>{selected.id}</p>
              <p>{formatDate(selected.date)}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase text-slate-500">{t.prescriptions.patient}</p>
              <p className="font-semibold">{selected.patientName}</p>
              {selected.village && <p>{selected.village}</p>}
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">{t.prescriptions.diagnosisSection}</p>
              <p className="font-semibold">{selected.diagnosis}</p>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-xs uppercase text-slate-500">Rx — {t.prescriptions.medicinesSection}</p>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-400 text-left">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">{t.prescriptions.medicinePrefix}</th>
                  <th className="py-2 pr-2">{t.prescriptions.dosagePlaceholder.split(" ")[0]}</th>
                  <th className="py-2">{t.prescriptions.durationPlaceholder.split(" ")[0]}</th>
                </tr>
              </thead>
              <tbody>
                {selected.medicines.map((m, i) => (
                  <tr key={m.id} className="border-b border-slate-200">
                    <td className="py-2 pr-2">{i + 1}</td>
                    <td className="py-2 pr-2">{m.name}</td>
                    <td className="py-2 pr-2">{m.dosage || t.prescriptions.asDirected}</td>
                    <td className="py-2">{m.duration || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected.notes && (
            <div className="mt-6">
              <p className="text-xs uppercase text-slate-500">{t.prescriptions.notesSection}</p>
              <p className="mt-1 text-sm">{selected.notes}</p>
            </div>
          )}

          <div className="mt-16 flex justify-end">
            <div className="text-center text-sm">
              <p className="border-t border-slate-500 px-8 pt-1">{selected.doctorName}</p>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
