/**
 * AyushLink — Central API Client
 * Connects the PWA frontend to the FastAPI + MongoDB backend.
 */

export const API_BASE_URL = (() => {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  if (typeof window !== "undefined" && window.location) {
    const { hostname, port, origin } = window.location
    // When served via Vite dev/preview ports (e.g. 5173, 4173, 3000), relative '/api' utilizes Vite's built-in reverse proxy
    if (port === "5173" || port === "4173" || port === "3000") {
      return "/api"
    }
    // When accessed via custom LAN IP/host (e.g. 192.168.x.x or standalone PWA)
    if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
      return `http://${hostname}:8000/api`
    }
    if (origin && origin !== "null") {
      return "/api"
    }
  }
  return "http://127.0.0.1:8000/api"
})()

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

/**
 * Retrieve patient user session strictly separated from doctor and ASHA profiles.
 * Guaranteed to never return a doctor or ASHA identity for patient operations.
 */
export function getPatientAuthUser() {
  try {
    const role = getAuthRole()
    if (role === "patient") {
      const u = getAuthUser()
      if (u && !u.doctor_id && !u.worker_id && u.role !== "doctor" && u.role !== "asha") {
        return u
      }
    }
    const raw = localStorage.getItem("ayushlink_patient_user")
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && !parsed.doctor_id && !parsed.worker_id && parsed.role !== "doctor") return parsed
    }
    const cacheRaw = localStorage.getItem(ACCOUNTS_CACHE_KEY)
    if (cacheRaw) {
      const cache = JSON.parse(cacheRaw)
      const pEntry = cache["patient_9324998108"] || cache["patient_p-4559"] || Object.values(cache).find(e => e.role === "patient" && !e.user?.doctor_id && !e.user?.worker_id)
      if (pEntry?.user) return pEntry.user
    }
  } catch {}
  return {
    patient_id: "P-4559",
    full_name: "Shreya",
    name: "Shreya",
    phone: "9324998108",
    village: "Chandapur",
    role: "patient",
  }
}

/**
 * Retrieve patient JWT token strictly separated from other roles.
 * Guaranteed to never return a doctor or ASHA token.
 */
export function getPatientAuthToken() {
  try {
    // 1. Dedicated patient token storage
    const patientTok = localStorage.getItem("ayushlink_patient_token")
    if (patientTok) {
      const check = checkTokenExpiry(patientTok)
      if (!check.expired && check.payload?.role === "patient") {
        return patientTok
      }
    }

    // 2. Active generic token IF it belongs to a patient
    const role = getAuthRole()
    if (role === "patient") {
      const tok = getAuthToken()
      if (tok) {
        const check = checkTokenExpiry(tok)
        if (!check.expired && check.payload?.role === "patient") {
          return tok
        }
      }
    }

    // 3. Offline accounts cache
    const cacheRaw = localStorage.getItem(ACCOUNTS_CACHE_KEY)
    if (cacheRaw) {
      const cache = JSON.parse(cacheRaw)
      const pEntry =
        cache["patient_9324998108"] ||
        cache["patient_p-4559"] ||
        Object.values(cache).find(
          (e) => e.role === "patient" && e.token && checkTokenExpiry(e.token).payload?.role === "patient"
        )
      if (pEntry?.token) {
        const check = checkTokenExpiry(pEntry.token)
        if (!check.expired && check.payload?.role === "patient") {
          return pEntry.token
        }
      }
    }
  } catch {}
  return null
}

/**
 * Retrieve ASHA JWT token strictly separated from patient and doctor roles.
 * Guaranteed to never return a patient or doctor token.
 */
export function getAshaAuthToken() {
  try {
    // 1. Dedicated ASHA token storage
    const ashaTok = localStorage.getItem("ayushlink_asha_token")
    if (ashaTok) {
      const check = checkTokenExpiry(ashaTok)
      if (!check.expired && check.payload?.role === "asha") {
        return ashaTok
      }
    }

    // 2. Active generic token IF it belongs to an ASHA worker
    const role = getAuthRole()
    if (role === "asha") {
      const tok = getAuthToken()
      if (tok) {
        const check = checkTokenExpiry(tok)
        if (!check.expired && check.payload?.role === "asha") {
          return tok
        }
      }
    }

    // 3. Offline accounts cache
    const cacheRaw = localStorage.getItem(ACCOUNTS_CACHE_KEY)
    if (cacheRaw) {
      const cache = JSON.parse(cacheRaw)
      const aEntry =
        cache["asha_9876543210"] ||
        Object.values(cache).find(
          (e) => e.role === "asha" && e.token && checkTokenExpiry(e.token).payload?.role === "asha"
        )
      if (aEntry?.token) {
        const check = checkTokenExpiry(aEntry.token)
        if (!check.expired && check.payload?.role === "asha") {
          return aEntry.token
        }
      }
    }
  } catch {}
  return null
}

