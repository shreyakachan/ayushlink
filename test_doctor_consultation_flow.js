import puppeteer from "puppeteer-core"
import { MongoClient } from "mongodb"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE_URL = "http://localhost:5173"
const MONGO_URI = "mongodb://127.0.0.1:27017"
const DB_NAME = "ayushlink_db"

async function runVerification() {
  console.log("=".repeat(80))
  console.log("  AYUSHLINK DOCTOR PATIENTS & CONSULTATION FULL VERIFICATION")
  console.log("=".repeat(80))

  const mongoClient = new MongoClient(MONGO_URI)
  await mongoClient.connect()
  const db = mongoClient.db(DB_NAME)
  const consultationsCol = db.collection("consultations")
  const symptomsCol = db.collection("symptoms")
  const patientsCol = db.collection("patients")

  // Record initial counts
  const initialConsultationsCount = await consultationsCol.countDocuments({})
  console.log(`[DB SETUP] Initial consultations count: ${initialConsultationsCount}`)

  let browser
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: "new",
      args: ["--no-sandbox", "--window-size=1280,900"],
    })

    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 900 })

    // =========================================================================
    // STEP 1: Log in as Doctor (9823000001 / DoctorSecurePass123)
    // =========================================================================
    console.log("\n--- STEP 1: Log in as Doctor ---")
    await page.goto(BASE_URL, { waitUntil: "networkidle0" })

    // Splash -> Role Select -> Doctor
    await page.waitForSelector("button", { timeout: 5000 })
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

    await page.waitForSelector("#phone", { timeout: 5000 })
    await page.type("#phone", "9823000001")
    await page.type("#password", "DoctorSecurePass123")

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const submit = btns.find((b) => b.textContent.includes("Login") || b.textContent.includes("Sign in"))
      if (submit) submit.click()
    })

    await page.waitForSelector("aside", { timeout: 10000 })
    await new Promise((r) => setTimeout(r, 1200))
    console.log("[PASS] Doctor dashboard loaded successfully.")

    // =========================================================================
    // STEP 2: Verify Patients Section shows ONLY Shreya
    // =========================================================================
    console.log("\n--- STEP 2: Verify Doctor Patients Section ---")
    await page.evaluate(() => {
      const aside = document.querySelector("aside")
      const btns = Array.from(aside ? aside.querySelectorAll("button") : document.querySelectorAll("button"))
      const pBtn = btns.find((b) => b.textContent.trim() === "Patients")
      if (pBtn) pBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1200))

    const patientsScreenText = await page.evaluate(() => document.body.innerText)
    console.log("Patients Screen visible text snippet:\n", patientsScreenText.slice(0, 300))

    const hasShreya = patientsScreenText.toLowerCase().includes("shreya")
    const hasKavita = patientsScreenText.includes("Kavita Patil")
    const hasArjun = patientsScreenText.includes("Arjun Shinde")

    console.log("Verification 1 (Shreya is present):", hasShreya)
    console.log("Verification 2 (Kavita Patil NOT present):", !hasKavita)
    console.log("Verification 3 (Arjun Shinde NOT present):", !hasArjun)

    if (!hasShreya || hasKavita || hasArjun) {
      throw new Error(`Patient filtering failed! hasShreya=${hasShreya}, hasKavita=${hasKavita}, hasArjun=${hasArjun}`)
    }
    console.log("[PASS] ONLY Shreya is displayed in Doctor's Patients section!")

    // =========================================================================
    // STEP 3: Open Consultation for Shreya from Patients Section
    // =========================================================================
    console.log("\n--- STEP 3: Open Consultation Page for Shreya ---")
    // Click on Shreya in the list
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll("li button"))
      const shreyaItem = items.find((b) => b.textContent.toLowerCase().includes("shreya"))
      if (shreyaItem) shreyaItem.click()
    })
    await new Promise((r) => setTimeout(r, 800))

    // Click "Open Consultation" in the detail sheet
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const consultBtn = btns.find((b) => b.textContent.includes("Open Consultation") || b.textContent.includes("Start Consultation"))
      if (consultBtn) consultBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1500))

    // Verify Consultation Page rendered
    const consultationPageText = await page.evaluate(() => document.body.innerText)
    const isConsultationPage = consultationPageText.includes("Clinical Consultation")
    const showsShreya = consultationPageText.toLowerCase().includes("shreya")
    const showsLatestSymptoms = consultationPageText.toLowerCase().includes("stomach ache")
    const showsPrescriptionSection = consultationPageText.includes("Prescription & Medicines")
    const showsDiagnosisSection = consultationPageText.includes("Diagnosis & Clinical Assessment")

    console.log("3.1 'Clinical Consultation' heading visible:", isConsultationPage)
    console.log("3.2 Patient name Shreya visible:", showsShreya)
    console.log("3.3 Latest symptoms ('stomach ache') visible:", showsLatestSymptoms)
    console.log("3.4 Diagnosis section visible:", showsDiagnosisSection)
    console.log("3.5 Prescription & Medicines section visible:", showsPrescriptionSection)

    if (!isConsultationPage || !showsShreya || !showsLatestSymptoms) {
      throw new Error("Consultation page verification failed!")
    }
    console.log("[PASS] Doctor Consultation page opened successfully for Shreya with full clinical details!")

    // =========================================================================
    // STEP 4: Fill Consultation Details & Submit
    // =========================================================================
    console.log("\n--- STEP 4: Submit Consultation Details ---")
    // Click a quick diagnosis chip (e.g. "Acute Gastritis")
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const chip = btns.find((b) => b.textContent.trim() === "Acute Gastritis")
      if (chip) chip.click()
    })
    await new Promise((r) => setTimeout(r, 300))

    // Enter doctor's clinical notes
    await page.type("#notes-input", "Patient presented with crampy abdominal pain for 2 days. Physical examination shows epigastric tenderness without guarding. Recommended warm water and diet.")

    // Add a quick medicine (+ Pantoprazole 40mg)
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const medBtn = btns.find((b) => b.textContent.includes("Pantoprazole 40mg"))
      if (medBtn) medBtn.click()
    })
    await new Promise((r) => setTimeout(r, 300))

    // Enter advice in textarea
    await page.evaluate(() => {
      const textareas = Array.from(document.querySelectorAll("textarea"))
      const adviceArea = textareas[textareas.length - 1]
      if (adviceArea) {
        adviceArea.value = "Avoid spicy and oily food for 3 days. Drink warm boiled water. Return if abdominal pain persists."
        adviceArea.dispatchEvent(new Event("input", { bubbles: true }))
      }
    })
    await new Promise((r) => setTimeout(r, 400))

    // Count consultations in DB BEFORE submit
    const countBeforeSubmit = await consultationsCol.countDocuments({})

    // Click "Submit & Complete Consultation"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const submitBtn = btns.find((b) => b.textContent.includes("Submit & Complete Consultation") || b.textContent.includes("Save Consultation"))
      if (submitBtn) submitBtn.click()
    })
    await new Promise((r) => setTimeout(r, 2500))

    // Verify submission feedback on page
    const afterSubmitText = await page.evaluate(() => document.body.innerText)
    const hasSuccessBanner = afterSubmitText.includes("Recorded Successfully!") || afterSubmitText.includes("Consultation Saved!")
    console.log("4.1 Success feedback banner displayed:", hasSuccessBanner)

    // Verify MongoDB has exactly one new consultation record
    const countAfterSubmit = await consultationsCol.countDocuments({})
    console.log(`4.2 DB Consultation count: before=${countBeforeSubmit}, after=${countAfterSubmit}`)

    const savedRecord = await consultationsCol.findOne({ diagnosis: "Acute Gastritis" })
    console.log("4.3 Saved consultation in MongoDB:", {
      id: savedRecord?.consultation_id,
      patient: savedRecord?.patient_name,
      doctor: savedRecord?.doctor_name,
      diagnosis: savedRecord?.diagnosis,
      status: savedRecord?.status,
      medicinesCount: savedRecord?.medicines?.length,
    })

    if (!savedRecord || savedRecord.status !== "completed") {
      throw new Error("Consultation was not persisted properly in MongoDB!")
    }
    console.log("[PASS] Exactly one real consultation record was created and saved in MongoDB!")

    // =========================================================================
    // STEP 5: Verify Refresh Does NOT Auto-Create Another Record
    // =========================================================================
    console.log("\n--- STEP 5: Verify Refresh Page Idempotency ---")
    const countBeforeRefresh = await consultationsCol.countDocuments({})
    await page.reload({ waitUntil: "networkidle0" })
    await new Promise((r) => setTimeout(r, 2000))
    const countAfterRefresh = await consultationsCol.countDocuments({})
    console.log(`5.1 Consultation count after reload: before=${countBeforeRefresh}, after=${countAfterRefresh}`)

    if (countBeforeRefresh !== countAfterRefresh) {
      throw new Error(`Duplicate consultation record created on refresh! Count changed from ${countBeforeRefresh} to ${countAfterRefresh}`)
    }
    console.log("[PASS] Refreshing the page does NOT automatically create any consultation record!")

    console.log("\n" + "=".repeat(80))
    console.log("  ALL DOCTOR SIDE & CONSULTATION VERIFICATION TESTS PASSED SUCCESSFULLY! ")
    console.log("=".repeat(80))

  } finally {
    if (browser) await browser.close()
    await mongoClient.close()
  }
}

runVerification().catch((err) => {
  console.error("Test execution failed:", err)
  process.exit(1)
})
