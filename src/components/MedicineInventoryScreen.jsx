import { useState, useEffect, useMemo, useCallback } from "react"
import { ashaT } from "../lib/ashaI18n.js"
import { getAshaInventory, adjustAshaInventoryStock } from "../lib/api.js"

/**
 * AyushLink — Medicine Inventory
 * Fully database-backed by FastAPI + MongoDB, scoped to logged-in ASHA worker.
 * React + Tailwind CSS
 */

function levelFor(item) {
  const stock = item?.stock ?? 0
  const threshold = item?.threshold || 10
  if (stock <= 0) {
    return {
      id: "out",
      label: "Out of Stock",
      tone: "bg-red-50 text-red-700 border-red-200",
      bar: "bg-red-600",
    }
  }
  const ratio = stock / threshold
  if (ratio <= 0.5) {
    return {
      id: "critical",
      label: "Critical",
      tone: "bg-red-50 text-red-700 border-red-200",
      bar: "bg-red-500",
    }
  }
  if (ratio < 1) {
    return {
      id: "low",
      label: "Low",
      tone: "bg-amber-50 text-amber-700 border-amber-200",
      bar: "bg-amber-500",
    }
  }
  return {
    id: "ok",
    label: "Healthy",
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
    bar: "bg-emerald-500",
  }
}

/* ---------- Inline icons ---------- */
function BackIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  )
}
function PillIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.5 20.5a4.95 4.95 0 0 1-7-7l6-6a4.95 4.95 0 0 1 7 7z" />
      <path d="m8.5 8.5 7 7" />
    </svg>
  )
}
function SearchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}
function XIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
function PlusIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
function MinusIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
    </svg>
  )
}
function AlertIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}
function RefreshIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  )
}

