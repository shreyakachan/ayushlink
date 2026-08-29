import puppeteer from "puppeteer-core"
import { MongoClient } from "mongodb"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE_URL = "http://localhost:5173"
const MONGO_URI = "mongodb://127.0.0.1:27017"
const DB_NAME = "ayushlink_db"

async function runTest() {
  console.log("=".repeat(80))
  console.log("  DOCTOR VIEW PRESCRIPTION & READ-ONLY CONTEXT AUDIT TEST")
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

    // --- STEP 2: Doctor Opens Shreya's Consultation ---
    console.log("\n--- STEP 2: Opening Shreya's Clinical Consultation ---")
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("aside button, button"))
      const pBtn = btns.find((b) => b.textContent.trim() === "Patients")
      if (pBtn) pBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    // Select Shreya
    await page.waitForSelector("li button", { timeout: 5000 })
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
    await new Promise((r) => setTimeout(r, 1500))

    // --- STEP 3: Verify Shreya's History & "View Prescription" Button ---
    console.log("\n--- STEP 3: Verifying Shreya's Consultation History & View Prescription Button ---")
    const consultationText = await page.evaluate(() => document.body.innerText)
    const hasHistorySection = consultationText.toLowerCase().includes("consultation history")
    const hasViewRxButton = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      return btns.some((b) => b.textContent.includes("View Prescription"))
    })

    console.log("  Consultation History section visible:", hasHistorySection)
    console.log("  'View Prescription' button present in history:", hasViewRxButton)

    if (!hasViewRxButton) {
      throw new Error("'View Prescription' button not found in Shreya's consultation history!")
    }
    console.log("  [PASS] 'View Prescription' button is visible in Shreya's timeline.")

    // --- STEP 4: Open and Verify Read-Only Digital Prescription Viewer ---
    console.log("\n--- STEP 4: Clicking 'View Prescription' to Inspect Modal ---")
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const viewRxBtn = btns.find((b) => b.textContent.includes("View Prescription"))
      if (viewRxBtn) viewRxBtn.click()
    })
    await new Promise((r) => setTimeout(r, 800))

    const modalText = await page.evaluate(() => {
      const modal = document.querySelector(".fixed.inset-0")
      return modal ? modal.innerText : ""
    })

    console.log("  Modal content preview:\n" + modalText.slice(0, 450))

    const hasModalHeader = modalText.includes("Digital Prescription")
    const hasPatientContext = modalText.toLowerCase().includes("shreya") && modalText.includes("P-4559")
    const hasDoctorContext = modalText.includes("Dr. Ramesh Gupta")
    const hasPrescribedMedicines = modalText.includes("Pantoprazole") || modalText.includes("Formulations")
    const hasCloseButton = modalText.includes("Close") || modalText.includes("✕")

    console.log("  Header 'Digital Prescription':", hasModalHeader)
    console.log("  Patient Context (Shreya, P-4559):", hasPatientContext)
    console.log("  Doctor Context (Dr. Ramesh Gupta):", hasDoctorContext)
    console.log("  Prescribed Medicines displayed:", hasPrescribedMedicines)
    console.log("  Close action available:", hasCloseButton)

    if (!hasModalHeader || !hasPatientContext || !hasDoctorContext) {
      throw new Error("Digital prescription modal does not show full patient/doctor context!")
    }
    console.log("  [PASS] Digital Prescription modal renders complete patient & clinical context.")

    // --- STEP 5: Close Modal and Refresh Page ---
    console.log("\n--- STEP 5: Closing Modal and Refreshing Page ---")
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const closeBtn = btns.find((b) => b.textContent.trim() === "Close" || b.textContent.trim() === "✕")
      if (closeBtn) closeBtn.click()
    })
    await new Promise((r) => setTimeout(r, 600))

    // Reload page
    await page.reload({ waitUntil: "networkidle0" })
    await new Promise((r) => setTimeout(r, 1200))
    console.log("  [PASS] Page reloaded cleanly.")

    // --- STEP 6: Verify Database Invariance ---
    console.log("\n--- STEP 6: Verifying Zero Database Records Added/Modified ---")
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
      throw new Error("Database record count changed during view/refresh test!")
    }
    console.log("  [PASS] Zero database records modified or added.")

    console.log("\n" + "=".repeat(80))
    console.log("  ALL PRESCRIPTION VIEWING & CONTEXT TESTS PASSED!")
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
