import puppeteer from "puppeteer-core"
import { MongoClient } from "mongodb"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE_URL = "http://localhost:5173"
const MONGO_URI = "mongodb://127.0.0.1:27017"
const DB_NAME = "ayushlink_db"

async function runTest() {
  console.log("=".repeat(80))
  console.log("  DOCTOR DASHBOARD BANNER REMOVAL AUDIT TEST")
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

    // --- STEP 2: Verify Hotline Banner is Completely Removed ---
    console.log("\n--- STEP 2: Verifying Teleconsultation Hotline Banner is Removed ---")
    const dashboardText = await page.evaluate(() => {
      const main = document.querySelector("main") || document.body
      return main.innerText
    })

    const hasHotlineTitle = dashboardText.toLowerCase().includes("teleconsultation hotline")
    const hasHotlineNumber = dashboardText.includes("93721 87882") || dashboardText.includes("9372187882")
    const hasCallNowButton = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("main button"))
      return btns.some((b) => b.textContent.trim() === "Call Now")
    })

    console.log("  Contains 'Teleconsultation Hotline':", hasHotlineTitle)
    console.log("  Contains phone '+91 93721 87882':", hasHotlineNumber)
    console.log("  Contains 'Call Now' button:", hasCallNowButton)

    if (hasHotlineTitle || hasHotlineNumber || hasCallNowButton) {
      throw new Error("Teleconsultation hotline banner or hardcoded phone number still present on Doctor dashboard!")
    }
    console.log("  [PASS] Hotline banner, number, and button are completely removed.")

    // --- STEP 3: Verify Doctor Profile Header Elements ---
    console.log("\n--- STEP 3: Verifying Doctor Profile & Header Controls ---")
    const headerText = await page.evaluate(() => {
      const header = document.querySelector("header")
      return header ? header.innerText : ""
    })

    const hasDoctorName = headerText.includes("Dr. Ramesh Gupta") || headerText.includes("Doctor")
    const hasSpecialization = headerText.includes("General Physician") || headerText.includes("Consultant")
    const hasOnDuty = headerText.toLowerCase().includes("on duty")
    const hasNotificationsBtn = await page.evaluate(() => {
      return !!document.querySelector("header button[aria-label='Notifications']")
    })
    const hasProfileBtn = headerText.includes("Profile")

    console.log("  Doctor Name visible in header:", hasDoctorName)
    console.log("  Specialization visible in header:", hasSpecialization)
    console.log("  'On duty' status badge visible:", hasOnDuty)
    console.log("  Notifications button present:", hasNotificationsBtn)
    console.log("  Profile button present:", hasProfileBtn)

    if (!hasDoctorName || !hasSpecialization || !hasOnDuty || !hasNotificationsBtn || !hasProfileBtn) {
      throw new Error("Header profile elements are missing or incorrect!")
    }
    console.log("  [PASS] Doctor header profile and controls are working normally.")

    // --- STEP 4: Verify Layout Natural Flow ---
    console.log("\n--- STEP 4: Verifying Natural Dashboard Layout ---")
    const hasTodayOverview = dashboardText.toLowerCase().includes("today's overview")
    const hasQueue = dashboardText.toLowerCase().includes("consultation queue") || dashboardText.toLowerCase().includes("patient consultation queue")
    const hasPatientShreya = dashboardText.toLowerCase().includes("shreya")

    console.log("  Today's Overview section visible:", hasTodayOverview)
    console.log("  Consultation Queue visible:", hasQueue)
    console.log("  Patient Shreya in queue:", hasPatientShreya)

    if (!hasTodayOverview || !hasQueue || !hasPatientShreya) {
      throw new Error("Dashboard sections not rendering properly after banner removal!")
    }
    console.log("  [PASS] Layout flows naturally into Today's Overview and Patient Queue.")

    // --- STEP 5: Verify Database Invariance ---
    console.log("\n--- STEP 5: Verifying MongoDB Record Counts Unchanged ---")
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
      throw new Error("Database record count changed during banner removal test!")
    }
    console.log("  [PASS] Zero database records modified or added.")

    console.log("\n" + "=".repeat(80))
    console.log("  ALL DOCTOR DASHBOARD TESTS PASSED!")
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
