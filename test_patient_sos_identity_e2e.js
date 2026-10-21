import puppeteer from "puppeteer-core"
import { MongoClient } from "mongodb"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE_URL = "http://localhost:5173"
const MONGO_URL = "mongodb://localhost:27017"

async function runTest() {
  console.log("================================================================")
  console.log("AYUSHLINK — E2E BROWSER TEST: PATIENT IDENTITY & SOS FLOW")
  console.log("================================================================")

  const mongoClient = new MongoClient(MONGO_URL)
  await mongoClient.connect()
  const db = mongoClient.db("ayushlink_db")

  // Clean active alerts before test
  await db.collection("emergency_alerts").delete_many?.({
    status: { $in: ["SOS_TRIGGERED", "LORA_TRANSMITTED", "GATEWAY_RECEIVED", "ASHA_NOTIFIED"] }
  }) || await db.collection("emergency_alerts").deleteMany({
    status: { $in: ["SOS_TRIGGERED", "LORA_TRANSMITTED", "GATEWAY_RECEIVED", "ASHA_NOTIFIED"] }
  })

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,800"],
  })

  try {
    const patientPage = await browser.newPage()
    await patientPage.setViewport({ width: 1280, height: 800 })

    console.log("\n--- STEP 1: Navigate to AyushLink Patient Login ---")
    await patientPage.goto(BASE_URL, { waitUntil: "networkidle2" })
    await new Promise((r) => setTimeout(r, 2600))

    // Clear storage to start fresh
    await patientPage.evaluate(() => localStorage.clear())
    await patientPage.reload({ waitUntil: "networkidle2" })
    await new Promise((r) => setTimeout(r, 2600))

    // Click Get Started
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const getStarted = btns.find((b) => b.innerText.includes("Get Started") || b.innerText.includes("Continue"))
      if (getStarted) getStarted.click()
    })
    await new Promise((r) => setTimeout(r, 800))

    // Select Patient Role
    console.log("Selecting Patient Role...")
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const patientBtn = btns.find((b) => b.innerText.includes("Patient") || b.innerText.includes("मरीज"))
      if (patientBtn) patientBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    // Enter Patient phone & password using React property descriptor setters
    console.log("Entering credentials for Shreya (9324998108)...")
    await patientPage.evaluate(() => {
      function setVal(input, val) {
        if (!input) return
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
        setter.call(input, val)
        input.dispatchEvent(new Event("input", { bubbles: true }))
        input.dispatchEvent(new Event("change", { bubbles: true }))
      }

      const telInput = document.querySelector('input[type="tel"]')
      if (telInput) setVal(telInput, "9324998108")

      const passInput = document.querySelector('input[type="password"]')
      if (passInput) setVal(passInput, "123456")
    })
    await new Promise((r) => setTimeout(r, 600))

    // Click Sign In
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const submitBtn = btns.find((b) => b.innerText.includes("Login") || b.innerText.includes("Sign In") || b.innerText.includes("लॉगिन") || b.type === "submit")
      if (submitBtn) submitBtn.click()
    })
    await new Promise((r) => setTimeout(r, 3000))

    // Check Patient Home Screen
    console.log("\n--- STEP 2: Verify Patient Home Screen Identity ---")
    const homeText = await patientPage.evaluate(() => document.body.innerText)
    console.log("Patient Home snippet:", homeText.slice(0, 300).replace(/\n+/g, " "))
    const hasShreya = homeText.toLowerCase().includes("shreya")
    const hasP4559 = homeText.includes("P-4559") || homeText.includes("4559")
    const hasDrArvindAsPatient = homeText.includes("Dr Arvind") || homeText.includes("Dr. Arvind")
    console.log(`  [CHECK] Patient shows Shreya: ${hasShreya}`)
    console.log(`  [CHECK] No Dr Arvind as Patient: ${!hasDrArvindAsPatient}`)
    if (hasDrArvindAsPatient) {
      throw new Error("FAIL: 'Dr Arvind' was found on the Patient Home Screen!")
    }

    // Navigate to SOS Screen
    console.log("\n--- STEP 3: Navigate to Emergency SOS Screen ---")
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, div[role='button']"))
      const sosBtn = btns.find((b) => b.innerText.includes("SOS") || b.innerText.includes("Emergency") || b.innerText.includes("आपातकालीन"))
      if (sosBtn) sosBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1500))

    // Find SOS hold button and hold for 5.2 seconds
    console.log("\n--- STEP 4: Trigger Online Emergency SOS (5-second hold) ---")
    const sosBtnBox = await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.innerText.includes("HOLD FOR 5 SECONDS") || b.innerText.includes("SOS") || b.innerText.includes("5 SECONDS"))
      if (!btn) return null
      const rect = btn.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    })

    if (sosBtnBox) {
      console.log("Pressing SOS button at:", sosBtnBox.x, sosBtnBox.y)
      await patientPage.mouse.move(sosBtnBox.x, sosBtnBox.y)
      await patientPage.mouse.down()
      // Hold for 5.3 seconds
      await new Promise((r) => setTimeout(r, 5300))
      await patientPage.mouse.up()
    } else {
      throw new Error("Could not find SOS hold button!")
    }

    console.log("Waiting for LoRa simulation and API response...")
    await new Promise((r) => setTimeout(r, 3500))

    const sosScreenText = await patientPage.evaluate(() => document.body.innerText)
    const isSosSent = sosScreenText.includes("SOS SENT") || sosScreenText.includes("sent successfully") || sosScreenText.includes("ASHA NOTIFIED")
    console.log(`  [CHECK] SOS Sent Confirmation in UI: ${isSosSent}`)

    // Check MongoDB for generated emergency alert
    console.log("\n--- STEP 5: Verify Emergency Alert in MongoDB ---")
    const latestAlert = await db.collection("emergency_alerts").findOne({}, { sort: { created_at: -1 } })
    console.log("  Alert ID:", latestAlert?.alert_id)
    console.log("  Patient ID:", latestAlert?.patient_id)
    console.log("  Patient Name:", latestAlert?.patient_name)
    console.log("  ASHA Worker:", latestAlert?.asha_worker_name, `(${latestAlert?.asha_worker_id})`)
    console.log("  Doctor ID:", latestAlert?.assigned_doctor_id)
    console.log("  Status:", latestAlert?.status)

    if (latestAlert?.patient_id !== "P-4559") {
      throw new Error(`FAIL: Expected patient_id 'P-4559', got '${latestAlert?.patient_id}'`)
    }
    if (latestAlert?.patient_name !== "Shreya") {
      throw new Error(`FAIL: Expected patient_name 'Shreya', got '${latestAlert?.patient_name}'`)
    }
    if (latestAlert?.patient_name.includes("Arvind")) {
      throw new Error("FAIL: 'Arvind' is in patient_name!")
    }
    console.log("  [PASS] MongoDB emergency alert strictly maps to P-4559 / Shreya.")

    // Step 6: Verify ASHA Dashboard receives and displays Shreya P-4559
    console.log("\n--- STEP 6: Verify ASHA Worker Dashboard ---")
    const ashaPage = await browser.newPage()
    await ashaPage.setViewport({ width: 1280, height: 800 })
    await ashaPage.goto(BASE_URL, { waitUntil: "networkidle2" })
    await new Promise((r) => setTimeout(r, 2600))

    // Clear ASHA page storage and login as Pooja Sharma
    await ashaPage.evaluate(() => localStorage.clear())
    await ashaPage.reload({ waitUntil: "networkidle2" })
    await new Promise((r) => setTimeout(r, 2600))

    // Click Get Started
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const getStarted = btns.find((b) => b.innerText.includes("Get Started") || b.innerText.includes("Continue"))
      if (getStarted) getStarted.click()
    })
    await new Promise((r) => setTimeout(r, 800))

    // Select ASHA Worker
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ashaBtn = btns.find((b) => b.innerText.includes("ASHA") || b.innerText.includes("आशा"))
      if (ashaBtn) ashaBtn.click()
    })
    await new Promise((r) => setTimeout(r, 800))

    // Enter ASHA phone & password
    await ashaPage.evaluate(() => {
      function setVal(input, val) {
        if (!input) return
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
        setter.call(input, val)
        input.dispatchEvent(new Event("input", { bubbles: true }))
        input.dispatchEvent(new Event("change", { bubbles: true }))
      }

      const telInput = document.querySelector('input[type="tel"]') || document.querySelector('input[type="text"]')
      if (telInput) setVal(telInput, "9876543210")

      const passInput = document.querySelector('input[type="password"]')
      if (passInput) setVal(passInput, "123456")
    })
    await new Promise((r) => setTimeout(r, 600))

    // Click Sign In
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const submitBtn = btns.find((b) => b.innerText.includes("Login") || b.innerText.includes("Sign In") || b.innerText.includes("लॉगिन") || b.type === "submit")
      if (submitBtn) submitBtn.click()
    })
    await new Promise((r) => setTimeout(r, 3000))

    const ashaText = await ashaPage.evaluate(() => document.body.innerText)
    console.log("ASHA Dashboard snippet:", ashaText.slice(0, 400).replace(/\n+/g, " "))
    const ashaHasAlert = ashaText.includes("EMERGENCY") || ashaText.includes("SOS")
    const ashaHasShreya = ashaText.includes("Shreya")
    const ashaHasP4559 = ashaText.includes("P-4559")
    const ashaHasDrArvindAsPatient = ashaText.includes("Dr. Arvind") && ashaText.includes("Patient: Dr.")
    console.log(`  [CHECK] ASHA displays Emergency Alert: ${ashaHasAlert}`)
    console.log(`  [CHECK] ASHA displays Patient Name 'Shreya': ${ashaHasShreya}`)
    console.log(`  [CHECK] ASHA displays Patient ID 'P-4559': ${ashaHasP4559}`)
    console.log(`  [CHECK] No Dr Arvind as Patient on ASHA screen: ${!ashaHasDrArvindAsPatient}`)

    if (!ashaHasShreya || !ashaHasP4559) {
      throw new Error("FAIL: ASHA dashboard did not display Shreya (P-4559) on emergency alert card!")
    }

    // Step 7: Test Offline SOS Path
    console.log("\n--- STEP 7: Test Offline Emergency SOS Path ---")
    // In patient page, trigger offline SOS
    await patientPage.evaluate(async () => {
      // Simulate offline queue via offlineDb saveOfflineItem
      const { saveOfflineItem, generateClientId, syncPendingQueue } = await import("/src/lib/offlineDb.js")
      const offlineId = generateClientId("SOS")
      await saveOfflineItem({
        type: "emergency_sos",
        client_id: offlineId,
        client_created_at: new Date().toISOString(),
        payload: {
          patient_id: "P-4559",
          patient_name: "Shreya",
          village: "Chandapur",
          emergency_type: "general_sos",
          emergency_notes: "Offline browser test SOS",
          offline_id: offlineId,
        },
      })
      // Trigger sync
      await syncPendingQueue()
    })
    await new Promise((r) => setTimeout(r, 3000))

    // Verify synced alert
    const syncedOfflineAlert = await db.collection("emergency_alerts").findOne(
      { emergency_notes: "Offline browser test SOS" },
      { sort: { created_at: -1 } }
    )
    console.log("  Offline Synced Alert ID:", syncedOfflineAlert?.alert_id)
    console.log("  Offline Synced Patient ID:", syncedOfflineAlert?.patient_id)
    console.log("  Offline Synced Patient Name:", syncedOfflineAlert?.patient_name)
    assertCondition(syncedOfflineAlert?.patient_id === "P-4559", "Offline synced patient ID must be P-4559")
    assertCondition(syncedOfflineAlert?.patient_name === "Shreya", "Offline synced patient name must be Shreya")
    console.log("  [PASS] Offline SOS sync preserved patient identity P-4559 = Shreya.")

    console.log("\n================================================================")
    console.log("🎉 ALL END-TO-END BROWSER TESTS PASSED SUCCESSFULLY!")
    console.log("================================================================")
  } finally {
    await browser.close()
    await mongoClient.close()
  }
}

function assertCondition(cond, msg) {
  if (!cond) throw new Error("Assertion Failed: " + msg)
}

runTest().catch((err) => {
  console.error("\n❌ TEST FAILED:", err)
  process.exit(1)
})
