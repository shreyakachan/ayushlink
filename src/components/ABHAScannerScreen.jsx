import { useCallback, useRef, useState } from "react"
import jsQR from "jsqr"
import useQrScanner from "../hooks/useQrScanner.js"
import { parseAbhaQr } from "../lib/parseAbhaQr.js"
import { ashaT } from "../lib/ashaI18n.js"

/**
 * AyushLink — ABHA Health Card Scanner
 * React + JavaScript + Tailwind CSS
 *
 * Scans a patient's ABHA (Ayushman Bharat Health Account) Health Card QR
 * code using the device camera and decodes it entirely on-device with
 * jsQR — no server round-trip, no internet required. The decoded payload
 * is parsed locally into a patient profile and shown immediately.
 */

export default function ABHAScannerScreen({ lang = "en", onBack, onRegisterPatient }) {
  const [result, setResult] = useState(null) // parseAbhaQr() output, once scanned
  const [uploadError, setUploadError] = useState("")
  const fileRef = useRef(null)
  const t = ashaT(lang)

  const handleDecode = useCallback((text) => {
    setResult(parseAbhaQr(text))
  }, [])

  const { videoRef, canvasRef, state, error, start, stop } = useQrScanner({ onDecode: handleDecode })

  const reset = () => {
    setResult(null)
    setUploadError("")
    start()
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError("")
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement("canvas")
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext("2d")
      ctx.drawImage(bitmap, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const decoded = jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" })
      if (decoded?.data) {
        stop()
        setResult(parseAbhaQr(decoded.data))
      } else {
        setUploadError(t.abhaScan.uploadNoQr)
      }
    } catch {
      setUploadError(t.abhaScan.uploadUnreadable)
    } finally {
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <main className="min-h-dvh w-full bg-gradient-to-b from-blue-50 via-white to-sky-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-blue-100 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => {
              stop()
              onBack?.()
            }}
            aria-label={t.common.goBack}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-blue-50 active:scale-95"
          >
            <BackIcon className="h-6 w-6" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-slate-800">{t.abhaScan.title}</h1>
            <p className="truncate text-xs text-slate-500">{t.abhaScan.subtitle}</p>
          </div>
        </header>

        <div className="flex-1 px-4 py-5 sm:px-6">
          {!result && (
            <ScannerPane
              t={t}
              state={state}
              error={error}
              uploadError={uploadError}
              videoRef={videoRef}
              canvasRef={canvasRef}
              fileRef={fileRef}
              onStart={start}
              onUpload={handleUpload}
            />
          )}

          {result && (
            <ResultPane
              t={t}
              result={result}
              onScanAgain={reset}
              onRegisterPatient={onRegisterPatient}
              onDone={onBack}
            />
          )}
        </div>
      </div>
    </main>
  )
}

/* ---------------------------------------------------------------------- */
/* Scanner pane: live camera view + upload fallback                        */
/* ---------------------------------------------------------------------- */

function ScannerPane({ t, state, error, uploadError, videoRef, canvasRef, fileRef, onStart, onUpload }) {
  return (
    <div className="mx-auto max-w-lg">
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-slate-900 shadow-lg">
        {/* Live video preview */}
        <video
          ref={videoRef}
          className={`h-full w-full object-cover ${state === "scanning" ? "opacity-100" : "opacity-0"}`}
          muted
          playsInline
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Idle state — hasn't asked for the camera yet */}
        {state === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-white">
              <QrIcon className="h-9 w-9" />
            </span>
            <p className="text-sm text-slate-200">
              {t.abhaScan.idleText}
            </p>
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 active:scale-[0.98]"
            >
              <CameraIcon className="h-4 w-4" />
              {t.abhaScan.startCamera}
            </button>
          </div>
        )}

        {state === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-200">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            <p className="text-sm">{t.abhaScan.openingCamera}</p>
          </div>
        )}

        {state === "scanning" && (
          <>
            {/* Scan frame overlay */}
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/70">
              <span className="absolute -left-0.5 -top-0.5 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-blue-400" />
              <span className="absolute -right-0.5 -top-0.5 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-blue-400" />
              <span className="absolute -bottom-0.5 -left-0.5 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-blue-400" />
              <span className="absolute -bottom-0.5 -right-0.5 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-blue-400" />
              <span className="absolute inset-x-0 top-0 h-0.5 animate-scan-line bg-blue-400/90" />
            </div>
            <p className="absolute inset-x-0 bottom-3 text-center text-xs font-medium text-white/90">
              {t.abhaScan.alignFrame}
            </p>
          </>
        )}

        {state === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-300">
              <AlertIcon className="h-7 w-7" />
            </span>
            <p className="text-sm text-slate-100">{error}</p>
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 active:scale-[0.98]"
            >
              {t.abhaScan.tryAgain || t.common.tryAgain}
            </button>
          </div>
        )}
      </div>

      {/* Upload fallback — also fully offline, useful with no camera access */}
      <div className="mt-5 flex flex-col items-center gap-2">
        <p className="text-xs text-slate-400">{t.abhaScan.orText}</p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 active:scale-[0.98]"
        >
          <UploadIcon className="h-4 w-4" />
          {t.abhaScan.uploadPhoto}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onUpload} className="sr-only" />
        {uploadError && <p className="max-w-xs text-center text-xs font-medium text-amber-600">{uploadError}</p>}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Result pane: parsed patient profile                                     */
