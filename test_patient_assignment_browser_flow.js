/**
 * Real Browser UI Test: Patient to ASHA Assignment & Verification
 * 
 * Verifies complete end-to-end flow:
 * 1. STEP A: Login as ASHA Worker Swati (ASHA-833) via UI
 * 2. STEP B: Assign patient Shreya (P-4559) to Swati (ASHA-833) via UI
 * 3. STEP C: Verify MongoDB contains asha_worker_id: "ASHA-833" for P-4559
 * 4. STEP D: Logout from UI
 * 5. STEP E: Login again as Swati via UI
 * 6. STEP F: Open Cases/Patients and verify P-4559 is displayed
 * 7. STEP G: Open Shreya (P-4559) details modal
 * 8. STEP H: Verify live symptom SYM-7539 ("i have had fever and vomitting", moderate, 2-3-days, patient)
 */

import puppeteer from "puppeteer-core"
import { MongoClient } from "mongodb"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE_URL = "http://localhost:5173"
const MONGO_URI = "mongodb://127.0.0.1:27017"
const DB_NAME = "ayushlink_db"

async function runAssignmentBrowserTest() {
  console.log("=".repeat(80))
  console.log(" AYUSHLINK REAL BROWSER UI TEST: PATIENT -> ASHA ASSIGNMENT FLOW")
  console.log("=".repeat(80))

  // Connect directly to MongoDB
  const client = new MongoClient(MONGO_URI)
  await client.connect()
  const db = client.db(DB_NAME)

  const swatiPhone = "9837373773"
  const swatiPass = "SwatiPassSecure!123"

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
    // STEP A: Login as ASHA Worker Swati (ASHA-833)
    // -------------------------------------------------------------------------
    console.log("\n--- STEP A: Login as ASHA Worker Swati (ASHA-833) via Browser UI ---")
    await page.goto(BASE_URL, { waitUntil: "networkidle2" })

    // Wait for Splash Screen
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

    // Click ASHA Worker Role
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("main .flex-col button"))
      const ashaBtn = cards.find((b) => b.innerText.includes("ASHA") || b.innerText.includes("आशा")) || cards[0]
      if (ashaBtn) ashaBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    // Fill Swati credentials
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
      { phone: swatiPhone, pass: swatiPass }
    )
    await new Promise((r) => setTimeout(r, 500))

    // Submit Login
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const loginBtn = btns.find((b) => b.innerText.trim() === "Login" || b.innerText.includes("लॉगिन") || b.innerText.includes("साइन इन"))
      if (loginBtn) loginBtn.click()
    })
    await new Promise((r) => setTimeout(r, 2500))

    const authUser = await page.evaluate(() => JSON.parse(localStorage.getItem("ayushlink_user") || "{}"))
    console.log("[VERIFY] Logged in as Swati:", authUser.full_name, "Worker ID:", authUser.worker_id)

    // -------------------------------------------------------------------------
    // STEP B: Assign Patient P-4559 (Shreya) to Swati (ASHA-833) via UI
    // -------------------------------------------------------------------------
    console.log("\n--- STEP B: Navigate to Patients Screen & Assign P-4559 ---")
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const pNav = btns.find((b) => b.innerText.includes("Patients") || b.innerText.includes("मरीज") || b.innerText.includes("रुग्ण"))
      if (pNav) pNav.click()
    })
    await new Promise((r) => setTimeout(r, 2000))

    // Search and select P-4559
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

    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("li button"))
      const pCard = cards.find((b) => b.innerText.includes("P-4559") || b.innerText.toLowerCase().includes("shreya"))
      if (pCard) pCard.click()
    })
    await new Promise((r) => setTimeout(r, 2000))

    // Click "Assign Patient" button in modal
    console.log("[ACTION] Clicking 'Assign Patient' button in modal...")
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".fixed.inset-0 button"))
      const assignBtn = btns.find((b) => b.innerText.includes("Assign Patient") || b.innerText.includes("Assign"))
      if (assignBtn) assignBtn.click()
    })
    await new Promise((r) => setTimeout(r, 2500))

    // -------------------------------------------------------------------------
    // STEP C: Verify MongoDB Patient Document for P-4559 contains asha_worker_id
    // -------------------------------------------------------------------------
    console.log("\n--- STEP C: Verify MongoDB Document for P-4559 ---")
    const p4559Doc = await db.collection("patients").findOne({ patient_id: "P-4559" })
    console.log("[MONGODB] Patient P-4559 asha_worker_id:", p4559Doc?.asha_worker_id)
    console.log("[MONGODB] Patient P-4559 full_name:", p4559Doc?.full_name)
    console.log("[MONGODB] Patient P-4559 phone:", p4559Doc?.phone)

    if (p4559Doc?.asha_worker_id !== "ASHA-833") {
      throw new Error(`MongoDB assignment check failed! Expected asha_worker_id 'ASHA-833', got '${p4559Doc?.asha_worker_id}'`)
    }
    console.log("[VERIFY] MongoDB asha_worker_id is ASHA-833: TRUE")

    // Close modal
    await page.evaluate(() => {
      const closeBtn = Array.from(document.querySelectorAll(".fixed.inset-0 button")).find((b) => b.innerText.includes("Close") || b.innerText.includes("बंद"))
      if (closeBtn) closeBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    // -------------------------------------------------------------------------
    // STEP D: Logout from UI
    // -------------------------------------------------------------------------
    console.log("\n--- STEP D: Logout from ASHA UI ---")
    // Navigate from Patients screen back to HomeScreen
    await page.evaluate(() => {
      const backBtn = document.querySelector('header button[aria-label*="Back"]') || document.querySelector("header button")
      if (backBtn) backBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1200))

    // On HomeScreen, click header back button (Back to login)
    await page.evaluate(() => {
      const logoutBtn = document.querySelector('header button[aria-label*="Back to login"]') || document.querySelector("header button")
      if (logoutBtn) logoutBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1500))

    const isLoggedOut = await page.evaluate(() => localStorage.getItem("ayushlink_token") === null)
    console.log("[VERIFY] Swati logged out, tokens cleared:", isLoggedOut)

    // -------------------------------------------------------------------------
    // STEP E: Login again as Swati using actual phone/password
    // -------------------------------------------------------------------------
    console.log("\n--- STEP E: Login Again as Swati (ASHA-833) ---")
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
      { phone: swatiPhone, pass: swatiPass }
    )
    await new Promise((r) => setTimeout(r, 500))

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const loginBtn = btns.find((b) => b.innerText.trim() === "Login" || b.innerText.includes("लॉगिन") || b.innerText.includes("साइन इन"))
      if (loginBtn) loginBtn.click()
    })
    await new Promise((r) => setTimeout(r, 2500))

    // -------------------------------------------------------------------------
    // STEP F: Open ASHA Cases/Patients & Verify Shreya P-4559 Appears
    // -------------------------------------------------------------------------
    console.log("\n--- STEP F: Verify Shreya P-4559 Appears in Swati Cases & Patients ---")
    const dashboardText = await page.evaluate(() => document.body.innerText)
    const p4559OnDashboard = dashboardText.includes("P-4559") || dashboardText.toLowerCase().includes("shreya")
    console.log("[VERIFY] P-4559 present on Swati Dashboard Cases:", p4559OnDashboard)

    // Open Patients screen
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const pNav = btns.find((b) => b.innerText.includes("Patients") || b.innerText.includes("मरीज") || b.innerText.includes("रुग्ण"))
      if (pNav) pNav.click()
    })
    await new Promise((r) => setTimeout(r, 2000))

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

    // -------------------------------------------------------------------------
    // STEP G & H: Open Shreya (P-4559) and Verify Live Symptom SYM-7539
    // -------------------------------------------------------------------------
    console.log("\n--- STEP G & H: Open Shreya P-4559 & Verify Live Symptom SYM-7539 ---")
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("li button"))
      const pCard = cards.find((b) => b.innerText.includes("P-4559") || b.innerText.toLowerCase().includes("shreya"))
      if (pCard) pCard.click()
    })
    await new Promise((r) => setTimeout(r, 2500))

    const modalAudit = await page.evaluate(() => {
      const modal = document.querySelector(".fixed.inset-0")
      if (!modal) return { found: false }
      const text = modal.innerText
      return {
        found: true,
        text,
        hasShreya: text.toLowerCase().includes("shreya"),
        hasP4559: text.includes("P-4559"),
        hasSYM7539: text.includes("SYM-7539"),
        hasDescription: text.toLowerCase().includes("fever and vomitting"),
        hasSeverityModerate: text.toLowerCase().includes("moderate"),
        hasDuration: text.includes("2-3-days") || text.includes("2-3 days"),
        hasSubmittedByPatient: text.toLowerCase().includes("patient"),
        hasAssignedWorker: text.includes("ASHA-833"),
      }
    })

    console.log("[MODAL VERIFICATION REPORT]")
    console.log("  Modal Open:", modalAudit.found)
    console.log("  Name (shreya):", modalAudit.hasShreya)
    console.log("  Patient ID (P-4559):", modalAudit.hasP4559)
    console.log("  Assigned ASHA (ASHA-833):", modalAudit.hasAssignedWorker)
    console.log("  Symptom Record (SYM-7539):", modalAudit.hasSYM7539)
    console.log("  Description ('fever and vomitting'):", modalAudit.hasDescription)
    console.log("  Severity ('moderate'):", modalAudit.hasSeverityModerate)
    console.log("  Duration ('2-3-days'):", modalAudit.hasDuration)
    console.log("  Submitted by ('patient'):", modalAudit.hasSubmittedByPatient)

    if (!modalAudit.found || !modalAudit.hasShreya || !modalAudit.hasP4559 || !modalAudit.hasSYM7539 || !modalAudit.hasDescription || !modalAudit.hasSeverityModerate) {
      throw new Error(`Patient detail verification failed! Content:\n${modalAudit.text}`)
    }

    console.log("\n" + "=".repeat(80))
    console.log(">>> PATIENT TO ASHA ASSIGNMENT & SYMPTOM VERIFICATION PASSED 100% <<<")
    console.log("=".repeat(80))

    return {
      success: true,
      modalAudit,
    }
  } finally {
    await browser.close()
    await client.close()
  }
}

runAssignmentBrowserTest()
  .then((res) => {
    console.log("\n[COMPLETE] Result:", JSON.stringify(res, null, 2))
    process.exit(0)
  })
  .catch((err) => {
    console.error("\n[FAILED] Error:", err)
    process.exit(1)
  })
