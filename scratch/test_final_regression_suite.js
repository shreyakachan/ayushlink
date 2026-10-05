// Full Regression Verification Test Suite
import {
  loginPatient,
  loginAsha,
  loginDoctor,
  getAuthUser,
  getAuthToken,
  getAuthRole,
  clearAuthSession,
  getPatientsList,
  getDoctorCases,
} from "../src/lib/api.js"

import {
  saveOfflineItem,
  getPendingItems,
  syncPendingQueue,
} from "../src/lib/offlineDb.js"

// Polyfills
const storage = new Map()
globalThis.localStorage = {
  getItem: (k) => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
}

// In-memory IndexedDB mock
class InMemoryStore {
  constructor() { this.data = new Map() }
  put(item) { this.data.set(item.client_id, { ...item }) }
  get(key) { const res = this.data.get(key); return { result: res ? { ...res } : undefined, onsuccess: null, onerror: null } }
  getAll() { const res = Array.from(this.data.values()).map((v) => ({ ...v })); return { result: res, onsuccess: null, onerror: null } }
  delete(key) { this.data.delete(key) }
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
            get: (key) => { const req = store.get(key); setTimeout(() => req.onsuccess && req.onsuccess(), 0); return req },
            getAll: () => { const req = store.getAll(); setTimeout(() => req.onsuccess && req.onsuccess(), 0); return req },
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
globalThis.window = { dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {} }
globalThis.CustomEvent = class CustomEvent { constructor(type, opt = {}) { this.type = type; this.detail = opt.detail } }

if (typeof globalThis.navigator !== "undefined") {
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, writable: true, configurable: true })
} else {
  globalThis.navigator = { onLine: true }
}

async function runRegression() {
  console.log("==================================================")
  console.log("     FINAL COMPREHENSIVE REGRESSION SUITE        ")
  console.log("==================================================")

  // 1. DATA CLEANUP VERIFICATION
  console.log("\n[CHECK 1] DATA CLEANUP VERIFICATION IN MONGODB")
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, writable: true, configurable: true })
  const ashaLogin = await loginAsha("9823088881", "AshaPassword123")
  const patientsList = await getPatientsList()
  const pNames = patientsList.map((p) => p.full_name)
  const pIds = patientsList.map((p) => p.patient_id)
  console.log("1. Live Patient list:", pNames, pIds)

  const noArjun = !pNames.some((n) => n.includes("Arjun Shinde")) && !pIds.includes("P-4099")
  const noKavita = !pNames.some((n) => n.includes("Kavita Patil")) && !pIds.includes("P-2430")
  const noRadha = !pNames.some((n) => n.includes("Radha Sharma")) && !pIds.includes("P-5747")
  const hasShreya = pNames.some((n) => n.toLowerCase().includes("shreya")) || pIds.includes("P-4559")

  console.log(`2. Arjun Shinde (P-4099) removed: ${noArjun}`)
  console.log(`3. Kavita Patil (P-2430) removed: ${noKavita}`)
  console.log(`4. Radha Sharma (P-5747) removed: ${noRadha}`)
  console.log(`5. Legitimate patient Shreya (P-4559) preserved: ${hasShreya}`)

  const check1Pass = noArjun && noKavita && noRadha && hasShreya
  console.log(`>> CHECK 1 RESULT: ${check1Pass ? "PASS" : "FAIL"}`)

  // 2. PATIENT AUTH & OFFLINE RESTORATION
  console.log("\n[CHECK 2] PATIENT OFFLINE AUTH & RESTORATION")
  const pOnline = await loginPatient("9324998108", "123456")
  console.log(`1. Patient online login: ${pOnline.patient.full_name}`)
  
  // Reopen offline
  clearAuthSession()
  Object.defineProperty(globalThis.navigator, "onLine", { value: false, writable: true, configurable: true })
  const pOffline = await loginPatient("9324998108", "123456")
  console.log(`2. Patient offline login restored: ${pOffline.is_offline}, Name: ${pOffline.patient.full_name}`)
  const check2Pass = pOffline.is_offline === true && pOffline.patient.full_name.toLowerCase().includes("shreya") && getAuthRole() === "patient"
  console.log(`>> CHECK 2 RESULT: ${check2Pass ? "PASS" : "FAIL"}`)

  // 3. OFFLINE SYMPTOM & PENDING QUEUE
  console.log("\n[CHECK 3] OFFLINE SYMPTOM CREATION & PENDING SYNC")
  const symClientId = `SYM-OFFLINE-${Date.now()}`
  const symRecord = await saveOfflineItem({
    type: "symptom_report",
    client_id: symClientId,
    client_created_at: new Date().toISOString(),
    payload: {
      patient_id: pOffline.patient.patient_id,
      patient_name: pOffline.patient.full_name,
      village: pOffline.patient.village,
      symptoms: ["Mild sore throat"],
      description: "Mild sore throat tested offline",
      severity: "mild",
      duration: "today",
      offline_id: symClientId,
    },
  })
  const pendingAfterCreate = await getPendingItems()
  console.log(`1. Saved offline symptom status: '${symRecord.status}'`)
  console.log(`2. Pending items in IndexedDB: ${pendingAfterCreate.length}`)
  const check3Pass = symRecord.status === "pending" && pendingAfterCreate.length === 1
  console.log(`>> CHECK 3 RESULT: ${check3Pass ? "PASS" : "FAIL"}`)

  // 4. RECONNECT & AUTO-SYNC
  console.log("\n[CHECK 4] AUTO-SYNC & PENDING QUEUE CLEARANCE")
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, writable: true, configurable: true })
  const syncRes = await syncPendingQueue()
  console.log(`1. Batch sync response: synced_count=${syncRes.synced_count}`)
  const pendingAfterSync = await getPendingItems()
  console.log(`2. Pending items after sync: ${pendingAfterSync.length}`)
  const check4Pass = syncRes.synced_count === 1 && pendingAfterSync.length === 0
  console.log(`>> CHECK 4 RESULT: ${check4Pass ? "PASS" : "FAIL"}`)

  // 5. DOCTOR OFFLINE AUTH
  console.log("\n[CHECK 5] DOCTOR OFFLINE AUTH & CASES")
  const docOnline = await loginDoctor("9823000001", "DoctorSecurePass123")
  console.log(`1. Doctor online login: ${docOnline.doctor.full_name}`)
  clearAuthSession()
  Object.defineProperty(globalThis.navigator, "onLine", { value: false, writable: true, configurable: true })
  const docOffline = await loginDoctor("9823000001", "DoctorSecurePass123")
  console.log(`2. Doctor offline restore: ${docOffline.is_offline}, Name: ${docOffline.doctor.full_name}`)
  const check5Pass = docOffline.is_offline === true && docOffline.doctor.full_name.includes("Arvind") && getAuthRole() === "doctor"
  console.log(`>> CHECK 5 RESULT: ${check5Pass ? "PASS" : "FAIL"}`)

  console.log("\n==================================================")
  const allPassed = check1Pass && check2Pass && check3Pass && check4Pass && check5Pass
  console.log(`ALL 5 REGRESSION CHECKS: ${allPassed ? "100% PASSED" : "FAILED"}`)
  console.log("==================================================")
}

runRegression().catch((e) => {
  console.error("FATAL ERROR:", e)
  process.exit(1)
})
