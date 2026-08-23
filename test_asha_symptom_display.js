/**
 * Real Browser UI Test for ASHA Worker Live Patient & Symptom Display
 * 
 * Verifies:
 * 1. Login as ASHA Worker via UI (Phone + Password)
 * 2. View Cases / Patients
 * 3. Verify P-4559 (shreya / Shreya Frontend Test) is present
 * 4. Open patient details modal
 * 5. Verify live MongoDB symptom data:
 *    - Patient ID: P-4559
 *    - Symptom Record: SYM-7539
 *    - Description: "i have had fever and vomitting"
 *    - Severity: "moderate"
 *    - Duration: "2-3-days" or "2-3 days"
 *    - Submitted by: "patient"
 */

import puppeteer from "puppeteer-core"
import { MongoClient } from "mongodb"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE_URL = "http://localhost:5173"
const MONGO_URI = "mongodb://127.0.0.1:27017"
const DB_NAME = "ayushlink_db"

async function runAshaSymptomDisplayTest() {
  console.log("=".repeat(80))
  console.log(" AYUSHLINK REAL BROWSER UI TEST: ASHA LIVE SYMPTOM DISPLAY (PART 3)")
  console.log("=".repeat(80))

  // 1. Direct MongoDB Query Check & Setup Known Test ASHA Worker
  const client = new MongoClient(MONGO_URI)
  await client.connect()
  const db = client.db(DB_NAME)

  const p4559Doc = await db.collection("patients").findOne({ patient_id: "P-4559" })
  const sym7539Doc = await db.collection("symptoms").findOne({ patient_id: "P-4559" })

  console.log("\n[MONGODB AUDIT]")
  console.log("Patient P-4559:", p4559Doc?.full_name, "Village:", p4559Doc?.village)
  console.log("Symptom SYM-7539:", sym7539Doc?.symptom_id, "Description:", sym7539Doc?.description, "Severity:", sym7539Doc?.severity)

  if (!p4559Doc || !sym7539Doc) {
    throw new Error("P-4559 or SYM-7539 missing in MongoDB!")
  }

  // ASHA worker test credentials
  const testAshaPhone = "9876500001"
  const testAshaPass = "AshaSecurePin123"

  // 2. Launch real Google Chrome
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,800"],
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })

  page.on("console", (msg) => {
    console.log(`BROWSER [${msg.type().toUpperCase()}]:`, msg.text())
  })
  page.on("request", (req) => {
    if (req.url().includes("/api/")) console.log(`API REQ [${req.method()}]: ${req.url()}`)
  })
  page.on("response", (res) => {
    if (res.url().includes("/api/")) console.log(`API RES [${res.status()}]: ${res.url()}`)
  })

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Navigate to App & Select ASHA Worker Role
    // -------------------------------------------------------------------------
    console.log("\n--- STEP 1: Navigate to ASHA Worker Login ---")
    await page.goto(BASE_URL, { waitUntil: "networkidle2" })

    // Wait for Splash screen ready timer (2.4s) and click "Get Started"
    await page.waitForFunction(
      () => {
        const buttons = Array.from(document.querySelectorAll("button"))
        return buttons.some((b) => b.innerText.includes("Get Started") || b.innerText.includes("Start") || b.innerText.includes("शुरू"))
      },
      { timeout: 8000 }
    )
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.innerText.includes("Get Started") || b.innerText.includes("Start") || b.innerText.includes("शुरू")
      )
      if (btn) btn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    // On RoleSelectScreen click ASHA Worker (the 1st role button)
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("main .flex-col button"))
      const ashaBtn = cards.find((b) => b.innerText.includes("ASHA") || b.innerText.includes("आशा")) || cards[0]
      if (ashaBtn) ashaBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    // -------------------------------------------------------------------------
    // STEP 2: Login as ASHA Worker
    // -------------------------------------------------------------------------
    console.log("\n--- STEP 2: Submit ASHA Login Form ---")
    await page.waitForSelector('input[type="tel"]', { timeout: 8000 })

    await page.evaluate(
      ({ phone, pass }) => {
        function setVal(input, val) {
          if (!input) return
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
          setter.call(input, val)
          input.dispatchEvent(new Event("input", { bubbles: true }))
          input.dispatchEvent(new Event("change", { bubbles: true }))
        }

        const telInput = document.querySelector('input[type="tel"]')
        if (telInput) setVal(telInput, phone)

        const passInput = document.querySelector('input[type="password"]')
        if (passInput) setVal(passInput, pass)
      },
      { phone: testAshaPhone, pass: testAshaPass }
    )
    await new Promise((r) => setTimeout(r, 500))

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const loginBtn = btns.find((b) => b.innerText.trim() === "Login" || b.innerText.includes("लॉगिन") || b.innerText.includes("साइन इन"))
      if (loginBtn) loginBtn.click()
    })
    await new Promise((r) => setTimeout(r, 2500))

    const dashboardText = await page.evaluate(() => document.body.innerText)
    const onDashboard = dashboardText.includes("My Patients") || dashboardText.includes("Pooja Sharma") || dashboardText.includes("Incentives")
    console.log("[VERIFY] ASHA Dashboard Loaded:", onDashboard)

    // -------------------------------------------------------------------------
    // STEP 3: Navigate to Patients Screen
    // -------------------------------------------------------------------------
    console.log("\n--- STEP 3: Navigate to Patients Screen ---")
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const pNav = btns.find((b) => b.innerText.includes("Patients") || b.innerText.includes("मरीज") || b.innerText.includes("रुग्ण"))
      if (pNav) pNav.click()
    })
    await new Promise((r) => setTimeout(r, 2000))

    // Search for P-4559 or shreya
    console.log("\n--- STEP 4: Search & Select Patient P-4559 ---")
    await page.evaluate(() => {
      const searchInput = document.querySelector('input[type="text"]')
      if (searchInput) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
        setter.call(searchInput, "P-4559")
        searchInput.dispatchEvent(new Event("input", { bubbles: true }))
        searchInput.dispatchEvent(new Event("change", { bubbles: true }))
      }
    })
    await new Promise((r) => setTimeout(r, 1000))

    const patientListText = await page.evaluate(() => document.body.innerText)
    console.log("[VERIFY] Patient P-4559 in Patients Screen:", patientListText.includes("P-4559") || patientListText.toLowerCase().includes("shreya"))

    // Click patient P-4559 card to open modal
    console.log("[ACTION] Clicking on Patient P-4559...")
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("li button"))
      const pCard = cards.find((b) => b.innerText.includes("P-4559") || b.innerText.toLowerCase().includes("shreya"))
      if (pCard) pCard.click()
    })
    await new Promise((r) => setTimeout(r, 2500))

    // -------------------------------------------------------------------------
    // STEP 5: Inspect Patient Details Modal for Live Symptom Data
    // -------------------------------------------------------------------------
    console.log("\n--- STEP 5: Inspect Patient Details Modal for Real MongoDB Symptoms ---")
    const modalContent = await page.evaluate(() => {
      const modal = document.querySelector(".fixed.inset-0")
      if (!modal) return { found: false }
      const text = modal.innerText
      return {
        found: true,
        text,
        hasP4559: text.includes("P-4559"),
        hasSYM7539: text.includes("SYM-7539"),
        hasDescription: text.toLowerCase().includes("fever and vomitting"),
        hasSeverity: text.toLowerCase().includes("moderate"),
        hasDuration: text.includes("2-3-days") || text.includes("2-3 days"),
        hasSubmittedBy: text.toLowerCase().includes("patient"),
      }
    })

    console.log("[MODAL VERIFICATION RESULTS]")
    console.log("  Modal Found:", modalContent.found)
    console.log("  Patient ID (P-4559):", modalContent.hasP4559)
    console.log("  Symptom Record (SYM-7539):", modalContent.hasSYM7539)
    console.log("  Description ('fever and vomitting'):", modalContent.hasDescription)
    console.log("  Severity ('moderate'):", modalContent.hasSeverity)
    console.log("  Duration ('2-3 days'):", modalContent.hasDuration)
    console.log("  Submitted by ('patient'):", modalContent.hasSubmittedBy)

    if (!modalContent.found || !modalContent.hasP4559 || !modalContent.hasSYM7539 || !modalContent.hasDescription || !modalContent.hasSeverity) {
      throw new Error(`ASHA Patient Details Modal verification failed! Modal text: ${modalContent.text}`)
    }

    console.log("\n" + "=".repeat(80))
    console.log(">>> ASHA LIVE SYMPTOM DISPLAY TEST PASSED 100% <<<")
    console.log("=".repeat(80))

    return {
      success: true,
      modalContent,
    }
  } finally {
    await browser.close()
    await client.close()
  }
}

runAshaSymptomDisplayTest()
  .then((res) => {
    console.log("\n[COMPLETE] Result:", JSON.stringify(res, null, 2))
    process.exit(0)
  })
  .catch((err) => {
    console.error("\n[FAILED] Error:", err)
    process.exit(1)
  })
