import { useMemo, useState } from "react"
import { ashaT } from "../lib/ashaI18n.js"

/**
 * AyushLink — Medicine Inventory
 * React + JavaScript + Tailwind CSS
 * Track stock levels, restock items and see low-stock warnings.
 */

const SEED_INVENTORY = [
  { id: "M-01", name: "Paracetamol 500mg", category: "Analgesic", stock: 6, unit: "strips", threshold: 20 },
  { id: "M-02", name: "ORS Sachets", category: "Rehydration", stock: 42, unit: "sachets", threshold: 30 },
  { id: "M-03", name: "Amoxicillin 500mg", category: "Antibiotic", stock: 9, unit: "strips", threshold: 15 },
  { id: "M-04", name: "Cetirizine 10mg", category: "Antihistamine", stock: 28, unit: "strips", threshold: 20 },
  { id: "M-05", name: "Metformin 500mg", category: "Antidiabetic", stock: 4, unit: "strips", threshold: 15 },
  { id: "M-06", name: "Iron & Folic Acid", category: "Supplement", stock: 55, unit: "strips", threshold: 25 },
  { id: "M-07", name: "Oral Rehydration Salts (kids)", category: "Rehydration", stock: 3, unit: "sachets", threshold: 20 },
  { id: "M-08", name: "Cough Syrup", category: "Respiratory", stock: 18, unit: "bottles", threshold: 10 },
  { id: "M-09", name: "Antiseptic Solution", category: "First Aid", stock: 12, unit: "bottles", threshold: 10 },
  { id: "M-10", name: "Vitamin D3 Drops", category: "Supplement", stock: 30, unit: "bottles", threshold: 15 },
]

function levelFor(item) {
  const ratio = item.stock / item.threshold
  if (ratio <= 0.5) return { id: "critical", label: "Critical", tone: "bg-red-50 text-red-700 border-red-200", bar: "bg-red-500" }
  if (ratio < 1) return { id: "low", label: "Low", tone: "bg-amber-50 text-amber-700 border-amber-200", bar: "bg-amber-500" }
  return { id: "ok", label: "Healthy", tone: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "bg-emerald-500" }
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
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
function MinusIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

export default function MedicineInventoryScreen({ lang = "en", onBack }) {
  const [items, setItems] = useState(SEED_INVENTORY)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const t = ashaT(lang)

  const filters = [
    { id: "all", label: t.inventory.filters.all },
    { id: "low", label: t.inventory.filters.low },
    { id: "ok", label: t.inventory.filters.ok },
  ]

  const adjust = (id, delta) => {
    setItems((list) =>
      list.map((item) => (item.id === id ? { ...item, stock: Math.max(0, item.stock + delta) } : item))
    )
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      const level = levelFor(item)
      const matchesFilter =
        filter === "all" || (filter === "low" && level.id !== "ok") || (filter === "ok" && level.id === "ok")
      const matchesQuery =
        !q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
      return matchesFilter && matchesQuery
    })
  }, [items, query, filter])

  const lowCount = items.filter((i) => levelFor(i).id !== "ok").length

  return (
    <main className="min-h-dvh w-full bg-slate-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur">
          <button
            type="button"
            onClick={onBack}
            aria-label={t.common.goBack}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95"
          >
            <BackIcon className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-600 shadow-lg shadow-sky-600/25">
              <PillIcon className="h-5 w-5 text-white" />
            </span>
            <div>
              <h1 className="text-base font-bold leading-tight text-slate-800">{t.inventory.title}</h1>
              <p className="text-xs text-slate-500">{items.length} {t.inventory.itemsCount} &middot; {lowCount} {t.inventory.lowStockCount}</p>
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 px-4 py-5">
          {lowCount ? (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
              <AlertIcon className="h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">
                {lowCount} {t.inventory.lowStockBanner}
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
              placeholder={t.inventory.searchPlaceholder}
              className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-9 text-base text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t.patients.clearSearch}
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

          {/* Inventory list */}
          {filtered.length ? (
            <ul className="flex flex-col gap-3">
              {filtered.map((item) => {
                const level = levelFor(item)
                const levelLabel = t.inventory.stockLevels[level.id] || level.label
                const pct = Math.min(100, Math.round((item.stock / (item.threshold * 1.5)) * 100))
                return (
                  <li
                    key={item.id}
                    className="flex flex-col gap-3 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${level.tone}`}>
                            {levelLabel}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">{item.category}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => adjust(item.id, -1)}
                          aria-label={`Decrease ${item.name} stock`}
                          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 active:scale-95"
                        >
                          <MinusIcon className="h-4 w-4" />
                        </button>
                        <span className="min-w-[3.5rem] text-center text-sm font-bold text-slate-800">
                          {item.stock} <span className="text-xs font-normal text-slate-400">{item.unit}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => adjust(item.id, 1)}
                          aria-label={`Increase ${item.name} stock`}
                          className="flex h-8 w-8 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-600 transition hover:bg-sky-100 active:scale-95"
                        >
                          <PlusIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${level.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-slate-200 bg-white/60 py-16 text-center">
              <PillIcon className="h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">{t.inventory.empty}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
