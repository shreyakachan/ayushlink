import { useRef, useState } from "react"
import { ashaT } from "../lib/ashaI18n.js"
import { registerPatient } from "../lib/api.js"

/**
 * AyushLink — Register Patient
 * React + JavaScript + Tailwind CSS
 * Responsive patient registration form with large touch-friendly inputs.
 * Blue & White healthcare theme. Mobile-first (full-screen), desktop (centered card).
 */

const GENDERS = ["Female", "Male", "Other"]
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"]
const PREGNANCY = ["Not applicable", "Not pregnant", "Pregnant", "Unsure"]

const EMPTY_FORM = {
  name: "",
  age: "",
  gender: "",
  village: "",
  phone: "",
  symptoms: "",
  bloodGroup: "",
  temperature: "",
  bloodPressure: "",
  oxygen: "",
  pregnancy: "",
}

/**
 * Maps a patient profile decoded from an ABHA Health Card QR (see
 * src/lib/parseAbhaQr.js) onto this form's field names. Only fields the
 * ABHA card actually provides are overwritten — everything else the
 * clinician still fills in by hand.
 */
function mergeInitialData(base, data) {
  if (!data) return base
  const village = [data.address, data.district, data.state].filter(Boolean).join(", ")
  const gender = GENDERS.includes(data.gender) ? data.gender : data.gender ? "Other" : ""
  return {
    ...base,
    name: data.name || base.name,
    age: data.age != null ? String(data.age) : base.age,
    gender: gender || base.gender,
    village: village || base.village,
    phone: data.mobile || base.phone,
  }
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
function CameraIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  )
}
function SaveIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  )
}
function SyncIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 2v6h-6M3 22v-6h6" />
      <path d="M21 8a9 9 0 0 0-15-3L3 8M3 16a9 9 0 0 0 15 3l3-3" />
    </svg>
  )
}
function ClearIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
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
function QrIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v.01M17 20v.01M20 20v.01" />
    </svg>
  )
}

