// In-memory IndexedDB implementation matching IDB interface for offlineDb.js
class InMemoryStore {
  constructor() {
    this.data = new Map()
  }
  put(item) {
    this.data.set(item.client_id, { ...item })
  }
  get(key) {
    const res = this.data.get(key)
    return {
      result: res ? { ...res } : undefined,
      onsuccess: null,
      onerror: null,
    }
  }
  getAll() {
    const res = Array.from(this.data.values()).map((v) => ({ ...v }))
    return {
      result: res,
      onsuccess: null,
      onerror: null,
    }
  }
  delete(key) {
    this.data.delete(key)
  }
}

const mockStores = new Map()

globalThis.indexedDB = {
  open: (name, version) => {
    if (!mockStores.has(name)) {
      mockStores.set(name, new Map())
    }
    const dbInstance = {
      objectStoreNames: {
        contains: (s) => true,
      },
      transaction: (storeName, mode) => {
        const dbMap = mockStores.get(name)
        if (!dbMap.has(storeName)) {
          dbMap.set(storeName, new InMemoryStore())
        }
        const store = dbMap.get(storeName)
        const tx = {
          objectStore: (s) => ({
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

    const req = {
      result: dbInstance,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    }
    setTimeout(() => req.onsuccess && req.onsuccess(), 0)
    return req
  },
}

// Set initial navigator.onLine
if (typeof globalThis.navigator !== "undefined") {
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, writable: true, configurable: true })
} else {
  globalThis.navigator = { onLine: true }
}

// Polyfill browser globals
globalThis.window = {
  dispatchEvent: (event) => {},
  addEventListener: () => {},
  removeEventListener: () => {},
}
globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}) {
    this.type = type
    this.detail = options.detail
  }
}

// Set up localStorage mock
const storage = new Map()
globalThis.localStorage = {
  getItem: (k) => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
}

// Import app modules
const { saveOfflineItem, getPendingItems, markItemSynced, syncPendingQueue } = await import("../src/lib/offlineDb.js")
const { loginPatient, loginAsha, getAshaCases, syncBatch } = await import("../src/lib/api.js")

