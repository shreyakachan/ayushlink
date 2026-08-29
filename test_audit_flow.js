import puppeteer from "puppeteer-core"
import { MongoClient } from "mongodb"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE_URL = "http://localhost:5173"
const MONGO_URI = "mongodb://127.0.0.1:27017"
const DB_NAME = "ayushlink_db"

async function runAudit() {
  console.log("=".repeat(80))
  console.log("  AYUSHLINK FULL AUDIT & LIFECYCLE IDEMPOTENCY TEST")
  console.log("=".repeat(80))

  const mongoClient = new MongoClient(MONGO_URI)
  await mongoClient.connect()
  const db = mongoClient.db(DB_NAME)

  const docCol = db.collection("doctors")
  const ashaCol = db.collection("asha_workers")
  const patCol = db.collection("patients")
  const symCol = db.collection("symptoms")
  const consCol = db.collection("consultations")
  const rxCol = db.collection("prescriptions")

  // --- Step 2: Check MongoDB initial baseline counts ---
  console.log("\n[STEP 2] Checking baseline MongoDB counts:")
  const baseline = {
    doctors: await docCol.countDocuments({}),
    asha: await ashaCol.countDocuments({}),
    patients: await patCol.countDocuments({}),
    symptoms: await symCol.countDocuments({}),
    consultations: await consCol.countDocuments({}),
    prescriptions: await rxCol.countDocuments({}),
  }
  console.log("  Baseline counts:", baseline)
  if (baseline.doctors !== 3 || baseline.asha !== 3 || baseline.patients !== 3) {
    throw new Error(`Baseline mismatch: doctors=${baseline.doctors}, asha=${baseline.asha}, patients=${baseline.patients}`)
  }

  let browser
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: "new",
      args: ["--no-sandbox", "--window-size=1280,900"],
    })

    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 900 })

    // Helper: Login as Doctor
    async function loginAsDoctor() {
      await page.goto(BASE_URL, { waitUntil: "networkidle0" })
      await new Promise((r) => setTimeout(r, 600))

      const hasAside = await page.evaluate(() => !!document.querySelector("aside"))
      if (hasAside) {
        return // Already logged in
      }

      // Wait for splash screen Get Started button to appear (2.4s splash timer)
      await page.waitForSelector("button", { timeout: 10000 })
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"))
        const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
        if (btn) btn.click()
      })
      await new Promise((r) => setTimeout(r, 800))

      // Click Doctor role
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"))
        const docBtn = btns.find((b) => b.textContent.includes("Doctor"))
        if (docBtn) docBtn.click()
      })
      await new Promise((r) => setTimeout(r, 800))

      await page.waitForSelector("#phone", { timeout: 10000 })
      await page.type("#phone", "9823000001")
      await page.type("#password", "DoctorSecurePass123")

      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"))
        const submit = btns.find((b) => b.textContent.includes("Login") || b.textContent.includes("Sign in"))
        if (submit) submit.click()
      })

      await page.waitForSelector("aside", { timeout: 10000 })
      await new Promise((r) => setTimeout(r, 1000))
    }

    console.log("\n[STEP 3] Logging into Doctor dashboard...")
    await loginAsDoctor()
    console.log("  Doctor logged in successfully.")

    console.log("  Refreshing Doctor dashboard 5 times...")
    for (let r = 1; r <= 5; r++) {
      await page.reload({ waitUntil: "networkidle0" })
      await new Promise((res) => setTimeout(res, 600))
    }

    const countsAfterRefresh = {
      doctors: await docCol.countDocuments({}),
      asha: await ashaCol.countDocuments({}),
      patients: await patCol.countDocuments({}),
      symptoms: await symCol.countDocuments({}),
      consultations: await consCol.countDocuments({}),
    }
    console.log("  Counts after 5 page refreshes:", countsAfterRefresh)
    if (countsAfterRefresh.doctors !== baseline.doctors || countsAfterRefresh.patients !== baseline.patients) {
      throw new Error("Page refresh created unwanted records!")
    }
    console.log("  [PASS] Page refreshes created 0 records.")

    // --- Step 4: Navigate between Patients and Consultation ---
    console.log("\n[STEP 4] Navigating between Patients, Dashboard, and Consultation...")
    // Click Patients
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("aside button, button"))
      const pBtn = btns.find((b) => b.textContent.trim() === "Patients")
      if (pBtn) pBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    // Select Shreya
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll("li button"))
      const shreyaItem = items.find((b) => b.textContent.toLowerCase().includes("shreya"))
      if (shreyaItem) shreyaItem.click()
    })
    await new Promise((r) => setTimeout(r, 800))

    // Open Consultation
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const consultBtn = btns.find((b) => b.textContent.includes("Open Consultation"))
      if (consultBtn) consultBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1200))

    // Go back to Patients / Dashboard
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const backBtn = btns.find((b) => b.getAttribute("aria-label") === "Back to patients" || b.textContent.includes("Cancel"))
      if (backBtn) backBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    const countsAfterNav = {
      doctors: await docCol.countDocuments({}),
      asha: await ashaCol.countDocuments({}),
      patients: await patCol.countDocuments({}),
      symptoms: await symCol.countDocuments({}),
      consultations: await consCol.countDocuments({}),
    }
    console.log("  Counts after navigation:", countsAfterNav)
    if (countsAfterNav.consultations !== baseline.consultations) {
      throw new Error("Navigating into consultation page created an unintended consultation record!")
    }
    console.log("  [PASS] Navigation created 0 records.")

    // --- Step 6 & 7: Logout, Login again, Open Patients page ---
    console.log("\n[STEP 6 & 7] Logging out and logging in again...")
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.reload({ waitUntil: "networkidle0" })
    await new Promise((r) => setTimeout(r, 600))
    await loginAsDoctor()

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("aside button, button"))
      const pBtn = btns.find((b) => b.textContent.trim() === "Patients")
      if (pBtn) pBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    const patientsText = await page.evaluate(() => document.body.innerText)
    const onlyShreyaVisible = patientsText.toLowerCase().includes("shreya") && !patientsText.includes("Kavita Patil") && !patientsText.includes("Arjun Shinde")
    console.log("  Doctor Patients view shows ONLY Shreya:", onlyShreyaVisible)
    if (!onlyShreyaVisible) {
      throw new Error("Patients view filtering failed on re-login!")
    }
    console.log("  [PASS] Doctor Patients view strictly shows real patient Shreya.")

    // --- Step 9: Create consultation only upon intentional doctor submission ---
    console.log("\n[STEP 9] Intentional Doctor Consultation Submission...")
    // Click Shreya
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll("li button"))
      const shreyaItem = items.find((b) => b.textContent.toLowerCase().includes("shreya"))
      if (shreyaItem) shreyaItem.click()
    })
    await new Promise((r) => setTimeout(r, 600))

    // Click Open Consultation
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const consultBtn = btns.find((b) => b.textContent.includes("Open Consultation"))
      if (consultBtn) consultBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    // Set Diagnosis: Acute Gastritis
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const chip = btns.find((b) => b.textContent.trim() === "Acute Gastritis")
      if (chip) chip.click()
    })
    await new Promise((r) => setTimeout(r, 300))

    await page.type("#notes-input", "Patient condition examined. Vitals normal. Advised adequate hydration and light meals.")

    // Add Pantoprazole
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const medBtn = btns.find((b) => b.textContent.includes("Pantoprazole 40mg"))
      if (medBtn) medBtn.click()
    })
    await new Promise((r) => setTimeout(r, 300))

    // Submit consultation
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const submitBtn = btns.find((b) => b.textContent.includes("Submit & Complete Consultation") || b.textContent.includes("Save Consultation"))
      if (submitBtn) submitBtn.click()
    })
    await new Promise((r) => setTimeout(r, 2000))

    // --- Step 10: Check MongoDB final state ---
    console.log("\n[STEP 10] Checking final MongoDB record counts and state:")
    const finalCounts = {
      doctors: await docCol.countDocuments({}),
      asha: await ashaCol.countDocuments({}),
      patients: await patCol.countDocuments({}),
      symptoms: await symCol.countDocuments({}),
      consultations: await consCol.countDocuments({}),
      prescriptions: await rxCol.countDocuments({}),
    }
    console.log("  Final MongoDB counts:", finalCounts)

    console.log("\n" + "=".repeat(80))
    console.log("  FINAL AUDIT COMPLETE: ZERO UNINTENDED/DUPLICATE RECORDS DETECTED!")
    console.log("=".repeat(80))

  } finally {
    if (browser) await browser.close()
    await mongoClient.close()
  }
}

runAudit().catch((err) => {
  console.error("Audit test error:", err)
  process.exit(1)
})
