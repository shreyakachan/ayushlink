import puppeteer from "puppeteer-core"
import { MongoClient } from "mongodb"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE_URL = "http://localhost:5173"
const MONGO_URI = "mongodb://127.0.0.1:27017"
const DB_NAME = "ayushlink_db"

async function runTest() {
  console.log("=".repeat(80))
  console.log("  DOCTOR PRESCRIPTION WORKFLOW & NAVIGATION AUDIT TEST")
  console.log("=".repeat(80))

  const mongoClient = new MongoClient(MONGO_URI)
  await mongoClient.connect()
  const db = mongoClient.db(DB_NAME)

  const docCountBefore = await db.collection("doctors").countDocuments({})
  const patCountBefore = await db.collection("patients").countDocuments({})
  const ashaCountBefore = await db.collection("asha_workers").countDocuments({})
  const symCountBefore = await db.collection("symptoms").countDocuments({})
  const consCountBefore = await db.collection("consultations").countDocuments({})
  const rxCountBefore = await db.collection("prescriptions").countDocuments({})

  console.log(`[DB BASELINE] Doctors: ${docCountBefore}, Patients: ${patCountBefore}, ASHA: ${ashaCountBefore}, Symptoms: ${symCountBefore}, Consultations: ${consCountBefore}, Prescriptions: ${rxCountBefore}`)

  let browser
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: "new",
      args: ["--no-sandbox", "--window-size=1280,900"],
    })

    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 900 })

    console.log("\n--- STEP 1: Logging into Doctor Dashboard ---")
    await page.goto(BASE_URL, { waitUntil: "networkidle0" })
    await new Promise((r) => setTimeout(r, 800))

    const hasAside = await page.evaluate(() => !!document.querySelector("aside"))
    if (!hasAside) {
      await page.waitForSelector("button", { timeout: 10000 })
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"))
        const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
        if (btn) btn.click()
      })
      await new Promise((r) => setTimeout(r, 600))

      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"))
        const docBtn = btns.find((b) => b.textContent.includes("Doctor"))
        if (docBtn) docBtn.click()
      })
      await new Promise((r) => setTimeout(r, 600))

      await page.waitForSelector("#phone", { timeout: 8000 })
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

    console.log("[PASS] Doctor dashboard loaded.")

    // --- STEP 2: Verify Sidebar and Quick Actions Navigation ---
    console.log("\n--- STEP 2: Verifying Standalone 'Prescriptions' Entry is Removed ---")
    const sidebarNavText = await page.evaluate(() => {
      const aside = document.querySelector("aside")
      return aside ? aside.innerText : ""
    })

    const hasStandalonePrescriptionsInSidebar = sidebarNavText.includes("Prescriptions")
    console.log("  Sidebar contains standalone 'Prescriptions':", hasStandalonePrescriptionsInSidebar)
    if (hasStandalonePrescriptionsInSidebar) {
      throw new Error("Standalone 'Prescriptions' entry is still present in doctor sidebar navigation!")
    }
    console.log("  [PASS] Standalone 'Prescriptions' entry is NOT in the Doctor sidebar.")

    const quickActionsText = await page.evaluate(() => {
      const main = document.querySelector("main") || document.body
      return main.innerText
    })
    const hasStandalonePrescriptionsInQuickActions = quickActionsText.includes("Create and view prescriptions")
    console.log("  Quick actions contains standalone 'Prescriptions':", hasStandalonePrescriptionsInQuickActions)
    if (hasStandalonePrescriptionsInQuickActions) {
      throw new Error("Standalone 'Prescriptions' card is still present in doctor quick actions!")
    }
    console.log("  [PASS] Standalone 'Prescriptions' card is NOT in the Doctor quick actions.")

    // --- STEP 3: Verify Doctor Workflow: Patients -> Select Shreya -> Clinical Consultation ---
    console.log("\n--- STEP 3: Testing Doctor -> Patients -> Clinical Consultation -> Prescription & Medicines ---")
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("aside button, button"))
      const pBtn = btns.find((b) => b.textContent.trim() === "Patients")
      if (pBtn) pBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    // Select Shreya
    // Select Shreya in Patients list
    await page.waitForSelector("li button", { timeout: 5000 })
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll("li button"))
      const shreyaItem = items.find((b) => b.textContent.toLowerCase().includes("shreya"))
      if (shreyaItem) shreyaItem.click()
    })
    await new Promise((r) => setTimeout(r, 800))

    // Click Open Consultation in details sheet
    await page.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      return btns.some((b) => b.textContent.includes("Open Consultation"))
    }, { timeout: 5000 })

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const consultBtn = btns.find((b) => b.textContent.includes("Open Consultation"))
      if (consultBtn) consultBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1500))

    // Verify Clinical Consultation and Prescription builder
    const consultationPageText = await page.evaluate(() => document.body.innerText)
    console.log("  Consultation Page snippet:\n", consultationPageText.slice(0, 400))

    const hasConsultationHeader = consultationPageText.toLowerCase().includes("clinical consultation")
    const hasPatientName = consultationPageText.toLowerCase().includes("shreya")
    const hasRxSection = consultationPageText.toLowerCase().includes("prescription") || consultationPageText.toLowerCase().includes("medicines")
    const hasQuickMeds = consultationPageText.toLowerCase().includes("quick add") || consultationPageText.toLowerCase().includes("ayush")

    console.log("  Consultation page opened:", hasConsultationHeader)
    console.log("  Patient Shreya selected:", hasPatientName)
    console.log("  Prescription & Medicines section visible:", hasRxSection)
    console.log("  Quick Add Formulations visible:", hasQuickMeds)

    if (!hasConsultationHeader || !hasPatientName || !hasRxSection) {
      throw new Error("Clinical consultation prescription section not available for selected patient!")
    }
    console.log("  [PASS] Doctor successfully accesses Prescription & Medicines inside Clinical Consultation for the selected patient.")

    // --- STEP 4: Verify Database Remains Completely Intact ---
    console.log("\n--- STEP 4: Verifying MongoDB Record Counts Unchanged ---")
    const docCountAfter = await db.collection("doctors").countDocuments({})
    const patCountAfter = await db.collection("patients").countDocuments({})
    const ashaCountAfter = await db.collection("asha_workers").countDocuments({})
    const symCountAfter = await db.collection("symptoms").countDocuments({})
    const consCountAfter = await db.collection("consultations").countDocuments({})
    const rxCountAfter = await db.collection("prescriptions").countDocuments({})

    console.log(`[DB FINAL] Doctors: ${docCountAfter}, Patients: ${patCountAfter}, ASHA: ${ashaCountAfter}, Symptoms: ${symCountAfter}, Consultations: ${consCountAfter}, Prescriptions: ${rxCountAfter}`)

    if (
      docCountBefore !== docCountAfter ||
      patCountBefore !== patCountAfter ||
      ashaCountBefore !== ashaCountAfter ||
      symCountBefore !== symCountAfter ||
      consCountBefore !== consCountAfter ||
      rxCountBefore !== rxCountAfter
    ) {
      throw new Error("Database counts changed during navigation test!")
    }
    console.log("  [PASS] Zero database records modified or added.")

    console.log("\n" + "=".repeat(80))
    console.log("  ALL DOCTOR PRESCRIPTION WORKFLOW TESTS PASSED!")
    console.log("=".repeat(80))

  } finally {
    if (browser) await browser.close()
    await mongoClient.close()
  }
}

runTest().catch((err) => {
  console.error("Test error:", err)
  process.exit(1)
})