export default function MedicineInventoryScreen({ lang = "en", onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [adjustingIds, setAdjustingIds] = useState({})
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")

  const t = useMemo(() => ashaT(lang), [lang])

  // Safe translation fallbacks
  const trans = useMemo(() => {
    const inv = t?.inventory || {}
    const tabs = inv.tabs || inv.filters || {}
    const status = inv.status || inv.stockLevels || {}

    return {
      title: inv.title || "Medicine Inventory",
      subtitle: inv.subtitle || "Track stock levels, restock items and see low-stock warnings.",
      searchPlaceholder: inv.searchPlaceholder || "Search medicine by name or category",
      tabs: {
        all: tabs.all || "All",
        low: tabs.low || "Low stock",
        out: tabs.out || "Out of stock",
        ok: tabs.ok || "In stock",
      },
      status: {
        critical: status.critical || "Critical",
        low: status.low || "Low",
        out: status.out || "Out of Stock",
        ok: status.ok || "Healthy",
      },
      stockLabel: inv.stockLabel || "Stock",
      thresholdLabel: inv.thresholdLabel || "Min threshold",
      itemsCount: inv.itemsCount || "medicines",
      lowStockCount: inv.lowStockCount || "low stock",
      lowStockBanner: inv.lowStockBanner || "medicines are below minimum threshold.",
      empty: inv.empty || inv.noMatch || "No inventory records found",
      noMatch: inv.noMatch || "No medicines match your search",
      loading: inv.loading || "Loading inventory...",
      error: inv.error || "Failed to load inventory from server",
      retry: inv.retry || "Retry",
      refresh: inv.refresh || "Refresh",
      decrease: inv.decrease || "Decrease stock",
      increase: inv.increase || "Increase stock",
    }
  }, [t])

  const filters = useMemo(
    () => [
      { id: "all", label: trans.tabs.all },
      { id: "low", label: trans.tabs.low },
      { id: "out", label: trans.tabs.out },
      { id: "ok", label: trans.tabs.ok },
    ],
    [trans]
  )

  const fetchInventory = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true)
    else setRefreshing(true)
    setError(null)

    try {
      const res = await getAshaInventory()
      const list = Array.isArray(res) ? res : res?.items || []
      setItems(list)
    } catch (err) {
      console.error("Failed to load ASHA inventory:", err)
      setError(err?.message || trans.error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [trans.error])

  useEffect(() => {
    fetchInventory()
  }, [fetchInventory])

  const adjustStock = async (itemId, delta) => {
    const targetItem = items.find((i) => i.item_id === itemId || i.id === itemId)
    if (!targetItem) return

    const prevStock = targetItem.stock
    const newStock = Math.max(0, prevStock + delta)
    if (newStock === prevStock) return

    // Optimistic UI update
    setItems((prevList) =>
      prevList.map((item) =>
        (item.item_id === itemId || item.id === itemId)
          ? { ...item, stock: newStock }
          : item
      )
    )

    setAdjustingIds((prev) => ({ ...prev, [itemId]: true }))

    try {
      const updated = await adjustAshaInventoryStock(itemId, delta)
      if (updated && typeof updated.stock === "number") {
        setItems((prevList) =>
          prevList.map((item) =>
            (item.item_id === itemId || item.id === itemId)
              ? { ...item, ...updated }
              : item
          )
        )
      }
    } catch (err) {
      console.error(`Failed to adjust stock for ${itemId}:`, err)
      // Revert optimistic update on error
      setItems((prevList) =>
        prevList.map((item) =>
          (item.item_id === itemId || item.id === itemId)
            ? { ...item, stock: prevStock }
            : item
        )
      )
    } finally {
      setAdjustingIds((prev) => {
        const next = { ...prev }
        delete next[itemId]
        return next
      })
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      const level = levelFor(item)
      const matchesFilter =
        filter === "all" ||
        (filter === "low" && (level.id === "low" || level.id === "critical")) ||
        (filter === "out" && level.id === "out") ||
        (filter === "ok" && level.id === "ok")

      const matchesQuery =
        !q ||
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q))

      return matchesFilter && matchesQuery
    })
  }, [items, query, filter])

  const lowCount = items.filter((i) => {
    const lvl = levelFor(i)
    return lvl.id === "critical" || lvl.id === "low" || lvl.id === "out"
  }).length

  return (
    <main className="min-h-dvh w-full bg-slate-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label={t?.common?.goBack || "Back"}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95"
            >
              <BackIcon className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-600 shadow-lg shadow-sky-600/25">
                <PillIcon className="h-5 w-5 text-white" />
              </span>
              <div>
                <h1 className="text-base font-bold leading-tight text-slate-800">{trans.title}</h1>
                <p className="text-xs text-slate-500">
                  {items.length} {trans.itemsCount} &middot; {lowCount} {trans.lowStockCount}
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fetchInventory(true)}
            disabled={loading || refreshing}
            aria-label={trans.refresh}
            title={trans.refresh}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 active:scale-95 disabled:opacity-50"
          >
            <RefreshIcon className={`h-5 w-5 ${refreshing ? "animate-spin text-sky-600" : ""}`} />
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-4 px-4 py-5">
          {/* Low stock alert banner */}
          {lowCount > 0 ? (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800 animate-in fade-in">
              <AlertIcon className="h-5 w-5 shrink-0 text-amber-600" />
              <p className="text-sm font-medium">
                <span className="font-bold">{lowCount}</span> {trans.lowStockBanner}
              </p>
            </div>
          ) : null}

          {/* Search */}
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={trans.searchPlaceholder}
              className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-9 text-base text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <XIcon className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {/* Filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition
                  ${
                    filter === f.id
                      ? "border-sky-600 bg-sky-600 text-white shadow-sm shadow-sky-600/25"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Loading State */}
          {loading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
              <p className="text-sm font-medium text-slate-500">{trans.loading}</p>
            </div>
          ) : error ? (
            /* Error State */
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl border border-red-200 bg-red-50/50 p-8 text-center">
              <AlertIcon className="h-10 w-10 text-red-500" />
              <p className="text-sm font-semibold text-red-700">{error}</p>
              <button
                type="button"
                onClick={() => fetchInventory()}
                className="mt-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 active:scale-95"
              >
                {trans.retry}
              </button>
            </div>
          ) : filtered.length > 0 ? (
            /* Inventory list */
            <ul className="flex flex-col gap-3">
              {filtered.map((item) => {
                const itemId = item.item_id || item.id
                const level = levelFor(item)
                const levelLabel = trans.status[level.id] || level.label
                const maxVal = Math.max(item.threshold * 1.5, item.stock, 1)
                const pct = Math.min(100, Math.round((item.stock / maxVal) * 100))
                const isAdjusting = !!adjustingIds[itemId]

                return (
                  <li
                    key={itemId}
                    className="flex flex-col gap-3 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-slate-200"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${level.tone}`}>
                            {levelLabel}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                          <span>{item.category}</span>
                          <span>&middot;</span>
                          <span>{trans.thresholdLabel}: {item.threshold} {item.unit}</span>
                        </div>
                      </div>

                      {/* Stock Stepper */}
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => adjustStock(itemId, -1)}
                          disabled={item.stock <= 0 || isAdjusting}
                          aria-label={`${trans.decrease} ${item.name}`}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 active:scale-95 disabled:opacity-40"
                        >
                          <MinusIcon className="h-4 w-4" />
                        </button>

                        <span className="min-w-[4rem] text-center text-sm font-bold text-slate-800">
                          {item.stock} <span className="text-xs font-normal text-slate-400">{item.unit}</span>
                        </span>

                        <button
                          type="button"
                          onClick={() => adjustStock(itemId, 1)}
                          disabled={isAdjusting}
                          aria-label={`${trans.increase} ${item.name}`}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-600 transition hover:bg-sky-100 active:scale-95 disabled:opacity-40"
                        >
                          <PlusIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Stock level bar */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full transition-all duration-300 ${level.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            /* Empty State */
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-white/60 py-16 text-center">
              <PillIcon className="h-10 w-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">
                {query ? trans.noMatch : trans.empty}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
