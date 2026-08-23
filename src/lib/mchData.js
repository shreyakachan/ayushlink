/**
 * AyushLink — Maternal & Child Health data
 *
 * Seed data + small helpers for the Pregnancy / Vaccination / Growth /
 * High-Risk tracker. Due dates are stored as day-offsets from "today" (via
 * isoDaysFromNow) so the demo always shows a realistic mix of overdue,
 * due-soon and upcoming items no matter when it's opened — no backend yet,
 * this stands in for what a real ANC/immunization schedule API would return.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export function isoDaysFromNow(offsetDays) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

export function formatDate(iso) {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

/**
 * Buckets a due-date into missed / due-soon / upcoming relative to today.
 * Same 3-day "due soon" window used across pregnancy visits, vaccination
 * doses, and growth checks so the whole module reads consistently.
 */
export function getDueStatus(iso) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${iso}T00:00:00`)
  const diffDays = Math.round((target - today) / DAY_MS)
  if (diffDays < 0) return { key: "missed", label: "Missed", tone: "red", diffDays }
  if (diffDays <= 3) return { key: "due-soon", label: "Due soon", tone: "amber", diffDays }
  return { key: "upcoming", label: "Upcoming", tone: "blue", diffDays }
}

export const NUTRITION_TONE = {
  Normal: "emerald",
  Underweight: "amber",
  "Severely underweight": "red",
}

export const PREGNANCIES = [
  {
    id: "PW-1",
    name: "Sunita Devi",
    village: "Chandapur",
    age: 24,
    trimester: 3,
    edd: isoDaysFromNow(38),
    nextVisitLabel: "ANC visit 4",
    nextVisitDue: isoDaysFromNow(-2),
    highRisk: true,
    riskReason: "Low haemoglobin (anaemia)",
  },
  {
    id: "PW-2",
    name: "Kavita Pawar",
    village: "Devgaon",
    age: 29,
    trimester: 2,
    edd: isoDaysFromNow(120),
    nextVisitLabel: "ANC visit 2",
    nextVisitDue: isoDaysFromNow(5),
    highRisk: false,
  },
  {
    id: "PW-3",
    name: "Meena Joshi",
    village: "Nandgaon",
    age: 32,
    trimester: 3,
    edd: isoDaysFromNow(20),
    nextVisitLabel: "ANC visit 4",
    nextVisitDue: isoDaysFromNow(1),
    highRisk: true,
    riskReason: "High blood pressure",
  },
  {
    id: "PW-4",
    name: "Radha Salunkhe",
    village: "Chandapur",
    age: 19,
    trimester: 1,
    edd: isoDaysFromNow(210),
    nextVisitLabel: "ANC visit 1",
    nextVisitDue: isoDaysFromNow(10),
    highRisk: true,
    riskReason: "First pregnancy, age under 20",
  },
  {
    id: "PW-5",
    name: "Anita Kamble",
    village: "Devgaon",
    age: 27,
    trimester: 2,
    edd: isoDaysFromNow(95),
    nextVisitLabel: "ANC visit 3",
    nextVisitDue: isoDaysFromNow(-6),
    highRisk: false,
  },
]

export const VACCINATIONS = [
  {
    id: "CH-1",
    childName: "Baby of Sunita Devi",
    motherName: "Sunita Devi",
    village: "Chandapur",
    ageMonths: 2,
    nextVaccine: "OPV-1, Penta-1",
    dueDate: isoDaysFromNow(-3),
    missedCount: 1,
  },
  {
    id: "CH-2",
    childName: "Rohan Pawar",
    motherName: "Kavita Pawar",
    village: "Devgaon",
    ageMonths: 9,
    nextVaccine: "Measles-Rubella",
    dueDate: isoDaysFromNow(2),
    missedCount: 0,
  },
  {
    id: "CH-3",
    childName: "Priya Joshi",
    motherName: "Meena Joshi",
    village: "Nandgaon",
    ageMonths: 14,
    nextVaccine: "DPT booster-1",
    dueDate: isoDaysFromNow(15),
    missedCount: 0,
  },
  {
    id: "CH-4",
    childName: "Om Salunkhe",
    motherName: "Radha Salunkhe",
    village: "Chandapur",
    ageMonths: 5,
    nextVaccine: "Penta-3, OPV-3",
    dueDate: isoDaysFromNow(-10),
    missedCount: 2,
  },
  {
    id: "CH-5",
    childName: "Sanika Kamble",
    motherName: "Anita Kamble",
    village: "Devgaon",
    ageMonths: 18,
    nextVaccine: "DPT booster-1",
    dueDate: isoDaysFromNow(7),
    missedCount: 0,
  },
]

export const GROWTH_RECORDS = [
  {
    id: "GR-1",
    childName: "Om Salunkhe",
    village: "Chandapur",
    ageMonths: 5,
    weightKg: 4.9,
    heightCm: 55,
    nutritionStatus: "Severely underweight",
    nextCheckDue: isoDaysFromNow(-4),
  },
  {
    id: "GR-2",
    childName: "Rohan Pawar",
    village: "Devgaon",
    ageMonths: 9,
    weightKg: 8.2,
    heightCm: 70,
    nutritionStatus: "Normal",
    nextCheckDue: isoDaysFromNow(20),
  },
  {
    id: "GR-3",
    childName: "Priya Joshi",
    village: "Nandgaon",
    ageMonths: 14,
    weightKg: 7.9,
    heightCm: 74,
    nutritionStatus: "Underweight",
    nextCheckDue: isoDaysFromNow(4),
  },
  {
    id: "GR-4",
    childName: "Sanika Kamble",
    village: "Devgaon",
    ageMonths: 18,
    weightKg: 9.4,
    heightCm: 79,
    nutritionStatus: "Normal",
    nextCheckDue: isoDaysFromNow(25),
  },
  {
    id: "GR-5",
    childName: "Baby of Sunita Devi",
    village: "Chandapur",
    ageMonths: 2,
    weightKg: 4.3,
    heightCm: 53,
    nutritionStatus: "Normal",
    nextCheckDue: isoDaysFromNow(10),
  },
]

/**
 * Combines high-risk pregnancies, off-track growth records, and repeatedly
 * missed vaccinations into a single alert feed — the "High-Risk" tab.
 */
export function getHighRiskAlerts() {
  const alerts = []

  for (const p of PREGNANCIES) {
    if (!p.highRisk) continue
    alerts.push({
      id: `risk-${p.id}`,
      category: "Pregnancy",
      name: p.name,
      village: p.village,
      reason: p.riskReason,
      refDate: p.nextVisitDue,
    })
  }

  for (const g of GROWTH_RECORDS) {
    if (g.nutritionStatus === "Normal") continue
    alerts.push({
      id: `risk-${g.id}`,
      category: "Child growth",
      name: g.childName,
      village: g.village,
      reason: g.nutritionStatus,
      refDate: g.nextCheckDue,
    })
  }

  for (const v of VACCINATIONS) {
    if (v.missedCount < 2) continue
    alerts.push({
      id: `risk-${v.id}`,
      category: "Vaccination",
      name: v.childName,
      village: v.village,
      reason: `${v.missedCount} doses missed`,
      refDate: v.dueDate,
    })
  }

  return alerts.sort((a, b) => getDueStatus(a.refDate).diffDays - getDueStatus(b.refDate).diffDays)
}

/** Counts used for the summary strip at the top of the tracker. */
export function getSummaryCounts() {
  const dueDates = [
    ...PREGNANCIES.map((p) => p.nextVisitDue),
    ...VACCINATIONS.map((v) => v.dueDate),
    ...GROWTH_RECORDS.map((g) => g.nextCheckDue),
  ]
  let missed = 0
  let dueSoon = 0
  for (const d of dueDates) {
    const status = getDueStatus(d).key
    if (status === "missed") missed += 1
    if (status === "due-soon") dueSoon += 1
  }
  return {
    missed,
    dueSoon,
    highRisk: getHighRiskAlerts().length,
  }
}
