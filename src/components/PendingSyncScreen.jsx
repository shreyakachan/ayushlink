import { useState, useEffect, useCallback } from "react"
import { ashaT } from "../lib/ashaI18n.js"
import { syncBatch } from "../lib/api.js"
import { getPendingItems, syncPendingQueue, markItemSynced, deleteOfflineItem } from "../lib/offlineDb.js"

/**
 * AyushLink — Pending Sync
 * React + JavaScript + Tailwind CSS
 * Shows records saved offline that are waiting to sync to the central
 * server. Connects directly to native IndexedDB and FastAPI sync API.
 */

function itemToSyncPayload(item) {
  if (item.raw) {
    return {
      client_id: item.raw.client_id || item.id,
      type: item.raw.type,
      client_created_at: item.raw.client_created_at || new Date().toISOString(),
      payload: item.raw.payload || {},
    }
  }
  return {
    client_id: item.id,
    type: item.type || "symptom_report",
    client_created_at: item.client_created_at || new Date().toISOString(),
    payload: item.payload || {},
  }
}


const TYPE_META = {
  "New patient": { tone: "bg-sky-50 text-sky-600" },
  Prescription: { tone: "bg-blue-50 text-blue-600" },
  "Vitals update": { tone: "bg-emerald-50 text-emerald-600" },
  "AI assessment": { tone: "bg-indigo-50 text-indigo-600" },
  Inventory: { tone: "bg-amber-50 text-amber-600" },
}

/* ---------- Inline icons (matches app's existing icon style) ---------- */
function BackIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  )
}
function SyncIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
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
function CheckCircleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.2 2.2L16 9.8" />
    </svg>
  )
}
function TrashIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