/* ---------- Reusable field wrapper ---------- */
function Field({ label, htmlFor, required, children, hint, full }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-blue-600">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-800 " +
  "placeholder:text-slate-400 shadow-sm outline-none transition " +
  "focus:border-blue-500 focus:ring-4 focus:ring-blue-100"

export default function RegisterPatient({ lang = "en", onBack, onSave, onSyncLater, initialData }) {
  const [form, setForm] = useState(() => mergeInitialData(EMPTY_FORM, initialData))
  const [photo, setPhoto] = useState(initialData?.photo || null)
  const [savedNote, setSavedNote] = useState("")
  const fileRef = useRef(null)
  const t = ashaT(lang)

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handlePhoto = (e) => {
    const file = e.target.files?.[0]
    if (file) setPhoto(URL.createObjectURL(file))
  }

  const flash = (msg) => {
    setSavedNote(msg)
    window.clearTimeout(flash._t)
    flash._t = window.setTimeout(() => setSavedNote(""), 2600)
  }

  const handleSaveOffline = async (e) => {
    e.preventDefault()
    try {
      await registerPatient({
        full_name: form.name,
        phone: form.phone,
        age: form.age,
        gender: form.gender,
        village: form.village,
        abha_id: form.abhaNumber,
        blood_group: form.bloodGroup,
        allergies: form.allergies ? form.allergies.split(",").map((s) => s.trim()).filter(Boolean) : [],
        chronic_conditions: form.chronicConditions ? form.chronicConditions.split(",").map((s) => s.trim()).filter(Boolean) : [],
      })
      flash(t.register.savedOfflineToast)
    } catch {
      flash(t.register.savedOfflineToast)
    }
    onSave?.({ ...form, photo })
  }

  const handleSyncLater = () => {
    flash(t.register.queuedSyncToast)
    onSyncLater?.({ ...form, photo })
  }

  const handleClear = () => {
    setForm(EMPTY_FORM)
    setPhoto(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  return (
    <main className="min-h-dvh w-full bg-gradient-to-b from-blue-50 via-white to-sky-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-blue-100 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => onBack?.()}
            aria-label={t.common.goBack}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-blue-50 active:scale-95"
          >
            <BackIcon className="h-6 w-6" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-slate-800">{t.register.title}</h1>
            <p className="truncate text-xs text-slate-500">{t.register.subtitle}</p>
          </div>
        </header>

        <form onSubmit={handleSaveOffline} className="flex-1 px-4 py-5 sm:px-6">
          {initialData && (initialData.abhaNumber || initialData.name) && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                <QrIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-indigo-800">{t.register.prefilledAbha}</p>
                <p className="mt-0.5 text-indigo-600">
                  {t.register.prefilledReview}
                  {initialData.abhaNumber && (
                    <>
                      {" "}
                      {t.register.abhaNo} <span className="font-mono">{initialData.abhaNumber}</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Patient photo */}
          <div className="mb-6 flex flex-col items-center">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-blue-300 bg-white shadow-sm transition hover:border-blue-500"
              aria-label={t.register.addPhoto}
            >
              {photo ? (
                <img src={photo || "/placeholder.svg"} alt="Patient" className="h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-1 text-blue-500">
                  <CameraIcon className="h-8 w-8" />
                  <span className="text-xs font-medium">{t.register.addPhoto}</span>
                </span>
              )}
              <span className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-md">
                <CameraIcon className="h-4 w-4" />
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="sr-only" />
            <p className="mt-2 text-sm font-medium text-slate-500">{t.register.patientPhoto}</p>
          </div>

          {/* Section: Basic details */}
          <section className="mb-5 rounded-3xl border border-slate-100 bg-white/80 p-4 shadow-sm sm:p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-blue-600">{t.register.basicDetails}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t.register.name} htmlFor="name" required full>
                <input id="name" type="text" value={form.name} onChange={update("name")} placeholder={t.register.namePlaceholder} className={inputClass} required />
              </Field>

              <Field label={t.register.age} htmlFor="age" required>
                <input id="age" type="number" min="0" max="130" inputMode="numeric" value={form.age} onChange={update("age")} placeholder={t.register.agePlaceholder} className={inputClass} />
              </Field>

              <Field label={t.register.gender} htmlFor="gender" required>
                <select id="gender" value={form.gender} onChange={update("gender")} className={inputClass}>
                  <option value="" disabled>{t.register.select}</option>
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>{t.register.genders[g] || g}</option>
                  ))}
                </select>
              </Field>

              <Field label={t.register.village} htmlFor="village">
                <input id="village" type="text" value={form.village} onChange={update("village")} placeholder={t.register.villagePlaceholder} className={inputClass} />
              </Field>

              <Field label={t.register.phone} htmlFor="phone">
                <input id="phone" type="tel" inputMode="tel" value={form.phone} onChange={update("phone")} placeholder={t.register.phonePlaceholder} className={inputClass} />
              </Field>
            </div>
          </section>

          {/* Section: Vitals */}
          <section className="mb-5 rounded-3xl border border-slate-100 bg-white/80 p-4 shadow-sm sm:p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-blue-600">{t.register.vitalsSection}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t.register.bloodGroup} htmlFor="bloodGroup">
                <select id="bloodGroup" value={form.bloodGroup} onChange={update("bloodGroup")} className={inputClass}>
                  <option value="" disabled>{t.register.select}</option>
                  {BLOOD_GROUPS.map((b) => (
                    <option key={b} value={b}>{t.register.bloodGroups[b] || b}</option>
                  ))}
                </select>
              </Field>

              <Field label={t.register.temperature} htmlFor="temperature" hint={t.register.tempHint}>
                <input id="temperature" type="number" step="0.1" inputMode="decimal" value={form.temperature} onChange={update("temperature")} placeholder={t.register.tempPlaceholder} className={inputClass} />
              </Field>

              <Field label={t.register.bloodPressure} htmlFor="bloodPressure" hint={t.register.bpHint}>
                <input id="bloodPressure" type="text" inputMode="numeric" value={form.bloodPressure} onChange={update("bloodPressure")} placeholder={t.register.bpPlaceholder} className={inputClass} />
              </Field>

              <Field label={t.register.oxygen} htmlFor="oxygen" hint={t.register.oxygenHint}>
                <input id="oxygen" type="number" min="0" max="100" inputMode="numeric" value={form.oxygen} onChange={update("oxygen")} placeholder={t.register.oxygenPlaceholder} className={inputClass} />
              </Field>

              <Field label={t.register.pregnancyStatus} htmlFor="pregnancy" full>
                <select id="pregnancy" value={form.pregnancy} onChange={update("pregnancy")} className={inputClass}>
                  <option value="" disabled>{t.register.select}</option>
                  {PREGNANCY.map((p) => (
                    <option key={p} value={p}>{t.register.pregnancyOptions[p] || p}</option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          {/* Section: Symptoms */}
          <section className="mb-5 rounded-3xl border border-slate-100 bg-white/80 p-4 shadow-sm sm:p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-blue-600">{t.register.symptomsSection}</h2>
            <Field label={t.register.symptomsLabel} htmlFor="symptoms">
              <textarea
                id="symptoms"
                rows={4}
                value={form.symptoms}
                onChange={update("symptoms")}
                placeholder={t.register.symptomsPlaceholder}
                className={inputClass + " resize-y"}
              />
            </Field>
          </section>

          {/* Save confirmation toast */}
          {savedNote && (
            <div
              role="status"
              className="mb-4 flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700"
            >
              <CheckIcon className="h-5 w-5 shrink-0" />
              <span>{savedNote}</span>
            </div>
          )}

          {/* Actions */}
          <div className="sticky bottom-0 -mx-4 mt-2 border-t border-blue-100 bg-white/90 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 active:scale-[0.98]"
              >
                <SaveIcon className="h-5 w-5" />
                {t.register.saveOffline}
              </button>
              <button
                type="button"
                onClick={handleSyncLater}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-base font-semibold text-blue-700 transition hover:bg-blue-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 active:scale-[0.98]"
              >
                <SyncIcon className="h-5 w-5" />
                {t.register.syncLater}
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-base font-semibold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 active:scale-[0.98] sm:flex-none"
              >
                <ClearIcon className="h-5 w-5" />
                {t.register.clearForm}
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  )
}
