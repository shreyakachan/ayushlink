/**
 * AyushLink — Central API Client
 * Connects the PWA frontend to the FastAPI + MongoDB backend.
 */

export const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  (typeof window !== "undefined" && window.location?.origin && window.location.origin !== "http://localhost:5173"
    ? "/api"
    : "http://127.0.0.1:8000/api")

// Token & Session Storage Keys
const TOKEN_KEY = "ayushlink_token"
const USER_KEY = "ayushlink_user"
const ROLE_KEY = "ayushlink_role"
const ACCOUNTS_CACHE_KEY = "ayushlink_cached_accounts"

export function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null
  } catch {
    return null
  }
}

export function getAuthUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function getAuthRole() {
  try {
    const raw = localStorage.getItem(ROLE_KEY)
    return raw || null
  } catch {
    return null
  }
}

export function setAuthSession(token, user, role) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    if (role) localStorage.setItem(ROLE_KEY, role)
    if (user?.patient_id) localStorage.setItem("ayushlink_current_patient_id", user.patient_id)

    // Store in offline accounts cache for offline authentication reuse
    const tokenInfo = checkTokenExpiry(token)
    const rawPhone = user?.phone || user?.mobile || user?.phone_number || tokenInfo?.payload?.phone
    const cleanPhone = rawPhone ? String(rawPhone).replace(/\D/g, "").slice(-10) : null
    const userId = user?.patient_id || user?.worker_id || user?.doctor_id || user?.id || tokenInfo?.payload?.sub

    if (token && user && role) {
      const cacheRaw = localStorage.getItem(ACCOUNTS_CACHE_KEY)
      const cache = cacheRaw ? JSON.parse(cacheRaw) : {}
      const entry = {
        token,
        user,
        role,
        saved_at: Date.now(),
      }

      if (cleanPhone) {
        cache[`${role}_${cleanPhone}`] = entry
      }
      if (userId) {
        cache[`${role}_${String(userId).trim().toLowerCase()}`] = entry
      }

      localStorage.setItem(ACCOUNTS_CACHE_KEY, JSON.stringify(cache))
    }
  } catch {}
}

export function clearAuthSession() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(ROLE_KEY)
    localStorage.removeItem("ayushlink_current_patient_id")
  } catch {}
}

export function logoutUser() {
  clearAuthSession()
}

/**
 * Validate JWT access token structure and expiration timestamp locally.
 */
export function checkTokenExpiry(token) {
  if (!token || typeof token !== "string") return { valid: false, expired: true }
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return { valid: false, expired: true }
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/")
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    )
    const payload = JSON.parse(jsonPayload)
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return { valid: false, expired: true, payload }
    }
    return { valid: true, expired: false, payload }
  } catch {
    return { valid: false, expired: true }
  }
}

/**
 * Retrieve a previously authenticated offline session for a role and phone number or ID.
 */
export function getOfflineCachedSession(role, phoneOrId) {
  if (!phoneOrId) return null
  const cleanPhone = String(phoneOrId).replace(/\D/g, "").slice(-10)
  const cleanId = String(phoneOrId).trim().toLowerCase()

  try {
    // 1. Check multi-account cache
    const cacheRaw = localStorage.getItem(ACCOUNTS_CACHE_KEY)
    if (cacheRaw) {
      const cache = JSON.parse(cacheRaw)

      // Direct key match
      if (cleanPhone && cache[`${role}_${cleanPhone}`]) {
        const entry = cache[`${role}_${cleanPhone}`]
        if (entry && entry.token && entry.user) return entry
      }
      if (cleanId && cache[`${role}_${cleanId}`]) {
        const entry = cache[`${role}_${cleanId}`]
        if (entry && entry.token && entry.user) return entry
      }

      // Scan all entries in cache
      for (const [key, entry] of Object.entries(cache)) {
        if (!entry || entry.role !== role) continue

        const entryUser = entry.user || {}
        const entryPhone = String(entryUser.phone || entryUser.mobile || "").replace(/\D/g, "").slice(-10)
        const entryId = String(entryUser.patient_id || entryUser.worker_id || entryUser.doctor_id || entryUser.id || "").trim().toLowerCase()
        const tokenInfo = checkTokenExpiry(entry.token)
        const tokenSub = String(tokenInfo?.payload?.sub || "").trim().toLowerCase()
        const tokenPhone = String(tokenInfo?.payload?.phone || "").replace(/\D/g, "").slice(-10)

        if (
          (cleanPhone && (entryPhone === cleanPhone || tokenPhone === cleanPhone)) ||
          (cleanId && (entryId === cleanId || tokenSub === cleanId))
        ) {
          return entry
        }
      }
    }

    // 2. Check active session if matching
    const currentRole = getAuthRole()
    const currentUser = getAuthUser()
    const currentToken = getAuthToken()
    if (currentRole === role && currentUser && currentToken) {
      const userPhone = String(currentUser.phone || currentUser.mobile || "").replace(/\D/g, "").slice(-10)
      const userId = String(currentUser.patient_id || currentUser.worker_id || currentUser.doctor_id || currentUser.id || "").trim().toLowerCase()
      if ((cleanPhone && userPhone === cleanPhone) || (cleanId && userId === cleanId)) {
        return {
          token: currentToken,
          user: currentUser,
          role: currentRole,
        }
      }
    }
  } catch {}
  return null
}