export default function PendingSyncScreen({ lang = "en", onBack }) {
  const [queue, setQueue] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [syncingIds, setSyncingIds] = useState([])
  const [justSynced, setJustSynced] = useState(false)
  const t = ashaT(lang)

  const loadOfflineQueue = useCallback(async () => {
    try {
      const pending = await getPendingItems()
      if (Array.isArray(pending) && pending.length > 0) {
        const formatted = pending.map((item) => {
          const p = item.payload || {}
          return {
            id: item.client_id,
            type:
              item.type === "new_patient"
                ? "New patient"
                : item.type === "vitals_update"
                ? "Vitals update"
                : item.type === "consultation_request"
                ? "Prescription"
                : "AI assessment",
            label: p.full_name
              ? `${p.full_name} — ${p.village || "Chandapur"}`
              : p.description || p.reason || p.vitals_label || "Offline Record",
            time: "Pending sync",
            size: "0.8 KB",
            raw: item,
          }
        })
        setQueue(formatted)
      } else {
        setQueue([])
      }
    } catch {
      setQueue([])
    }
  }, [])

  useEffect(() => {
    loadOfflineQueue()
    window.addEventListener("ayushlink:pending_updated", loadOfflineQueue)
    return () => window.removeEventListener("ayushlink:pending_updated", loadOfflineQueue)
  }, [loadOfflineQueue])

  const syncAll = async () => {
    if (!queue.length || syncing) return
    setSyncing(true)
    setJustSynced(false)
    try {
      let syncRes
      if (queue.some((i) => i.raw)) {
        syncRes = await syncPendingQueue()
      } else {
        syncRes = await syncBatch(queue.map(itemToSyncPayload))
        if (syncRes && Array.isArray(syncRes.results)) {
          for (const res of syncRes.results) {
            if (res.status === "synced" || res.status === "already_synced") {
              await markItemSynced(res.client_id, res)
            }
          }
          window.dispatchEvent(new CustomEvent("ayushlink:sync_complete", { detail: syncRes }))
          window.dispatchEvent(new CustomEvent("ayushlink:pending_updated"))
        }
      }

      await loadOfflineQueue()

      if (syncRes && (syncRes.synced_count > 0 || syncRes.already_synced_count > 0)) {
        setJustSynced(true)
        setTimeout(() => setJustSynced(false), 3500)
      }
    } catch (e) {
      console.error("Sync failed", e)
    } finally {
      setSyncing(false)
    }
  }

  const syncOne = async (id) => {
    if (syncingIds.includes(id)) return
    setSyncingIds((ids) => [...ids, id])
    try {
      const item = queue.find((i) => i.id === id)
      if (item) {
        const payload = itemToSyncPayload(item)
        const syncRes = await syncBatch([payload])
        if (syncRes && Array.isArray(syncRes.results)) {
          const res = syncRes.results.find((r) => r.client_id === id) || syncRes.results[0]
          if (res && (res.status === "synced" || res.status === "already_synced")) {
            await markItemSynced(id, res)
            setQueue((q) => q.filter((entry) => entry.id !== id))
            window.dispatchEvent(new CustomEvent("ayushlink:sync_complete", { detail: syncRes }))
            window.dispatchEvent(new CustomEvent("ayushlink:pending_updated"))
          } else {
            console.warn("Single item sync returned error status:", res?.error || res?.message)
          }
        }
      }
    } catch (e) {
      console.error("Sync failed for item:", id, e)
    } finally {
      setSyncingIds((ids) => ids.filter((i) => i !== id))
    }
  }

  const remove = async (id) => {
    try {
      await deleteOfflineItem(id)
    } catch {}
    setQueue((q) => q.filter((item) => item.id !== id))
  }

  const totalSize = queue.reduce((sum, item) => sum + parseFloat(item.size), 0).toFixed(1)

  return (
    <main className="min-h-dvh w-full bg-gradient-to-b from-amber-50/40 via-white to-slate-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-amber-100 bg-white/90 px-4 py-4 backdrop-blur">
          <button
            type="button"
            onClick={onBack}
            aria-label={t.common.goBack}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95"
          >
            <BackIcon className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500 shadow-lg shadow-amber-500/25">
              <SyncIcon className="h-5 w-5 text-white" />
            </span>
            <div>
              <h1 className="text-base font-bold leading-tight text-slate-800">{t.sync.title}</h1>
              <p className="text-xs text-slate-500">{queue.length} {t.sync.recordsWaiting}</p>
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-5 px-4 py-5">
          {/* Status card */}
          <section className="flex items-center justify-between gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <SyncIcon className={`h-6 w-6 ${syncing ? "animate-spin" : ""}`} />
              </span>
              <div>
                <p className="text-sm font-medium text-amber-700">
                  {queue.length ? t.sync.savedLocally : t.sync.allCaughtUp}
                </p>
                <p className="text-lg font-bold">
                  {queue.length ? `${queue.length} ${t.sync.itemsWaiting} · ${totalSize} KB` : t.sync.nothingToSync}
                </p>
                <p className="text-xs text-amber-600">
                  {queue.length ? t.sync.autoSyncHint : t.sync.allSyncedDesc}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={syncAll}
              disabled={!queue.length || syncing}
              className="shrink-0 rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncing ? t.sync.syncing : t.sync.syncAll}
            </button>
          </section>

          {justSynced ? (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
              <CheckCircleIcon className="h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">{t.sync.syncSuccessToast}</p>
            </div>
          ) : null}

          {/* Queue list */}
          {queue.length ? (
            <ul className="flex flex-col gap-3">
              {queue.map((item) => {
                const meta = TYPE_META[item.type] || { tone: "bg-slate-50 text-slate-600" }
                const itemSyncing = syncingIds.includes(item.id)
                const typeLabel = t.sync.types[item.type] || item.type
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm"
                  >
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xs font-bold ${meta.tone}`}>
                      {typeLabel
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{item.label}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {typeLabel} &middot; {item.time} &middot; {item.size}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => syncOne(item.id)}
                      disabled={itemSyncing || syncing}
                      aria-label={t.sync.syncThis}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-600 transition hover:bg-amber-100 disabled:opacity-60"
                    >
                      {itemSyncing ? (
                        <SyncIcon className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckIcon className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      aria-label={t.sync.discardThis}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 hover:text-red-500"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/40 py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                <CheckCircleIcon className="h-7 w-7" />
              </span>
              <p className="text-sm font-medium text-slate-600">{t.sync.emptyAllSynced}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
