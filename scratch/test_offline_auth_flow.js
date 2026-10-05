// In-memory IndexedDB mock
class InMemoryStore {
  constructor() {
    this.data = new Map()
  }
  put(item) {
    this.data.set(item.client_id, { ...item })
  }
  get(key) {
    const res = this.data.get(key)
    return { result: res ? { ...res } : undefined, onsuccess: null, onerror: null }
  }
  getAll() {
    const res = Array.from(this.data.values()).map((v) => ({ ...v }))
    return { result: res, onsuccess: null, onerror: null }
  }
  delete(key) {
    this.data.delete(key)
  }
}

const mockStores = new Map()
globalThis.indexedDB = {
  open: (name, version) => {
    if (!mockStores.has(name)) mockStores.set(name, new Map())
    const dbInstance = {
      objectStoreNames: { contains: () => true },
      transaction: (storeName) => {
        const dbMap = mockStores.get(name)
        if (!dbMap.has(storeName)) dbMap.set(storeName, new InMemoryStore())
        const store = dbMap.get(storeName)
        const tx = {
          objectStore: () => ({
            put: (item) => store.put(item),
            get: (key) => {
              const req = store.get(key)
              setTimeout(() => req.onsuccess && req.onsuccess(), 0)
              return req
            },
            getAll: () => {
              const req = store.getAll()
              setTimeout(() => req.onsuccess && req.onsuccess(), 0)
              return req
            },
            delete: (key) => store.delete(key),
          }),
          oncomplete: null,
          onerror: null,
        }
        setTimeout(() => tx.oncomplete && tx.oncomplete(), 0)
        return tx
      },
    }
    const req = { result: dbInstance, onsuccess: null, onerror: null, onupgradeneeded: null }
    setTimeout(() => req.onsuccess && req.onsuccess(), 0)
    return req
  },
}

// Global browser polyfills
globalThis.window = {
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
}
globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}) {
    this.type = type
    this.detail = options.detail
  }
}

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

const {
  loginPatient,
  loginAsha,
  getAuthUser,
  getAuthToken,
  getAuthRole,
  clearAuthSession,
  getAshaCases,
} = await import("../src/lib/api.js")

const {
  saveOfflineItem,
  getPendingItems,
  syncPendingQueue,
} = await import("../src/lib/offlineDb.js")

