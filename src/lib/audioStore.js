/**
 * IndexedDB storage for ASHA worker voice notes — raw audio recordings of a
 * patient's symptoms, captured in the field with no network connection.
 *
 * Audio Blobs are stored directly in IndexedDB (structured clone handles
 * Blobs natively in every modern browser), so nothing ever touches the
 * network and recordings survive app restarts / offline periods until the
 * worker is back online and can sync.
 */

const DB_NAME = "ayushlink-db"
const DB_VERSION = 1
const STORE = "voiceNotes"

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" })
        store.createIndex("createdAt", "createdAt", { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * Persists a recorded voice note.
 * @param {{ blob: Blob, mimeType: string, durationSeconds: number, language: string, symptomsSnapshot?: string }} note
 * @returns {Promise<object>} the stored record, including its generated id
 */
export async function saveVoiceNote(note) {
  const db = await openDB()
  const record = {
    id: generateId(),
    createdAt: Date.now(),
    language: note.language || "en",
    durationSeconds: note.durationSeconds || 0,
    mimeType: note.mimeType || "audio/webm",
    sizeBytes: note.blob?.size || 0,
    symptomsSnapshot: note.symptomsSnapshot || "",
    blob: note.blob,
    synced: false,
  }

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).add(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  db.close()
  return record
}

/** Returns all saved voice notes, most recent first. */
export async function listVoiceNotes() {
  const db = await openDB()
  const records = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly")
    const request = tx.objectStore(STORE).getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
  db.close()
  return records.sort((a, b) => b.createdAt - a.createdAt)
}

/** Deletes a saved voice note by id. */
export async function deleteVoiceNote(id) {
  const db = await openDB()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}