/* ---------------------------------------------------------------------- */

function ResultPane({ t, result, onScanAgain, onRegisterPatient, onDone }) {
  const { ok, profile, raw, format } = result

  if (!ok) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
          <AlertIcon className="h-7 w-7" />
        </span>
        <h2 className="text-base font-bold text-amber-900">{t.abhaScan.unrecognizedTitle}</h2>
        <p className="mt-1 text-sm text-amber-700">
          {t.abhaScan.unrecognizedDesc}
        </p>
        <pre className="mt-3 max-h-40 overflow-auto rounded-2xl border border-amber-200 bg-white p-3 text-left text-xs text-slate-600">
          {raw}
        </pre>
        <button
          type="button"
          onClick={onScanAgain}
          className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 active:scale-[0.98]"
        >
          <ScanIcon className="h-4 w-4" />
          {t.abhaScan.scanAgain}
        </button>
      </div>
    )
  }

  const fullAddress = [profile.address, profile.district, profile.state, profile.pincode]
    .filter(Boolean)
    .join(", ")

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-emerald-700">
          <CheckIcon className="h-5 w-5 shrink-0" />
          <p className="text-sm font-semibold">{t.abhaScan.successTitle}</p>
        </div>
        <p className="mt-1 text-xs text-emerald-600">
          {t.abhaScan.successDesc}
        </p>
      </div>

      <div className="mt-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-blue-600">
            {profile.photo ? (
              <img src={profile.photo} alt={profile.name || "Patient"} className="h-full w-full object-cover" />
            ) : (
              <UserIcon className="h-8 w-8" />
            )}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-slate-800">{profile.name || t.abhaScan.nameNotAvailable}</h2>
            <p className="text-sm text-slate-500">
              {[t.register.genders[profile.gender] || profile.gender, profile.age ? `${profile.age} ${t.abhaScan.yearsSuffix}` : null].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <InfoRow label={t.abhaScan.abhaNumber} value={profile.abhaNumber} mono />
          <InfoRow label={t.abhaScan.abhaAddress} value={profile.abhaAddress} mono />
          <InfoRow label={t.abhaScan.dob} value={profile.dob || (profile.yearOfBirth ? `${t.abhaScan.yearPrefix} ${profile.yearOfBirth}` : null)} />
          <InfoRow label={t.abhaScan.mobile} value={profile.mobile} />
          <InfoRow label={t.abhaScan.address} value={fullAddress || null} full />
        </dl>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => onRegisterPatient?.(profile)}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 active:scale-[0.98]"
        >
          <UserPlusIcon className="h-5 w-5" />
          {t.abhaScan.registerPatientBtn}
        </button>
        <button
          type="button"
          onClick={onScanAgain}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-base font-semibold text-blue-700 transition hover:bg-blue-100 active:scale-[0.98]"
        >
          <ScanIcon className="h-5 w-5" />
          {t.abhaScan.scanAnotherBtn}
        </button>
      </div>
      <button
        type="button"
        onClick={onDone}
        className="mt-3 w-full py-2 text-center text-sm font-medium text-slate-400 transition hover:text-slate-600"
      >
        {t.abhaScan.doneBtn}
      </button>
      {format === "url" && (
        <p className="mt-2 text-center text-[11px] text-slate-400">
          {t.abhaScan.parsedFromUrl}
        </p>
      )}
    </div>
  )
}

function InfoRow({ label, value, mono, full }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-0.5 text-sm text-slate-700 ${mono ? "font-mono" : ""}`}>{value || "—"}</dd>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Icons                                                                    */
/* ---------------------------------------------------------------------- */

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
function AlertIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}
function UploadIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5M12 3v12" />
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
function UserIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}
function UserPlusIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  )
}
function ScanIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
    </svg>
  )
}