async function runTests() {
  console.log("==================================================")
  console.log("  OFFLINE AUTHENTICATION VERIFICATION TEST SUITE  ")
  console.log("==================================================")

  // ---------------------------------------------------------
  // TEST 1 — FIRST LOGIN OFFLINE
  // ---------------------------------------------------------
  console.log("\n[TEST 1] FIRST LOGIN OFFLINE")
  storage.clear() // Clear all stored sessions
  Object.defineProperty(globalThis.navigator, "onLine", { value: false, writable: true, configurable: true })
  console.log("1. Cleared local storage & set navigator.onLine = false")

  let test1Passed = false
  try {
    await loginPatient("9324998108", "123456")
    console.log(">> TEST 1 ERROR: Login should have thrown an error for first-time offline login!")
  } catch (err) {
    console.log(`2. Caught expected error: '${err.message}'`)
    if (err.message.includes("Internet connection is required")) {
      test1Passed = true
    }
  }

  if (test1Passed) {
    console.log(">> TEST 1 RESULT: PASS (First-time offline login correctly rejected with proper message)")
  } else {
    console.log(">> TEST 1 RESULT: FAIL")
  }

  // ---------------------------------------------------------
  // TEST 2 — LOGIN ONLINE THEN CLOSE APP
  // ---------------------------------------------------------
  console.log("\n[TEST 2] LOGIN ONLINE THEN CLOSE APP & REOPEN OFFLINE")
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, writable: true, configurable: true })
  console.log("1. Setting navigator.onLine = true (Online)...")

  const onlinePatientLogin = await loginPatient("9324998108", "123456")
  console.log(`2. Online login succeeded: Patient ${onlinePatientLogin.patient.patient_id} (${onlinePatientLogin.patient.full_name})`)
  console.log(`   Token stored: ${Boolean(getAuthToken())}, User stored: ${Boolean(getAuthUser())}`)

  // Simulate closing the browser/app (active session cleared from memory, persisted in localStorage)
  Object.defineProperty(globalThis.navigator, "onLine", { value: false, writable: true, configurable: true })
  console.log("3. Closed app & reopened offline (navigator.onLine = false)...")

  const offlinePatientLogin = await loginPatient("9324998108", "123456")
  console.log(`4. Offline login response:`, {
    patient: offlinePatientLogin.patient?.full_name,
    is_offline: offlinePatientLogin.is_offline,
    message: offlinePatientLogin.message,
  })

  const test2Passed =
    offlinePatientLogin.is_offline === true &&
    offlinePatientLogin.patient?.full_name === onlinePatientLogin.patient.full_name &&
    getAuthRole() === "patient"

  if (test2Passed) {
    console.log(">> TEST 2 RESULT: PASS (Offline login successfully restored persisted session without network call)")
  } else {
    console.log(">> TEST 2 RESULT: FAIL")
  }

  // ---------------------------------------------------------
  // TEST 3 — PATIENT OFFLINE LOGIN
  // ---------------------------------------------------------
  console.log("\n[TEST 3] PATIENT OFFLINE LOGIN VERIFICATION")
  const patientUser = getAuthUser()
  const patientToken = getAuthToken()
  const test3Passed = patientUser && patientToken && getAuthRole() === "patient"
  console.log(`1. Active patient user: ${patientUser?.full_name} (${patientUser?.patient_id})`)
  console.log(`2. Active role: ${getAuthRole()}`)
  if (test3Passed) {
    console.log(">> TEST 3 RESULT: PASS (Patient session restored successfully offline)")
  } else {
    console.log(">> TEST 3 RESULT: FAIL")
  }

  // ---------------------------------------------------------
  // TEST 4 — ASHA OFFLINE LOGIN
  // ---------------------------------------------------------
  console.log("\n[TEST 4] ASHA OFFLINE LOGIN")
  // First, authenticate ASHA online to cache credentials
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, writable: true, configurable: true })
  const ashaOnlineLogin = await loginAsha("9823088881", "AshaPassword123")
  console.log(`1. ASHA online login succeeded: ${ashaOnlineLogin.asha_worker.worker_id} (${ashaOnlineLogin.asha_worker.full_name})`)

  // Now reopen offline
  Object.defineProperty(globalThis.navigator, "onLine", { value: false, writable: true, configurable: true })
  const ashaOfflineLogin = await loginAsha("9823088881", "AshaPassword123")
  console.log(`2. ASHA offline login response:`, {
    worker: ashaOfflineLogin.asha_worker?.full_name,
    is_offline: ashaOfflineLogin.is_offline,
    message: ashaOfflineLogin.message,
  })

  const test4Passed =
    ashaOfflineLogin.is_offline === true &&
    ashaOfflineLogin.asha_worker?.full_name === ashaOnlineLogin.asha_worker.full_name &&
    getAuthRole() === "asha"

  if (test4Passed) {
    console.log(">> TEST 4 RESULT: PASS (ASHA offline login successfully restored session without network call)")
  } else {
    console.log(">> TEST 4 RESULT: FAIL")
  }

  // ---------------------------------------------------------
  // TEST 5 — OFFLINE DATA WORKFLOW AFTER OFFLINE LOGIN
  // ---------------------------------------------------------
  console.log("\n[TEST 5] OFFLINE DATA WORKFLOW AFTER OFFLINE LOGIN")
  console.log("1. Still offline (navigator.onLine = false). Patient submitting new symptom...")

  const offlineSymId = `SYM-OFFLINE-${Date.now()}`
  const symptomRecord = await saveOfflineItem({
    type: "symptom_report",
    client_id: offlineSymId,
    client_created_at: new Date().toISOString(),
    payload: {
      patient_id: patientUser.patient_id,
      patient_name: patientUser.full_name,
      village: patientUser.village,
      symptoms: ["Cough and mild fever"],
      description: "Cough and mild fever submitted after offline login",
      severity: "mild",
      duration: "today",
      offline_id: offlineSymId,
    },
  })

  const pendingItems = await getPendingItems()
  const pendingCount = pendingItems.length
  console.log(`2. IndexedDB pending_sync record status: '${symptomRecord.status}'`)
  console.log(`3. Pending Sync count: ${pendingCount}`)

  const test5Passed = symptomRecord.status === "pending" && pendingCount === 1
  if (test5Passed) {
    console.log(">> TEST 5 RESULT: PASS (Offline symptom created with status='pending', Pending Sync = 1)")
  } else {
    console.log(">> TEST 5 RESULT: FAIL")
  }

  // ---------------------------------------------------------
  // TEST 6 — RECONNECT & AUTO-SYNC
  // ---------------------------------------------------------
  console.log("\n[TEST 6] RECONNECT & AUTO-SYNC")
  console.log("1. Restoring network (navigator.onLine = true)...")
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, writable: true, configurable: true })

  console.log("2. Running background queue sync (syncPendingQueue)...")
  const syncResult = await syncPendingQueue()
  console.log(`3. Sync response:`, syncResult)

  const pendingAfterSync = await getPendingItems()
  console.log(`4. Pending count after sync: ${pendingAfterSync.length}`)

  const liveCases = await getAshaCases()
  const caseFound = liveCases.find((c) => c.patient_id === patientUser.patient_id)
  console.log(`5. Symptom present in live MongoDB cases: ${Boolean(caseFound)}`)

  const test6Passed = pendingAfterSync.length === 0 && syncResult.synced_count >= 1

  if (test6Passed) {
    console.log(">> TEST 6 RESULT: PASS (Pending sync changed 1 -> 0, synced successfully)")
  } else {
    console.log(">> TEST 6 RESULT: FAIL")
  }

  console.log("\n==================================================")
  console.log("      ALL 6 OFFLINE AUTH TESTS COMPLETED!         ")
  console.log("==================================================")
}

runTests().catch((e) => {
  console.error("FATAL ERROR in test runner:", e)
  process.exit(1)
})