/**
 * Retrieve ASHA worker user profile strictly separated from patient and doctor roles.
 */
export function getAshaAuthUser() {
  try {
    const role = getAuthRole()
    if (role === "asha") {
      const u = getAuthUser()
      if (u && (u.worker_id || u.role === "asha")) return u
    }
    const raw = localStorage.getItem("ayushlink_asha_user")
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed) return parsed
    }
    const cacheRaw = localStorage.getItem(ACCOUNTS_CACHE_KEY)
    if (cacheRaw) {
      const cache = JSON.parse(cacheRaw)
      const aEntry = cache["asha_9876543210"] || Object.values(cache).find(e => e.role === "asha" && e.user)
      if (aEntry?.user) return aEntry.user
    }
  } catch {}
  return null
}

/**
 * Retrieve Doctor JWT token strictly separated from patient and ASHA roles.
 * Guaranteed to never return a patient or ASHA token.
 */
export function getDoctorAuthToken() {
  try {
    // 1. Dedicated Doctor token storage
    const docTok = localStorage.getItem("ayushlink_doctor_token")
    if (docTok) {
      const check = checkTokenExpiry(docTok)
      if (!check.expired && check.payload?.role === "doctor") {
        return docTok
      }
    }

    // 2. Active generic token IF it belongs to a Doctor
    const role = getAuthRole()
    if (role === "doctor") {
      const tok = getAuthToken()
      if (tok) {
        const check = checkTokenExpiry(tok)
        if (!check.expired && check.payload?.role === "doctor") {
          return tok
        }
      }
    }

    // 3. Offline accounts cache
    const cacheRaw = localStorage.getItem(ACCOUNTS_CACHE_KEY)
    if (cacheRaw) {
      const cache = JSON.parse(cacheRaw)
      const dEntry =
        cache["doctor_9823088882"] ||
        cache["doctor_doc-501"] ||
        Object.values(cache).find(
          (e) => e.role === "doctor" && e.token && checkTokenExpiry(e.token).payload?.role === "doctor"
        )
      if (dEntry?.token) {
        const check = checkTokenExpiry(dEntry.token)
        if (!check.expired && check.payload?.role === "doctor") {
          return dEntry.token
        }
      }
    }
  } catch {}
  return null
}

/**
 * Retrieve Doctor user profile strictly separated from patient and ASHA roles.
 * Guaranteed to never return a patient or ASHA identity.
 */
export function getDoctorAuthUser() {
  try {
    const role = getAuthRole()
    if (role === "doctor") {
      const u = getAuthUser()
      if (u && (u.doctor_id || u.role === "doctor") && !u.worker_id && u.role !== "asha" && u.role !== "patient") {
        return u
      }
    }
    const raw = localStorage.getItem("ayushlink_doctor_user")
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && (parsed.doctor_id || parsed.role === "doctor") && !parsed.worker_id && parsed.role !== "asha") {
        return parsed
      }
    }
    const cacheRaw = localStorage.getItem(ACCOUNTS_CACHE_KEY)
    if (cacheRaw) {
      const cache = JSON.parse(cacheRaw)
      const dEntry =
        cache["doctor_9823088882"] ||
        cache["doctor_doc-501"] ||
        Object.values(cache).find((e) => e.role === "doctor" && e.user && !e.user?.worker_id)
      if (dEntry?.user) return dEntry.user
    }
  } catch {}
  return null
}