/**
 * Core fetch wrapper with JSON serialization, JWT auth headers, and error handling.
 */
export async function apiFetch(endpoint, options = {}) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const offlineError = new Error("Network connection unavailable (offline mode).")
    offlineError.isOffline = true
    throw offlineError
  }

  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`
  const token = getAuthToken()

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  }

  const config = {
    ...options,
    headers,
  }

  if (options.body && typeof options.body === "object" && !(options.body instanceof FormData)) {
    config.body = JSON.stringify(options.body)
  }

  try {
    const response = await fetch(url, config)
    const isJson = response.headers.get("content-type")?.includes("application/json")
    const data = isJson ? await response.json() : await response.text()

    if (!response.ok) {
      let errorMsg = `Request failed with status ${response.status}`
      let isBackendOffline = response.status === 502 || response.status === 503 || response.status === 504

      if (typeof data === "object" && data !== null) {
        if (typeof data.detail === "string") {
          errorMsg = data.detail
        } else if (Array.isArray(data.detail)) {
          errorMsg = data.detail.map((d) => d.msg || JSON.stringify(d)).join(", ")
        } else if (data.message) {
          errorMsg = data.message
        } else if (data.error) {
          errorMsg = data.error
        }
      } else if (typeof data === "string") {
        if (
          data.includes("ECONNREFUSED") ||
          data.includes("connect ECONNREFUSED") ||
          data.includes("Failed to proxy") ||
          data.includes("Proxy error")
        ) {
          errorMsg = "Backend server is offline or starting up."
          isBackendOffline = true
        }
      }

      const error = new Error(errorMsg)
      error.status = response.status
      error.data = data
      error.isOffline = isBackendOffline
      throw error
    }

    return data
  } catch (err) {
    if (err.status) {
      throw err
    }
    if (
      err.name === "TypeError" ||
      (err.message && (err.message.includes("fetch") || err.message.includes("NetworkError") || err.message.includes("Failed to fetch")))
    ) {
      const offlineError = new Error("Network connection unavailable. Backend server may be offline.")
      offlineError.isOffline = true
      throw offlineError
    }
    throw err
  }
}

/* =========================================================================
   Authentication API Methods (Direct Password/PIN + JWT, No OTP)
   ========================================================================= */

export async function loginPatient(phone, password) {
  const cleanPhone = String(phone).replace(/\D/g, "").slice(-10)

  // PATH A: Offline session restoration
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const session = getOfflineCachedSession("patient", cleanPhone)
    if (!session) {
      const offlineError = new Error("Internet connection is required for your first login.")
      offlineError.isOffline = true
      throw offlineError
    }
    const tokenCheck = checkTokenExpiry(session.token)
    if (tokenCheck.expired) {
      const expiredError = new Error("Your session has expired. Please connect to the internet to sign in again.")
      expiredError.isOffline = true
      throw expiredError
    }
    setAuthSession(session.token, session.user, "patient")
    return {
      access_token: session.token,
      token_type: "bearer",
      patient: session.user,
      is_offline: true,
      message: "Offline session restored successfully",
    }
  }

  // PATH B: Online backend authentication
  const res = await apiFetch("/patient/login", {
    method: "POST",
    body: { phone: cleanPhone, password: password || "123456" },
  })
  if (res.access_token) {
    setAuthSession(res.access_token, res.patient, "patient")
  }
  return res
}

export async function registerPatient(patientData) {
  const cleanPhone = String(patientData.phone || patientData.mobile).replace(/\D/g, "").slice(-10)
  const payload = {
    full_name: patientData.full_name || patientData.fullName || "Patient",
    phone: cleanPhone,
    password: patientData.password || "123456",
    age: Number(patientData.age) || 30,
    gender: (patientData.gender || "female").toLowerCase(),
    village: patientData.village || "Chandapur",
    preferred_language: patientData.preferred_language || patientData.preferredLanguage || "en",
    abha_id: patientData.abha_id || patientData.abhaId || null,
    blood_group: patientData.blood_group || patientData.bloodGroup || null,
    allergies: patientData.allergies || [],
    chronic_conditions: patientData.chronic_conditions || patientData.chronicConditions || [],
  }

  const res = await apiFetch("/patient/register", {
    method: "POST",
    body: payload,
  })
  if (res.access_token) {
    setAuthSession(res.access_token, res.patient, "patient")
  }
  return res
}

export async function loginAsha(phone, password) {
  const cleanPhone = String(phone).replace(/\D/g, "").slice(-10)

  // PATH A: Offline session restoration
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const session = getOfflineCachedSession("asha", cleanPhone)
    if (!session) {
      const offlineError = new Error("Internet connection is required for your first login.")
      offlineError.isOffline = true
      throw offlineError
    }
    const tokenCheck = checkTokenExpiry(session.token)
    if (tokenCheck.expired) {
      const expiredError = new Error("Your session has expired. Please connect to the internet to sign in again.")
      expiredError.isOffline = true
      throw expiredError
    }
    setAuthSession(session.token, session.user, "asha")
    return {
      access_token: session.token,
      token_type: "bearer",
      asha_worker: session.user,
      is_offline: true,
      message: "Offline session restored successfully",
    }
  }

  // PATH B: Online backend authentication
  const res = await apiFetch("/asha/login", {
    method: "POST",
    body: { phone: cleanPhone, password: password || "AshaPassword123" },
  })
  if (res.access_token) {
    setAuthSession(res.access_token, res.asha_worker, "asha")
  }
  return res
}

export async function registerAsha(ashaData) {
  const cleanPhone = String(ashaData.phone || ashaData.mobile).replace(/\D/g, "").slice(-10)
  const payload = {
    full_name: ashaData.full_name || ashaData.fullName || "ASHA Worker",
    phone: cleanPhone,
    password: ashaData.password || "AshaPassword123",
    assigned_villages: ashaData.assigned_villages || ashaData.assignedVillages || ["Chandapur", "Nandgaon"],
    primary_phc: ashaData.primary_phc || ashaData.primaryPhc || "Chandapur PHC",
    preferred_language: ashaData.preferred_language || ashaData.preferredLanguage || "en",
  }

  const res = await apiFetch("/asha/register", {
    method: "POST",
    body: payload,
  })
  if (res.access_token) {
    setAuthSession(res.access_token, res.asha_worker, "asha")
  }
  return res
}

export async function loginDoctor(phone, password) {
  const cleanPhone = String(phone).replace(/\D/g, "").slice(-10)

  // PATH A: Offline session restoration
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const session = getOfflineCachedSession("doctor", cleanPhone)
    if (!session) {
      const offlineError = new Error("Internet connection is required for your first login.")
      offlineError.isOffline = true
      throw offlineError
    }
    const tokenCheck = checkTokenExpiry(session.token)
    if (tokenCheck.expired) {
      const expiredError = new Error("Your session has expired. Please connect to the internet to sign in again.")
      expiredError.isOffline = true
      throw expiredError
    }
    setAuthSession(session.token, session.user, "doctor")
    return {
      access_token: session.token,
      token_type: "bearer",
      doctor: session.user,
      is_offline: true,
      message: "Offline session restored successfully",
    }
  }

  // PATH B: Online backend authentication
  const res = await apiFetch("/doctor/login", {
    method: "POST",
    body: { phone: cleanPhone, password: password || "DoctorSecurePass123" },
  })
  if (res.access_token) {
    setAuthSession(res.access_token, res.doctor, "doctor")
  }
  return res
}

export async function getDoctorProfile() {
  return await apiFetch("/doctor/profile")
}

export async function registerDoctor(doctorData) {
  const cleanPhone = String(doctorData.phone || doctorData.mobile).replace(/\D/g, "").slice(-10)
  const payload = {
    full_name: doctorData.full_name || doctorData.fullName || "Doctor",
    phone: cleanPhone,
    password: doctorData.password || "DoctorSecurePass123",
    email: doctorData.email || null,
    specialization: doctorData.specialization || "General Physician",
    qualification: doctorData.qualification || "MBBS, MD",
    registration_number: doctorData.registration_number || doctorData.registrationNumber || null,
    assigned_facility: doctorData.assigned_facility || doctorData.assignedFacility || "District Hospital",
    preferred_language: doctorData.preferred_language || doctorData.preferredLanguage || "en",
    is_on_duty: doctorData.is_on_duty !== undefined ? doctorData.is_on_duty : true,
  }

  const res = await apiFetch("/doctor/register", {
    method: "POST",
    body: payload,
  })
  if (res.access_token) {
    setAuthSession(res.access_token, res.doctor, "doctor")
  }
  return res
}

/* =========================================================================
   Patients & Medical Records API Methods
   ========================================================================= */

export async function getPatientsList() {
  return await apiFetch("/patients")
}

export async function getPatientMedicalRecord(patientId = null) {
  const role = getAuthRole()
  if (role === "asha" && patientId) {
    return await apiFetch(`/asha/patients/${patientId}/records`)
  }
  if (role === "doctor" && patientId) {
    return await apiFetch(`/doctor/patients/${patientId}/records`)
  }
  return await apiFetch("/patient/medical-record")
}

export async function updatePatientMedicalRecord(updateData, patientId = null) {
  const role = getAuthRole()
  if (role === "asha" && patientId) {
    return await apiFetch(`/asha/patients/${patientId}/records`, {
      method: "PUT",
      body: updateData,
    })
  }
  return await apiFetch("/patient/medical-record", {
    method: "PUT",
    body: updateData,
  })
}

export async function submitPatientSymptoms(symptomData, patientId = null) {
  const role = getAuthRole()
  if (role === "asha" && patientId) {
    return await apiFetch(`/asha/patients/${patientId}/symptoms`, {
      method: "POST",
      body: symptomData,
    })
  }
  return await apiFetch("/patient/symptoms", {
    method: "POST",
    body: symptomData,
  })
}

export async function getPatientSymptoms(patientId = null) {
  return await apiFetch("/patient/symptoms")
}

export async function getAshaCases() {
  return await apiFetch("/asha/cases")
}

export async function assignPatientToAsha(patientId, workerId = null) {
  const role = getAuthRole()
  if (role === "asha" && !workerId) {
    return await apiFetch(`/asha/patients/${patientId}/assign`, {
      method: "POST",
    })
  }
  return await apiFetch(`/patients/${patientId}/assign-asha`, {
    method: "POST",
    body: { worker_id: workerId },
  })
}

/* =========================================================================
   Doctor Consultation & Cases API Methods
   ========================================================================= */

export async function getDoctorCases() {
  return await apiFetch("/doctor/cases")
}

export async function getDoctorPatients() {
  try {
    return await apiFetch("/doctor/patients")
  } catch {
    return await apiFetch("/doctor/cases")
  }
}

export async function getDoctorMchCases() {
  try {
    return await apiFetch("/doctor/mch-cases")
  } catch {
    return []
  }
}

export async function assignDoctorCase(patientId) {
  return await apiFetch(`/doctor/cases/${patientId}/assign`, {
    method: "POST",
  })
}

export async function getAshaWorkersList() {
  return await apiFetch("/doctor/asha-workers")
}



/* =========================================================================
   Digital Prescriptions API Methods
   ========================================================================= */

export async function getPatientPrescriptions(patientId = null) {
  const role = getAuthRole()
  if (role === "asha" && patientId) {
    return await apiFetch(`/asha/patients/${patientId}/prescriptions`)
  }
  if (role === "doctor" && patientId) {
    return await apiFetch(`/doctor/patients/${patientId}/prescriptions`)
  }
  if (role === "doctor") {
    return await apiFetch("/doctor/prescriptions")
  }
  return await apiFetch("/patient/prescriptions")
}

export async function createDoctorPrescription(prescriptionData) {
  return await apiFetch("/doctor/prescriptions", {
    method: "POST",
    body: prescriptionData,
  })
}

/* =========================================================================
   Teleconsultations API Methods
   ========================================================================= */

export async function requestConsultation(consultationData) {
  return await apiFetch("/consultations/request", {
    method: "POST",
    body: consultationData,
  })
}

export async function submitDoctorConsultation(consultationData) {
  return await apiFetch("/doctor/consultations", {
    method: "POST",
    body: consultationData,
  })
}

export async function getPatientConsultations(patientId) {
  return await apiFetch(`/doctor/patients/${patientId}/consultations`)
}

export async function decideConsultation(consultationId, action, notes = null) {
  return await apiFetch(`/consultations/${consultationId}/decision`, {
    method: "POST",
    body: { action, notes },
  })
}

export async function updateConsultationStatus(consultationId, status, notes = null) {
  return await apiFetch(`/consultations/${consultationId}/status`, {
    method: "PATCH",
    body: { status, notes },
  })
}

export async function getConsultationHistory() {
  return await apiFetch("/consultations/history")
}

export async function getPatientActiveVideoRequest() {
  return await apiFetch("/consultations/active-request")
}

export async function getDoctorVideoRequests() {
  return await apiFetch("/doctor/video-requests")
}

export async function endConsultationCall(consultationId) {
  return await apiFetch(`/consultations/${consultationId}/end-call`, {
    method: "POST",
  })
}

export async function getAvailableDoctors() {
  try {
    return await apiFetch("/doctors")
  } catch {
    return []
  }
}

/* =========================================================================
   Offline Synchronization API Methods
   ========================================================================= */

export async function syncBatch(itemsOrPayload, batchId = null) {
  let payload = {}

  if (itemsOrPayload && !Array.isArray(itemsOrPayload) && typeof itemsOrPayload === "object") {
    // Style 2: syncBatch({ batch_id, items })
    payload = {
      batch_id: itemsOrPayload.batch_id || batchId || `BATCH-${Date.now()}`,
      items: Array.isArray(itemsOrPayload.items) ? itemsOrPayload.items : [],
    }
  } else {
    // Style 1: syncBatch(itemsArray, batchId)
    payload = {
      batch_id: batchId || `BATCH-${Date.now()}`,
      items: Array.isArray(itemsOrPayload) ? itemsOrPayload : [],
    }
  }

  return await apiFetch("/sync/batch", {
    method: "POST",
    body: payload,
  })
}

export async function checkSyncStatus() {
  return await apiFetch("/sync/status")
}

/* =========================================================================
   In-App Notifications API Methods
   ========================================================================= */

export async function getDoctorNotifications() {
  return await apiFetch("/doctor/notifications")
}

export async function markDoctorNotificationRead(notificationId) {
  return await apiFetch(`/doctor/notifications/${notificationId}/read`, {
    method: "PATCH",
  })
}

export async function markAllDoctorNotificationsRead() {
  return await apiFetch("/doctor/notifications/read-all", {
    method: "PATCH",
  })
}

export async function getPatientNotifications() {
  return await apiFetch("/patient/notifications")
}

export async function getNotifications(role = null) {
  const currentRole = role || getAuthRole()
  if (currentRole === "doctor") {
    return await getDoctorNotifications()
  }
  if (currentRole === "patient") {
    return await getPatientNotifications()
  }
  // Default to doctor if token is doctor, else patient
  try {
    return await apiFetch("/doctor/notifications")
  } catch {
    return await apiFetch("/patient/notifications")
  }
}

export async function markNotificationRead(notificationId, role = null) {
  const currentRole = role || getAuthRole()
  if (currentRole === "doctor") {
    return await markDoctorNotificationRead(notificationId)
  }
  return await apiFetch(`/patient/notifications/${notificationId}/read`, {
    method: "PATCH",
  })
}