async function run() {
  console.log("==================================================")
  console.log("   MANUAL E2E VERIFICATION TEST SUITE (1-5)       ")
  console.log("==================================================")

  // ---------------------------------------------------------
  // SETUP: Authenticate Patient & ASHA
  // ---------------------------------------------------------
  console.log("\n[SETUP] Authenticating Patient and ASHA against live backend (port 8000)...")
  const patLogin = await loginPatient("9324998108", "123456")
  const patientId = patLogin.patient.patient_id
  const patientToken = patLogin.access_token
  console.log(`[OK] Patient logged in: ${patientId} (${patLogin.patient.full_name})`)

  const ashaLogin = await loginAsha("9823088881", "AshaPassword123")
  const ashaWorkerId = ashaLogin.asha_worker.worker_id
  const ashaToken = ashaLogin.access_token
  console.log(`[OK] ASHA Worker logged in: ${ashaWorkerId} (${ashaLogin.asha_worker.full_name})`)

  // ---------------------------------------------------------
  // TEST 1 — OFFLINE PENDING
  // ---------------------------------------------------------
  console.log("\n[TEST 1] OFFLINE PENDING")
  console.log("1. Setting navigator.onLine = false (Simulating Offline Mode)...")
  Object.defineProperty(globalThis.navigator, "onLine", { value: false, writable: true, configurable: true })

  const offlineId = `SYM-TEST-${Date.now()}`
  const nowIso = new Date().toISOString()
  const symptomText = "Severe migraine headache and nausea for 3 hours"

  console.log(`2. Patient submitting offline symptom: '${symptomText}' (offline_id: ${offlineId})...`)
  const savedRecord = await saveOfflineItem({
    type: "symptom_report",
    client_id: offlineId,
    client_created_at: nowIso,
    payload: {
      patient_id: patientId,
      patient_name: patLogin.patient.full_name,
      village: patLogin.patient.village || "Chandapur",
      symptoms: ["Severe migraine headache", "nausea"],
      description: symptomText,
      severity: "moderate",
      duration: "today",
      offline_id: offlineId,
    },
  })

  const pendingItemsT1 = await getPendingItems()
  const pendingCountT1 = pendingItemsT1.length
  console.log(`3. Verified IndexedDB 'pending_sync' record status: '${savedRecord.status}'`)
  console.log(`4. ASHA Home 'Pending sync' counter calculation: ${pendingCountT1}`)

  if (pendingCountT1 === 1 && savedRecord.status === "pending") {
    console.log(">> TEST 1 RESULT: PASS (Pending Sync = 1, Status = 'pending')")
  } else {
    console.log(`>> TEST 1 RESULT: FAIL (Pending Sync = ${pendingCountT1}, Status = '${savedRecord.status}')`)
  }

  // ---------------------------------------------------------
  // TEST 2 — RELOAD WHILE OFFLINE
  // ---------------------------------------------------------
  console.log("\n[TEST 2] RELOAD WHILE OFFLINE")
  console.log("1. Still offline (navigator.onLine = false). Simulating ASHA Home reload/mount...")
  
  // Verify that syncPendingQueue() while offline is prevented
  const offlineSyncAttempt = await syncPendingQueue()
  console.log(`2. syncPendingQueue() while offline returned:`, offlineSyncAttempt)

  const pendingItemsT2 = await getPendingItems()
  const pendingCountT2 = pendingItemsT2.length
  const recordT2 = pendingItemsT2.find((i) => i.client_id === offlineId)

  console.log(`3. After reload, Pending sync count: ${pendingCountT2}`)
  console.log(`4. Record status in IndexedDB: '${recordT2?.status}'`)

  if (pendingCountT2 === 1 && recordT2?.status === "pending") {
    console.log(">> TEST 2 RESULT: PASS (Pending Sync = 1, Status = 'pending')")
  } else {
    console.log(`>> TEST 2 RESULT: FAIL (Pending Sync = ${pendingCountT2}, Status = '${recordT2?.status}')`)
  }

  // ---------------------------------------------------------
  // TEST 3 — RESTORE NETWORK & AUTO-SYNC
  // ---------------------------------------------------------
  console.log("\n[TEST 3] RESTORE NETWORK & AUTO-SYNC")
  console.log("1. Setting navigator.onLine = true (Network Restored)...")
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, writable: true, configurable: true })

  console.log("2. Triggering automatic background sync (syncPendingQueue)...")
  const syncResult = await syncPendingQueue()
  console.log(`3. Backend /api/sync/batch response:`, syncResult)

  const pendingItemsT3 = await getPendingItems()
  const pendingCountT3 = pendingItemsT3.length
  console.log(`4. After sync, ASHA Home 'Pending sync' count: ${pendingCountT3}`)

  // Verify symptom is visible in ASHA cases from MongoDB
  const liveCases = await getAshaCases()
  const patientCase = liveCases.find((c) => c.patient_id === patientId)
  const isSymptomInBackend = Boolean(patientCase && (patientCase.condition.includes("migraine") || patientCase.description.includes("migraine")))

  console.log(`5. Symptom visible on ASHA side from backend MongoDB: ${isSymptomInBackend} (Condition: '${patientCase?.condition}')`)

  if (pendingCountT3 === 0 && syncResult?.synced_count >= 1 && isSymptomInBackend) {
    console.log(">> TEST 3 RESULT: PASS (Pending Sync = 0, Backend Synced = True)")
  } else {
    console.log(`>> TEST 3 RESULT: FAIL (Pending Sync = ${pendingCountT3}, Synced = ${syncResult?.synced_count})`)
  }

  // ---------------------------------------------------------
  // TEST 4 — VERIFY NO DUPLICATE (IDEMPOTENCY)
  // ---------------------------------------------------------
  console.log("\n[TEST 4] VERIFY NO DUPLICATE & IDEMPOTENCY")
  console.log("1. Repeating batch sync with same offline record payload...")
  const duplicateBatchRes = await syncBatch({
    batch_id: "BATCH-DUPLICATE-CHECK",
    items: [
      {
        client_id: offlineId,
        type: "symptom_report",
        payload: {
          patient_id: patientId,
          symptoms: ["Severe migraine headache", "nausea"],
          description: symptomText,
          severity: "moderate",
        },
      },
    ],
  })

  console.log("2. Duplicate sync attempt result:", duplicateBatchRes)
  const firstItemResult = duplicateBatchRes.results?.[0]
  const isDeduplicated = firstItemResult?.status === "already_synced" && duplicateBatchRes.synced_count === 0

  if (isDeduplicated) {
    console.log(`>> TEST 4 RESULT: PASS (Status = 'already_synced', Synced Count = 0, No Duplicates)`)
  } else {
    console.log(`>> TEST 4 RESULT: FAIL (${JSON.stringify(duplicateBatchRes)})`)
  }

  // ---------------------------------------------------------
  // TEST 5 — FAILED SYNC HANDLING
  // ---------------------------------------------------------
  console.log("\n[TEST 5] FAILED SYNC HANDLING")
  const failOfflineId = `SYM-FAIL-TEST-${Date.now()}`
  console.log(`1. Creating pending offline symptom: ${failOfflineId}...`)
  
  await saveOfflineItem({
    type: "symptom_report",
    client_id: failOfflineId,
    client_created_at: new Date().toISOString(),
    payload: {
      patient_id: patientId,
      description: "Temporary offline test symptom",
    },
  })

  console.log("2. Simulating backend failure (invalid token / server 401 error)...")
  storage.set("ayushlink_token", "invalid_broken_token_500")
  
  let syncFailedAsExpected = false
  try {
    await syncPendingQueue()
  } catch (err) {
    syncFailedAsExpected = true
    console.log(`3. syncPendingQueue caught expected error: ${err.message}`)
  }

  // Restore token
  storage.set("ayushlink_token", ashaToken)

  const pendingItemsT5 = await getPendingItems()
  const recordT5 = pendingItemsT5.find((i) => i.client_id === failOfflineId)
  console.log(`4. Pending items count after sync failure: ${pendingItemsT5.length}`)
  console.log(`5. Record status in IndexedDB: '${recordT5?.status}'`)

  if (recordT5 && recordT5.status === "pending" && pendingItemsT5.length >= 1 && syncFailedAsExpected) {
    console.log(">> TEST 5 RESULT: PASS (Record preserved with status='pending', Pending Sync >= 1)")
  } else {
    console.log(">> TEST 5 RESULT: FAIL")
  }

  console.log("\n==================================================")
  console.log("            ALL 5 TESTS COMPLETED                 ")
  console.log("==================================================")
}

run().catch((e) => {
  console.error("FATAL ERROR in test runner:", e)
  process.exit(1)
})