export function setAuthSession(token, user, role) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    if (role) localStorage.setItem(ROLE_KEY, role)
    
    // Scoped role storage to guarantee isolation between Patient, ASHA, and Doctor
    if (role === "patient" && user) {
      if (token) localStorage.setItem("ayushlink_patient_token", token)
      localStorage.setItem("ayushlink_patient_user", JSON.stringify(user))
      if (user.patient_id) localStorage.setItem("ayushlink_current_patient_id", user.patient_id)
    } else if (role === "doctor" && user) {
      if (token) localStorage.setItem("ayushlink_doctor_token", token)
      localStorage.setItem("ayushlink_doctor_user", JSON.stringify(user))
    } else if (role === "asha" && user) {
      if (token) localStorage.setItem("ayushlink_asha_token", token)
      localStorage.setItem("ayushlink_asha_user", JSON.stringify(user))
    }

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
 * Does NOT artificially reject requests based on navigator.onLine, allowing local-network HTTP calls to succeed offline.
 */
export async function apiFetch(endpoint, options = {}) {
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`
  let token = null
  if (options.headers?.Authorization) {
    // caller explicitly supplied Authorization
  } else {
    const role = getAuthRole()
    const cleanEndpoint = endpoint.toLowerCase()
    if (cleanEndpoint.includes("/doctor") || role === "doctor") {
      token = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
    } else if (cleanEndpoint.includes("/asha") || role === "asha") {
      token = getAshaAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "asha" ? getAuthToken() : null)
    } else if (cleanEndpoint.includes("/patient") || role === "patient") {
      token = getPatientAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "patient" ? getAuthToken() : null)
    } else {
      token = getAuthToken()
    }
  }

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

  try {
    // Attempt online/LAN backend authentication first
    const res = await apiFetch("/patient/login", {
      method: "POST",
      body: { phone: cleanPhone, password: password || "123456" },
    })
    if (res.access_token) {
      setAuthSession(res.access_token, res.patient, "patient")
    }
    return res
  } catch (err) {
    // If backend is genuinely unreachable, fallback to cached offline session
    if (err.isOffline) {
      const session = getOfflineCachedSession("patient", cleanPhone)
      if (session) {
        const tokenCheck = checkTokenExpiry(session.token)
        if (!tokenCheck.expired) {
          setAuthSession(session.token, session.user, "patient")
          return {
            access_token: session.token,
            token_type: "bearer",
            patient: session.user,
            is_offline: true,
            message: "Offline session restored successfully",
          }
        }
      }
    }
    throw err
  }
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

  try {
    // Attempt online/LAN backend authentication first
    const res = await apiFetch("/asha/login", {
      method: "POST",
      body: { phone: cleanPhone, password: password || "AshaPassword123" },
    })
    if (res.access_token) {
      setAuthSession(res.access_token, res.asha_worker, "asha")
    }
    return res
  } catch (err) {
    // If backend is genuinely unreachable, fallback to cached offline session
    if (err.isOffline) {
      const session = getOfflineCachedSession("asha", cleanPhone)
      if (session) {
        const tokenCheck = checkTokenExpiry(session.token)
        if (!tokenCheck.expired) {
          setAuthSession(session.token, session.user, "asha")
          return {
            access_token: session.token,
            token_type: "bearer",
            asha_worker: session.user,
            is_offline: true,
            message: "Offline session restored successfully",
          }
        }
      }
    }
    throw err
  }
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

  try {
    // Attempt online/LAN backend authentication first
    const res = await apiFetch("/doctor/login", {
      method: "POST",
      body: { phone: cleanPhone, password: password || "DoctorSecurePass123" },
    })
    if (res.access_token) {
      setAuthSession(res.access_token, res.doctor, "doctor")
    }
    return res
  } catch (err) {
    // If backend is genuinely unreachable, fallback to cached offline session
    if (err.isOffline) {
      const session = getOfflineCachedSession("doctor", cleanPhone)
      if (session) {
        const tokenCheck = checkTokenExpiry(session.token)
        if (!tokenCheck.expired) {
          setAuthSession(session.token, session.user, "doctor")
          return {
            access_token: session.token,
            token_type: "bearer",
            doctor: session.user,
            is_offline: true,
            message: "Offline session restored successfully",
          }
        }
      }
    }
    throw err
  }
}

export async function getDoctorProfile() {
  const docToken = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
  const headers = docToken ? { Authorization: `Bearer ${docToken}` } : {}
  return await apiFetch("/doctor/profile", { headers })
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
  const role = getAuthRole()
  if (role === "patient") {
    const patientToken = getPatientAuthToken() || getAuthToken()
    const headers = patientToken ? { Authorization: `Bearer ${patientToken}` } : {}
    return await apiFetch("/patients", { headers })
  }
  if (role === "doctor") {
    return await apiFetch("/patients")
  }
  const ashaToken = getAshaAuthToken() || getAuthToken()
  const headers = ashaToken ? { Authorization: `Bearer ${ashaToken}` } : {}
  return await apiFetch("/patients", { headers })
}

export async function getPatientMedicalRecord(patientId = null) {
  const role = getAuthRole()
  if (role === "asha" && patientId) {
    const ashaToken = getAshaAuthToken() || getAuthToken()
    const headers = ashaToken ? { Authorization: `Bearer ${ashaToken}` } : {}
    return await apiFetch(`/asha/patients/${patientId}/records`, { headers })
  }
  if (role === "doctor" && patientId) {
    const docToken = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
    const headers = docToken ? { Authorization: `Bearer ${docToken}` } : {}
    return await apiFetch(`/doctor/patients/${patientId}/records`, { headers })
  }
  const patientToken = getPatientAuthToken() || getAuthToken()
  const headers = {}
  if (patientToken) {
    headers["Authorization"] = `Bearer ${patientToken}`
  }
  return await apiFetch("/patient/medical-record", { headers })
}

export async function updatePatientMedicalRecord(updateData, patientId = null) {
  const role = getAuthRole()
  if (role === "asha" && patientId) {
    const ashaToken = getAshaAuthToken() || getAuthToken()
    const headers = ashaToken ? { Authorization: `Bearer ${ashaToken}` } : {}
    return await apiFetch(`/asha/patients/${patientId}/records`, {
      method: "PUT",
      headers,
      body: updateData,
    })
  }
  const patientToken = getPatientAuthToken() || getAuthToken()
  const headers = {}
  if (patientToken) {
    headers["Authorization"] = `Bearer ${patientToken}`
  }
  return await apiFetch("/patient/medical-record", {
    method: "PUT",
    headers,
    body: updateData,
  })
}

export async function submitPatientSymptoms(symptomData, patientId = null) {
  const role = getAuthRole()
  if (role === "asha" && patientId) {
    const ashaToken = getAshaAuthToken() || getAuthToken()
    const headers = ashaToken ? { Authorization: `Bearer ${ashaToken}` } : {}
    return await apiFetch(`/asha/patients/${patientId}/symptoms`, {
      method: "POST",
      headers,
      body: symptomData,
    })
  }
  const patientToken = getPatientAuthToken() || getAuthToken()
  const headers = patientToken ? { Authorization: `Bearer ${patientToken}` } : {}
  return await apiFetch("/patient/symptoms", {
    method: "POST",
    headers,
    body: symptomData,
  })
}

export async function analyzeSymptoms(analysisData) {
  const role = getAuthRole()
  if (role === "asha" && analysisData.patient_id) {
    try {
      return await apiFetch(`/asha/patients/${encodeURIComponent(analysisData.patient_id)}/analyze-symptoms`, {
        method: "POST",
        body: analysisData,
      })
    } catch (err) {
      if (err.status && err.status >= 500) {
        return await apiFetch("/asha/analyze-symptoms", {
          method: "POST",
          body: analysisData,
        })
      }
      throw err
    }
  }
  return await apiFetch("/asha/analyze-symptoms", {
    method: "POST",
    body: analysisData,
  })
}

export async function getPatientSymptoms(patientId = null) {
  return await apiFetch("/patient/symptoms")
}

export async function getAshaCases() {
  const ashaToken = getAshaAuthToken() || getAuthToken()
  const headers = ashaToken ? { Authorization: `Bearer ${ashaToken}` } : {}
  return await apiFetch("/asha/cases", { headers })
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
   ASHA Worker Inventory API Methods (FastAPI + MongoDB Scoped)
   ========================================================================= */

export async function getAshaInventory() {
  const ashaToken = getAshaAuthToken() || getAuthToken()
  const headers = {}
  if (ashaToken) {
    headers["Authorization"] = `Bearer ${ashaToken}`
  }
  return await apiFetch("/asha/inventory", { headers })
}

export async function adjustAshaInventoryStock(itemId, delta) {
  const ashaToken = getAshaAuthToken() || getAuthToken()
  const headers = {}
  if (ashaToken) {
    headers["Authorization"] = `Bearer ${ashaToken}`
  }
  return await apiFetch(`/asha/inventory/${itemId}/adjust`, {
    method: "POST",
    headers,
    body: { delta: Number(delta) },
  })
}

export async function updateAshaInventoryItem(itemId, updateData) {
  const ashaToken = getAshaAuthToken() || getAuthToken()
  const headers = {}
  if (ashaToken) {
    headers["Authorization"] = `Bearer ${ashaToken}`
  }
  return await apiFetch(`/asha/inventory/${itemId}`, {
    method: "PATCH",
    headers,
    body: updateData,
  })
}

/* =========================================================================
   Doctor Consultation & Cases API Methods
   ========================================================================= */

export async function getDoctorCases() {
  const docToken = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
  const headers = docToken ? { Authorization: `Bearer ${docToken}` } : {}
  return await apiFetch("/doctor/cases", { headers })
}

export async function getDoctorPatients() {
  const docToken = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
  const headers = docToken ? { Authorization: `Bearer ${docToken}` } : {}
  try {
    return await apiFetch("/doctor/patients", { headers })
  } catch {
    return await apiFetch("/doctor/cases", { headers })
  }
}

export async function getMchCases() {
  const role = getAuthRole()
  if (role === "asha") {
    const ashaToken = getAshaAuthToken() || getAuthToken()
    const headers = ashaToken ? { Authorization: `Bearer ${ashaToken}` } : {}
    return await apiFetch("/doctor/mch-cases", { headers })
  }
  const docToken = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
  const headers = docToken ? { Authorization: `Bearer ${docToken}` } : {}
  return await apiFetch("/doctor/mch-cases", { headers })
}

export const getDoctorMchCases = getMchCases

export async function assignDoctorCase(patientId) {
  const docToken = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
  const headers = docToken ? { Authorization: `Bearer ${docToken}` } : {}
  return await apiFetch(`/doctor/cases/${patientId}/assign`, {
    method: "POST",
    headers,
  })
}

export async function getAshaWorkersList() {
  const role = getAuthRole()
  if (role === "patient") {
    return await getAshaCallWorkersList()
  }
  const docToken = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
  const headers = docToken ? { Authorization: `Bearer ${docToken}` } : {}
  return await apiFetch("/doctor/asha-workers", { headers })
}



/* =========================================================================
   Digital Prescriptions API Methods
   ========================================================================= */

export async function getPatientPrescriptions(patientId = null) {
  const role = getAuthRole()
  if (role === "asha" && patientId) {
    const ashaToken = getAshaAuthToken() || getAuthToken()
    const headers = ashaToken ? { Authorization: `Bearer ${ashaToken}` } : {}
    return await apiFetch(`/asha/patients/${patientId}/prescriptions`, { headers })
  }
  if (role === "doctor" && patientId) {
    const docToken = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
    const headers = docToken ? { Authorization: `Bearer ${docToken}` } : {}
    return await apiFetch(`/doctor/patients/${patientId}/prescriptions`, { headers })
  }
  if (role === "doctor") {
    const docToken = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
    const headers = docToken ? { Authorization: `Bearer ${docToken}` } : {}
    return await apiFetch("/doctor/prescriptions", { headers })
  }
  const patientToken = getPatientAuthToken() || getAuthToken()
  const headers = patientToken ? { Authorization: `Bearer ${patientToken}` } : {}
  return await apiFetch("/patient/prescriptions", { headers })
}

export async function createDoctorPrescription(prescriptionData) {
  const docToken = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
  const headers = docToken ? { Authorization: `Bearer ${docToken}` } : {}
  return await apiFetch("/doctor/prescriptions", {
    method: "POST",
    body: prescriptionData,
    headers,
  })
}

/* =========================================================================
   Teleconsultations API Methods
   ========================================================================= */

export async function requestConsultation(consultationData, options = {}) {
  const role = getAuthRole()
  let token = options.token

  if (!token) {
    if (role === "asha") {
      token = getAshaAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "asha" ? getAuthToken() : null)
    } else {
      // Default to patient-specific bearer token
      token = getPatientAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "patient" ? getAuthToken() : null)
    }
  }

  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  }

  return await apiFetch("/consultations/request", {
    method: "POST",
    body: consultationData,
    headers,
  })
}

export async function submitDoctorConsultation(consultationData) {
  const docToken = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
  const headers = docToken ? { Authorization: `Bearer ${docToken}` } : {}
  return await apiFetch("/doctor/consultations", {
    method: "POST",
    body: consultationData,
    headers,
  })
}

export async function getPatientConsultations(patientId) {
  const docToken = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
  const headers = docToken ? { Authorization: `Bearer ${docToken}` } : {}
  return await apiFetch(`/doctor/patients/${patientId}/consultations`, { headers })
}

export async function decideConsultation(consultationId, action, notes = null) {
  const docToken = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
  const headers = docToken ? { Authorization: `Bearer ${docToken}` } : {}
  return await apiFetch(`/consultations/${consultationId}/decision`, {
    method: "POST",
    body: { action, notes },
    headers,
  })
}

export async function updateConsultationStatus(consultationId, status, notes = null, options = {}) {
  const role = getAuthRole()
  let token = options.token

  if (!token) {
    if (role === "patient") {
      token = getPatientAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "patient" ? getAuthToken() : null)
    } else if (role === "asha") {
      token = getAshaAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "asha" ? getAuthToken() : null)
    }
  }

  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  }

  return await apiFetch(`/consultations/${consultationId}/status`, {
    method: "PATCH",
    body: { status, notes },
    headers,
  })
}

export async function getConsultationHistory() {
  const role = getAuthRole()
  let token = null
  if (role === "doctor") {
    token = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
  } else if (role === "asha") {
    token = getAshaAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "asha" ? getAuthToken() : null)
  } else if (role === "patient") {
    token = getPatientAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "patient" ? getAuthToken() : null)
  } else {
    token = getAuthToken()
  }
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  return await apiFetch("/consultations/history", { headers })
}

export async function getPatientActiveVideoRequest() {
  const patientToken = getPatientAuthToken()
  const headers = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
  }
  if (patientToken) {
    headers["Authorization"] = `Bearer ${patientToken}`
  }
  return await apiFetch(`/consultations/active-request?_t=${Date.now()}`, {
    headers,
    cache: "no-store",
  })
}

export async function getDoctorVideoRequests() {
  const docToken = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
  const headers = docToken ? { Authorization: `Bearer ${docToken}` } : {}
  return await apiFetch("/doctor/video-requests", { headers })
}

export async function endConsultationCall(consultationId) {
  const role = getAuthRole()
  let token = null
  if (role === "doctor") {
    token = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
  } else if (role === "patient") {
    token = getPatientAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "patient" ? getAuthToken() : null)
  } else if (role === "asha") {
    token = getAshaAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "asha" ? getAuthToken() : null)
  } else {
    token = getAuthToken()
  }
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  return await apiFetch(`/consultations/${consultationId}/end-call`, {
    method: "POST",
    headers,
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
  const docToken = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
  const headers = docToken ? { Authorization: `Bearer ${docToken}` } : {}
  return await apiFetch("/doctor/notifications", { headers })
}

export async function getAshaNotifications() {
  return await apiFetch("/asha/notifications")
}

export async function markAshaNotificationRead(notificationId) {
  return await apiFetch(`/asha/notifications/${notificationId}/read`, {
    method: "PATCH",
  })
}

export async function markAllAshaNotificationsRead() {
  return await apiFetch("/asha/notifications/read-all", {
    method: "PATCH",
  })
}

export async function markDoctorNotificationRead(notificationId) {
  const docToken = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
  const headers = docToken ? { Authorization: `Bearer ${docToken}` } : {}
  return await apiFetch(`/doctor/notifications/${notificationId}/read`, {
    method: "PATCH",
    headers,
  })
}

export async function markAllDoctorNotificationsRead() {
  const docToken = getDoctorAuthToken() || (checkTokenExpiry(getAuthToken()).payload?.role === "doctor" ? getAuthToken() : null)
  const headers = docToken ? { Authorization: `Bearer ${docToken}` } : {}
  return await apiFetch("/doctor/notifications/read-all", {
    method: "PATCH",
    headers,
  })
}

export async function getPatientNotifications() {
  return await apiFetch("/patient/notifications")
}

export async function getNotifications(role = null) {
  const currentRole = role || getAuthRole()
  if (currentRole === "asha") {
    return await getAshaNotifications()
  }
  if (currentRole === "doctor") {
    return await getDoctorNotifications()
  }
  if (currentRole === "patient") {
    return await getPatientNotifications()
  }
  // Try role-based detection fallback
  try {
    return await apiFetch("/asha/notifications")
  } catch {
    try {
      return await apiFetch("/doctor/notifications")
    } catch {
      return await apiFetch("/patient/notifications")
    }
  }
}

export async function markNotificationRead(notificationId, role = null) {
  const currentRole = role || getAuthRole()
  if (currentRole === "asha") {
    return await markAshaNotificationRead(notificationId)
  }
  if (currentRole === "doctor") {
    return await markDoctorNotificationRead(notificationId)
  }
  return await apiFetch(`/patient/notifications/${notificationId}/read`, {
    method: "PATCH",
  })
}

/* =========================================================================
   LoRa Emergency Response API Methods (Software Simulation)
   ========================================================================= */

/**
 * Trigger an Emergency SOS alert for the currently authenticated patient.
 * Calls POST /api/emergency/sos
 *
 * @param {Object} [emergencyData={}]
 * @returns {Promise<Object>} EmergencyAlertResponse
 */
export async function sendEmergencySOS(emergencyData = {}) {
  const patientUser = getPatientAuthUser()
  const payload = {
    patient_id: emergencyData.patient_id || emergencyData.patientId || patientUser?.patient_id || "P-4559",
    patient_name: emergencyData.patient_name || emergencyData.patientName || (patientUser && !patientUser.doctor_id && !patientUser.worker_id ? patientUser.full_name || patientUser.name : "Shreya") || "Shreya",
    village: emergencyData.village || patientUser?.village || "Chandapur",
    emergency_type: emergencyData.emergency_type || emergencyData.emergencyType || "general_sos",
    emergency_notes: emergencyData.emergency_notes || emergencyData.emergencyNotes || null,
    gps_coordinates: emergencyData.gps_coordinates || emergencyData.gpsCoordinates || null,
    simulated_telemetry: emergencyData.simulated_telemetry || emergencyData.simulatedTelemetry || null,
    offline_id: emergencyData.offline_id || emergencyData.offlineId || null,
  }

  const headers = { ...(emergencyData.headers || {}) }
  const token = emergencyData.token || getPatientAuthToken() || getAuthToken()
  if (!headers["Authorization"] && token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  return await apiFetch("/emergency/sos", {
    method: "POST",
    headers,
    body: payload,
  })
}

/**
 * Forward a simulated LoRa RF packet to the village gateway ingest endpoint.
 * Calls POST /api/lora/gateway/packet
 *
 * @param {Object} packetPayload - SimulatedLoRaPacket schema matching payload
 * @returns {Promise<Object>} GatewayACKResponse
 */
export async function sendLoRaGatewayPacket(packetPayload) {
  return await apiFetch("/lora/gateway/packet", {
    method: "POST",
    body: packetPayload,
  })
}

/**
 * Retrieve active (unresolved) emergency alerts filtered by authenticated role.
 * Calls GET /api/emergency/alerts/active
 *
 * @returns {Promise<Array>} List of EmergencyAlertResponse objects
 */
export async function getActiveEmergencyAlerts() {
  return await apiFetch("/emergency/alerts/active")
}

/**
 * Update the emergency workflow progression status.
 * Calls PATCH /api/emergency/alerts/{alert_id}/status
 *
 * @param {string} alertId
 * @param {Object} updateData - Status update payload (status, asha_status, phc_status, ambulance_status, notes)
 * @returns {Promise<Object>} Updated EmergencyAlertResponse
 */
export async function updateEmergencyAlertStatus(alertId, updateData) {
  return await apiFetch(`/emergency/alerts/${alertId}/status`, {
    method: "PATCH",
    body: updateData,
  })
}

/* =========================================================================
   Patient-to-ASHA 2-Way Audio Calling API Methods (Part 2)
   ========================================================================= */

/**
 * Retrieve list of active ASHA workers available for audio calling.
 * Calls GET /api/asha-calls/workers
 *
 * @returns {Promise<Array>} List of ASHA worker objects
 */
export async function getAshaCallWorkersList() {
  const patientToken = getPatientAuthToken() || getAuthToken()
  const headers = {}
  if (patientToken) {
    headers["Authorization"] = `Bearer ${patientToken}`
  }
  return await apiFetch("/asha-calls/workers", { headers })
}

/**
 * Patient requests a 2-way audio call with a specific ASHA worker.
 * Calls POST /api/asha-calls/request
 *
 * @param {Object} data - { target_worker_id: string, reason?: string }
 * @returns {Promise<Object>} AshaCallResponse
 */
export async function requestAshaAudioCall({ target_worker_id, reason = "Audio consultation" }) {
  const patientToken = getPatientAuthToken() || getAuthToken()
  const headers = {}
  if (patientToken) {
    headers["Authorization"] = `Bearer ${patientToken}`
  }
  return await apiFetch("/asha-calls/request", {
    method: "POST",
    headers,
    body: { target_worker_id, reason },
  })
}

/**
 * Poll the authenticated patient's current pending or active audio call.
 * Calls GET /api/asha-calls/active-patient
 *
 * @returns {Promise<Object|null>} AshaCallResponse or null
 */
export async function getPatientActiveAshaCall() {
  const patientToken = getPatientAuthToken() || getAuthToken()
  const headers = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
  }
  if (patientToken) {
    headers["Authorization"] = `Bearer ${patientToken}`
  }
  return await apiFetch(`/asha-calls/active-patient?_t=${Date.now()}`, {
    headers,
    cache: "no-store",
  })
}

/**
 * Poll the authenticated ASHA worker's incoming or active audio call.
 * Calls GET /api/asha-calls/active-asha
 *
 * @returns {Promise<Object|null>} AshaCallResponse or null
 */
export async function getAshaActiveCall() {
  const ashaToken = getAshaAuthToken() || getAuthToken()
  const headers = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
  }
  if (ashaToken) {
    headers["Authorization"] = `Bearer ${ashaToken}`
  }
  return await apiFetch(`/asha-calls/active-asha?_t=${Date.now()}`, {
    headers,
    cache: "no-store",
  })
}

/**
 * ASHA worker accepts or declines an incoming audio call request.
 * Calls POST /api/asha-calls/{call_id}/decision
 *
 * @param {string} callId
 * @param {Object} decision - { action: "accept" | "reject", reason?: string }
 * @returns {Promise<Object>} AshaCallResponse
 */
export async function decideAshaCall(callId, { action, reason = null }) {
  const ashaToken = getAshaAuthToken() || getAuthToken()
  const headers = {}
  if (ashaToken) {
    headers["Authorization"] = `Bearer ${ashaToken}`
  }
  return await apiFetch(`/asha-calls/${callId}/decision`, {
    method: "POST",
    headers,
    body: { action, reason },
  })
}

/**
 * Initiating patient cancels an audio call before ASHA answers.
 * Calls POST /api/asha-calls/{call_id}/cancel
 *
 * @param {string} callId
 * @returns {Promise<Object>} AshaCallResponse
 */
export async function cancelAshaCall(callId) {
  const patientToken = getPatientAuthToken() || getAuthToken()
  const headers = {}
  if (patientToken) {
    headers["Authorization"] = `Bearer ${patientToken}`
  }
  return await apiFetch(`/asha-calls/${callId}/cancel`, {
    method: "POST",
    headers,
  })
}

/**
 * Either participant terminates an ongoing audio call.
 * Calls POST /api/asha-calls/{call_id}/end
 *
 * @param {string} callId
 * @param {boolean} [isAsha=false] - Whether caller is the ASHA worker
 * @returns {Promise<Object>} AshaCallResponse
 */
export async function endAshaCall(callId, isAsha = false) {
  const token = isAsha
    ? (getAshaAuthToken() || getAuthToken())
    : (getPatientAuthToken() || getAuthToken())
  const headers = {}
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }
  return await apiFetch(`/asha-calls/${callId}/end`, {
    method: "POST",
    headers,
  })
}

/**
 * Fetch status and session details of a specific audio call by ID.
 * Calls GET /api/asha-calls/{call_id}
 *
 * @param {string} callId
 * @param {boolean} [isAsha=false]
 * @returns {Promise<Object>} AshaCallResponse
 */
export async function getAshaCallDetails(callId, isAsha = false) {
  const token = isAsha
    ? (getAshaAuthToken() || getAuthToken())
    : (getPatientAuthToken() || getAuthToken())
  const headers = {}
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }
  return await apiFetch(`/asha-calls/${callId}`, {
    headers,
  })
}


