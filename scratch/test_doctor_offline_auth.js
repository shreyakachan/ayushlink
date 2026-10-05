// Comprehensive Doctor + Patient + ASHA Offline Auth Test
import {
  loginDoctor,
  loginPatient,
  loginAsha,
  getAuthUser,
  getAuthToken,
  getAuthRole,
  clearAuthSession,
} from "../src/lib/api.js"

// Browser polyfills
const storage = new Map()
globalThis.localStorage = {
  getItem: (k) => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
}

if (typeof globalThis.navigator !== "undefined") {
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, writable: true, configurable: true })
} else {
  globalThis.navigator = { onLine: true }
}

async function runDoctorTests() {
  console.log("==================================================")
  console.log("   DOCTOR OFFLINE AUTHENTICATION TEST SUITE       ")
  console.log("==================================================")

  // ---------------------------------------------------------
  // TEST 1 — ONLINE LOGIN AS DOCTOR
  // ---------------------------------------------------------
  console.log("\n[TEST 1] DOCTOR ONLINE LOGIN")
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, writable: true, configurable: true })
  
  const doctorPhone = "9823000001"
  const doctorPass = "DoctorSecurePass123"

  const onlineDoc = await loginDoctor(doctorPhone, doctorPass)
  console.log("1. Doctor online login result:", {
    doctor_id: onlineDoc.doctor?.doctor_id,
    full_name: onlineDoc.doctor?.full_name,
    specialization: onlineDoc.doctor?.specialization,
  })
  console.log(`2. Token stored: ${Boolean(getAuthToken())}, User stored: ${Boolean(getAuthUser())}, Role: ${getAuthRole()}`)

  const cachedAccountsRaw = localStorage.getItem("ayushlink_cached_accounts")
  const cachedAccounts = cachedAccountsRaw ? JSON.parse(cachedAccountsRaw) : {}
  const hasDoctorCache = Boolean(cachedAccounts[`doctor_${doctorPhone}`])
  console.log(`3. Doctor cached in ayushlink_cached_accounts: ${hasDoctorCache}`)

  const test1Passed = Boolean(onlineDoc.access_token) && getAuthRole() === "doctor" && hasDoctorCache
  console.log(`>> TEST 1 RESULT: ${test1Passed ? "PASS" : "FAIL"}`)

  // ---------------------------------------------------------
  // TEST 2 — REOPEN OFFLINE AND RESTORE DOCTOR SESSION
  // ---------------------------------------------------------
  console.log("\n[TEST 2] CLOSE APP & REOPEN OFFLINE (RESTORE DOCTOR)")
  // Clear active in-memory session (simulate app close/reopen)
  clearAuthSession()
  Object.defineProperty(globalThis.navigator, "onLine", { value: false, writable: true, configurable: true })
  console.log("1. Cleared active session & set navigator.onLine = false")

  const offlineDoc = await loginDoctor(doctorPhone, doctorPass)
  console.log("2. Doctor offline login result:", {
    doctor_id: offlineDoc.doctor?.doctor_id,
    full_name: offlineDoc.doctor?.full_name,
    is_offline: offlineDoc.is_offline,
    message: offlineDoc.message,
  })
  console.log(`3. Restored Active Role: ${getAuthRole()}`)
  console.log(`4. Restored Active User: ${getAuthUser()?.full_name} (${getAuthUser()?.doctor_id})`)

  const test2Passed =
    offlineDoc.is_offline === true &&
    offlineDoc.doctor?.full_name === onlineDoc.doctor.full_name &&
    getAuthRole() === "doctor" &&
    Boolean(getAuthToken())

  console.log(`>> TEST 2 RESULT: ${test2Passed ? "PASS" : "FAIL"}`)

  // ---------------------------------------------------------
  // TEST 3 — OFFLINE LOGIN FOR UNKNOWN DOCTOR (FIRST TIME)
  // ---------------------------------------------------------
  console.log("\n[TEST 3] FIRST TIME DOCTOR LOGIN WHILE OFFLINE")
  let test3Passed = false
  try {
    await loginDoctor("9999900000", "RandomPassword")
    console.log(">> TEST 3 ERROR: Should have thrown error for un-cached doctor account!")
  } catch (err) {
    console.log(`1. Caught expected error: '${err.message}'`)
    if (err.message.includes("Internet connection is required")) {
      test3Passed = true
    }
  }
  console.log(`>> TEST 3 RESULT: ${test3Passed ? "PASS" : "FAIL"}`)

  // ---------------------------------------------------------
  // TEST 4 — CONFIRM PATIENT & ASHA OFFLINE AUTH STILL WORK
  // ---------------------------------------------------------
  console.log("\n[TEST 4] PATIENT & ASHA OFFLINE AUTH VERIFICATION")
  // 4a. Authenticate Patient Online
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, writable: true, configurable: true })
  const pOnline = await loginPatient("9324998108", "123456")
  console.log(`1. Patient online login: ${pOnline.patient.full_name}`)

  // 4b. Authenticate ASHA Online
  const aOnline = await loginAsha("9823088881", "AshaPassword123")
  console.log(`2. ASHA online login: ${aOnline.asha_worker.full_name}`)

  // 4c. Switch to Offline
  Object.defineProperty(globalThis.navigator, "onLine", { value: false, writable: true, configurable: true })

  // 4d. Patient Offline Restore
  const pOffline = await loginPatient("9324998108", "123456")
  const pPass = pOffline.is_offline === true && getAuthRole() === "patient"
  console.log(`3. Patient offline restore: ${pPass ? "PASS" : "FAIL"} (${pOffline.patient.full_name})`)

  // 4e. ASHA Offline Restore
  const aOffline = await loginAsha("9823088881", "AshaPassword123")
  const aPass = aOffline.is_offline === true && getAuthRole() === "asha"
  console.log(`4. ASHA offline restore: ${aPass ? "PASS" : "FAIL"} (${aOffline.asha_worker.full_name})`)

  const test4Passed = pPass && aPass
  console.log(`>> TEST 4 RESULT: ${test4Passed ? "PASS" : "FAIL"}`)

  console.log("\n==================================================")
  console.log(`ALL TESTS: ${test1Passed && test2Passed && test3Passed && test4Passed ? "ALL PASSED (100%)" : "FAILURES DETECTED"}`)
  console.log("==================================================")
}

runDoctorTests().catch((e) => {
  console.error("FATAL ERROR:", e)
  process.exit(1)
})
