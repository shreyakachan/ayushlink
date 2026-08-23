/**
 * AyushLink — Central API Client
 * Connects the PWA frontend to the FastAPI + MongoDB backend.
 */

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000/api"

// Token & Session Storage Keys
const TOKEN_KEY = "ayushlink_token"
const USER_KEY = "ayushlink_user"
const ROLE_KEY = "ayushlink_role"

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
 * Core fetch wrapper with JSON serialization, JWT auth headers, and error handling.
 */
export async function apiFetch(endpoint, options = {}) {
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
      }
      const error = new Error(errorMsg)
      error.status = response.status
      error.data = data
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
  clearAuthSession()

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
  clearAuthSession()
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
  clearAuthSession()

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
  clearAuthSession()
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
  clearAuthSession()

  const res = await apiFetch("/doctor/login", {
    method: "POST",
    body: { phone: cleanPhone, password: password || "DoctorSecurePass123" },
  })
  if (res.access_token) {
    setAuthSession(res.access_token, res.doctor, "doctor")
  }
  return res
}

export async function registerDoctor(doctorData) {
  const cleanPhone = String(doctorData.phone || doctorData.mobile).replace(/\D/g, "").slice(-10)
  const payload = {
    full_name: doctorData.full_name || doctorData.fullName || "Dr. Anjali Rao",
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

/* =========================================================================
   Offline Synchronization API Methods
   ========================================================================= */

export async function syncBatch(items, batchId = null) {
  return await apiFetch("/sync/batch", {
    method: "POST",
    body: { items, batch_id: batchId },
  })
}

export async function checkSyncStatus() {
  return await apiFetch("/sync/status")
}
