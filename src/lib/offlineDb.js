/**
 * AyushLink — Client-Side Offline Database & Auto-Sync Engine
 * Built on native browser IndexedDB for structured persistence of offline
 * patient records, symptom submissions, vitals updates, and consultation requests.
 */

import { syncBatch, getAuthToken, getPatientAuthToken, getAshaAuthToken, sendEmergencySOS } from "./api.js"

const DB_NAME = "ayushlink_offline_v2"
const DB_VERSION = 1
const STORE_PENDING = "pending_sync"

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB is not supported in this environment."))
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        const store = db.createObjectStore(STORE_PENDING, { keyPath: "client_id" })
        store.createIndex("status", "status", { unique: false })
        store.createIndex("created_at", "created_at", { unique: false })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function generateClientId(prefix = "Q") {
  const ts = Date.now()
  const rand = Math.floor(Math.random() * 10000)
  return `${prefix}-${ts}-${rand}`
}

/**
 * Persist an offline operation to the pending sync queue in IndexedDB.
 */
export async function saveOfflineItem({ type, payload, client_id, client_created_at }) {
  const id = client_id || generateClientId(`Q-${type.toUpperCase().slice(0, 3)}`)
  const createdAt = client_created_at || new Date().toISOString()

  const record = {
    client_id: id,
    type,
    payload,
    client_created_at: createdAt,
    created_at: Date.now(),
    status: "pending",
  }

  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PENDING, "readwrite")
      tx.objectStore(STORE_PENDING).put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    // Notify app of new pending item
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ayushlink:pending_updated"))
    }
    // If network appears online, trigger auto sync
    if (typeof navigator !== "undefined" && navigator.onLine) {
      triggerAutoSync().catch(() => {})
    }
    return record
  } catch (err) {
    console.warn("Failed to persist offline item in IndexedDB:", err)
    return record
  }
}

/**
 * Retrieve all pending sync items from IndexedDB.
 */
export async function getPendingItems() {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PENDING, "readonly")
      const req = tx.objectStore(STORE_PENDING).getAll()
      req.onsuccess = () => {
        const items = req.result || []
        resolve(items.filter((item) => item.status === "pending"))
      }
      req.onerror = () => reject(tx.error)
    })
  } catch {
    return []
  }
}

/**
 * Mark item as synced in IndexedDB.
 */
export async function markItemSynced(clientId, serverResult = {}) {
  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PENDING, "readwrite")
      const store = tx.objectStore(STORE_PENDING)
      const getReq = store.get(clientId)
      getReq.onsuccess = () => {
        const item = getReq.result
        if (item) {
          item.status = "synced"
          item.synced_at = new Date().toISOString()
          item.server_result = serverResult
          store.put(item)
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn("Failed to mark item synced in IndexedDB:", err)
  }
}

/**
 * Remove an item from the offline queue in IndexedDB.
 */
export async function deleteOfflineItem(clientId) {
  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PENDING, "readwrite")
      tx.objectStore(STORE_PENDING).delete(clientId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ayushlink:pending_updated"))
    }
  } catch (err) {
    console.warn("Failed to delete offline item in IndexedDB:", err)
  }
}

/**
 * Synchronize all pending items in the offline queue with the backend.
 * Uses dedicated endpoints where applicable (e.g. POST /api/emergency/sos)
 * and falls back to batch sync for standard offline records.
 */
export async function syncPendingQueue() {
  const token = getAuthToken() || getPatientAuthToken() || getAshaAuthToken()
  if (!token) return { total_items: 0, synced_count: 0 }

  const pending = await getPendingItems()
  if (!pending || pending.length === 0) {
    return { total_items: 0, synced_count: 0 }
  }

  const sosItems = pending.filter((item) => item.type === "emergency_sos")
  const otherItems = pending.filter((item) => item.type !== "emergency_sos")

  let syncedCount = 0
  const results = []

  // 1. Process emergency SOS items using the existing backend SOS endpoint (/api/emergency/sos)
  for (const item of sosItems) {
    try {
      const payload = {
        ...(item.payload || {}),
        offline_id: item.client_id,
      }
      const res = await sendEmergencySOS(payload)
      if (res && (res.alert_id || res.id)) {
        await markItemSynced(item.client_id, res)
        syncedCount++
        results.push({
          client_id: item.client_id,
          type: item.type,
          status: "synced",
          server_id: res.alert_id || res.id,
          message: "Emergency SOS synchronized and dispatched successfully.",
        })
      }
    } catch (err) {
      console.warn(`[offlineDb] Failed to synchronize emergency SOS ${item.client_id}:`, err)
      // Do not mark synced; preserve in pending queue for automatic retry
    }
  }

  // 2. Process other records via batch sync endpoint (/api/sync/batch)
  if (otherItems.length > 0) {
    const batchPayload = {
      batch_id: `BATCH-${Date.now()}`,
      items: otherItems.map((item) => ({
        client_id: item.client_id,
        type: item.type,
        client_created_at: item.client_created_at,
        payload: item.payload,
      })),
    }

    try {
      const syncRes = await syncBatch(batchPayload)
      if (syncRes && Array.isArray(syncRes.results)) {
        for (const res of syncRes.results) {
          if (res.status === "synced" || res.status === "already_synced") {
            await markItemSynced(res.client_id, res)
            syncedCount++
          }
          results.push(res)
        }
      }
    } catch (err) {
      console.warn("[offlineDb] Background batch sync failed:", err)
      if (sosItems.length === 0) {
        throw err
      }
    }
  }

  const combinedRes = {
    batch_id: `SYNC-${Date.now()}`,
    total_items: pending.length,
    synced_count: syncedCount,
    results,
  }

  if (syncedCount > 0 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ayushlink:sync_complete", { detail: combinedRes }))
    window.dispatchEvent(new CustomEvent("ayushlink:pending_updated"))
  }

  return combinedRes
}

let syncRetryTimer = null
let isSyncing = false

/**
 * Automatically retry synchronization when connectivity returns and the backend becomes reachable.
 */
export async function triggerAutoSync() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return
  }
  if (isSyncing) return
  isSyncing = true

  try {
    const pending = await getPendingItems()
    if (!pending || pending.length === 0) {
      if (syncRetryTimer) {
        clearInterval(syncRetryTimer)
        syncRetryTimer = null
      }
      return
    }

    await syncPendingQueue()

    const remaining = await getPendingItems()
    if (remaining.length === 0) {
      if (syncRetryTimer) {
        clearInterval(syncRetryTimer)
        syncRetryTimer = null
      }
    } else if (!syncRetryTimer && typeof navigator !== "undefined" && navigator.onLine) {
      syncRetryTimer = setInterval(() => {
        triggerAutoSync().catch(() => {})
      }, 3000)
    }
  } catch (err) {
    if (!syncRetryTimer && typeof navigator !== "undefined" && navigator.onLine) {
      syncRetryTimer = setInterval(() => {
        triggerAutoSync().catch(() => {})
      }, 3000)
    }
  } finally {
    isSyncing = false
  }
}

// Automatically trigger sync when network returns online or window gains focus
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    triggerAutoSync().catch(() => {})
  })
  window.addEventListener("focus", () => {
    triggerAutoSync().catch(() => {})
  })
}
