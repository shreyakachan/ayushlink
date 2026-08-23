/**
 * Targeted Real-Browser UI Test for Patient Authentication Flow
 * Drives Google Chrome via Puppeteer to test:
 * 1. Register "Shreya Frontend Test" via UI
 * 2. Verify MongoDB ayushlink_db.patients document & bcrypt hashed_password
 * 3. Logout from UI
 * 4. Login "Shreya Frontend Test" via UI with Phone + Password
 * 5. Verify restored session and patient ID
 * 6. Regression: Login another patient (Kavita Patil) and verify clean session switch
 */

import puppeteer from "puppeteer-core"
import { MongoClient } from "mongodb"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE_URL = "http://localhost:5173"
const MONGO_URI = "mongodb://127.0.0.1:27017"
const DB_NAME = "ayushlink_db"

async function runPatientAuthTest() {
  console.log("=".repeat(80))
  console.log(" AYUSHLINK REAL BROWSER UI TEST: PATIENT AUTHENTICATION & MONGODB")
  console.log("=".repeat(80))

  // 1. Connect directly to MongoDB
  const client = new MongoClient(MONGO_URI)
  await client.connect()
  const db = client.db(DB_NAME)
  const patientsCol = db.collection("patients")

  // Generate unique test credentials
  const uid = Date.now() % 100000
  const testPhone = "98230" + String(uid).padStart(5, "0")
  const testPassword = "ShreyaPassSecure!99"
  const testName = "Shreya Frontend Test"
  const testVillage = "Chandapur"

  // Clean previous tests for this test name
  await patientsCol.deleteMany({ full_name: testName })

  console.log(`[SETUP] Unique test phone: +91 ${testPhone}`)
  console.log(`[SETUP] Test password: ${testPassword}`)

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
    // STEP 1: Navigate to App & Inspect Login Screen
    // -------------------------------------------------------------------------
    console.log("\n--- STEP 1: Inspect Patient Login Screen (Zero OTP) ---")
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

    // On RoleSelectScreen click Patient (the 3rd role button)
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("main .flex-col button"))
      const pBtn = cards.find((b) => b.innerText.includes("Patient") || b.innerText.includes("मरीज") || b.innerText.includes("रुग्ण")) || cards[2]
      if (pBtn) pBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    // Wait for PatientLoginScreen inputs
    await page.waitForSelector('input[type="tel"]', { timeout: 8000 })

    const loginUiCheck = await page.evaluate(() => {
      const text = document.body.innerText
      const phoneInput = !!document.querySelector('input[type="tel"]')
      const passInput = !!document.querySelector('input[type="password"]')
      const otpInput = !!document.querySelector('input[placeholder*="OTP"]')
      const offlinePinBtn = text.includes("Use offline PIN") || text.includes("ऑफ़लाइन पिन")
      return { phoneInput, passInput, otpInput, offlinePinBtn }
    })

    console.log("[VERIFY] Phone input present:", loginUiCheck.phoneInput)
    console.log("[VERIFY] Password input present:", loginUiCheck.passInput)
    console.log("[VERIFY] Zero OTP inputs:", !loginUiCheck.otpInput)
    console.log("[VERIFY] Zero Offline PIN button:", !loginUiCheck.offlinePinBtn)

    if (!loginUiCheck.phoneInput || !loginUiCheck.passInput || loginUiCheck.otpInput || loginUiCheck.offlinePinBtn) {
      throw new Error("Patient Login Screen UI check failed!")
    }

    // -------------------------------------------------------------------------
    // STEP 2: Navigate to Create Account Screen
    // -------------------------------------------------------------------------
    console.log("\n--- STEP 2: Navigate to Patient Create Account ---")
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const regLink = btns.find((b) => b.innerText.includes("Create Account") || b.innerText.includes("खाता बनाएं") || b.innerText.includes("खाते तयार करा"))
      if (regLink) regLink.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    // Fill registration form
    await page.evaluate(
      ({ name, phone, pass, village }) => {
        function setVal(input, val) {
          if (!input) return
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
          setter.call(input, val)
          input.dispatchEvent(new Event("input", { bubbles: true }))
          input.dispatchEvent(new Event("change", { bubbles: true }))
        }

        const textInputs = document.querySelectorAll('form input[type="text"]')
        if (textInputs[0]) setVal(textInputs[0], name) // Full name

        const telInput = document.querySelector('form input[type="tel"]')
        if (telInput) setVal(telInput, phone) // Phone

        const passInput = document.querySelector('form input[type="password"]')
        if (passInput) setVal(passInput, pass) // Password

        const numInput = document.querySelector('form input[type="number"]')
        if (numInput) setVal(numInput, "28") // Age

        // Gender: click Female button
        const genderBtns = Array.from(document.querySelectorAll("form button")).filter(
          (b) => b.innerText.includes("Female") || b.innerText.includes("महिला") || b.innerText.includes("स्त्री")
        )
        if (genderBtns[0]) genderBtns[0].click()

        if (textInputs[1]) setVal(textInputs[1], village) // Village
      },
      { name: testName, phone: testPhone, pass: testPassword, village: testVillage }
    )
    await new Promise((r) => setTimeout(r, 500))

    // Submit registration form
    console.log("[ACTION] Submitting Registration Form...")
    await page.evaluate(() => {
      const submitBtn =
        document.querySelector('form button[type="submit"]') ||
        Array.from(document.querySelectorAll("form button")).find((b) => b.innerText.includes("Create") || b.innerText.includes("खाता"))
      if (submitBtn) submitBtn.click()
    })
    await new Promise((r) => setTimeout(r, 3000))

    // Verify Patient Home loaded
    const homeTextAfterReg = await page.evaluate(() => document.body.innerText)
    const onHomeAfterReg = homeTextAfterReg.includes("Shreya") || homeTextAfterReg.includes("Talk to a doctor") || homeTextAfterReg.includes("डॉक्टर से बात")

    console.log("[VERIFY] Browser redirected to Patient Home:", onHomeAfterReg)

    // -------------------------------------------------------------------------
    // STEP 3: Verify MongoDB Document in ayushlink_db.patients
    // -------------------------------------------------------------------------
    console.log("\n--- STEP 3: Verify MongoDB ayushlink_db.patients Document ---")
    const shreyaDoc = await patientsCol.findOne({ phone: testPhone })

    if (!shreyaDoc) {
      throw new Error(`CRITICAL: Patient '${testName}' with phone '${testPhone}' was NOT found in MongoDB ayushlink_db.patients!`)
    }

    console.log("[OK] MongoDB Document Found:")
    console.log("     _id:", shreyaDoc._id)
    console.log("     patient_id:", shreyaDoc.patient_id)
    console.log("     full_name:", shreyaDoc.full_name)
    console.log("     phone:", shreyaDoc.phone)
    console.log("     village:", shreyaDoc.village)
    console.log("     hashed_password:", shreyaDoc.hashed_password)

    // Verify password is NOT plaintext and is a valid bcrypt hash
    const isPlaintext = shreyaDoc.hashed_password === testPassword
    const isBcryptHash = typeof shreyaDoc.hashed_password === "string" && shreyaDoc.hashed_password.startsWith("$2") && shreyaDoc.hashed_password.length >= 59

    console.log("[VERIFY] Password is NOT plaintext:", !isPlaintext)
    console.log("[VERIFY] Password is valid bcrypt hash ($2b$...):", isBcryptHash)
    console.log("         Stored Hash value:", shreyaDoc.hashed_password)

    if (isPlaintext || !isBcryptHash) {
      throw new Error("Password hashing verification failed in MongoDB!")
    }

    const createdPatientId = shreyaDoc.patient_id

    // -------------------------------------------------------------------------
    // STEP 4: Logout from UI
    // -------------------------------------------------------------------------
    console.log("\n--- STEP 4: Logout from Patient Home Screen ---")
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const signOut = btns.find((b) => b.innerText.includes("Sign out") || b.innerText.includes("साइन आउट") || b.innerText.includes("लॉग आउट"))
      if (signOut) signOut.click()
    })
    await new Promise((r) => setTimeout(r, 1200))

    const onLoginAfterLogout = await page.evaluate(() => {
      return !!document.querySelector('input[type="tel"]') && !!document.querySelector('input[type="password"]')
    })
    console.log("[VERIFY] Returned to Patient Login Screen:", onLoginAfterLogout)

    // Verify localStorage auth tokens cleared
    const storedTokenAfterLogout = await page.evaluate(() => localStorage.getItem("ayushlink_token"))
    console.log("[VERIFY] Session token cleared after logout:", storedTokenAfterLogout === null)

    // -------------------------------------------------------------------------
    // STEP 5: Login with Same Phone + Password via UI
    // -------------------------------------------------------------------------
    console.log("\n--- STEP 5: Login as 'Shreya Frontend Test' via UI ---")
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
      { phone: testPhone, pass: testPassword }
    )
    await new Promise((r) => setTimeout(r, 500))

    // Click Login
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const loginBtn = btns.find((b) => b.innerText.trim() === "Login" || b.innerText.includes("लॉगिन") || b.innerText.includes("साइन इन"))
      if (loginBtn) loginBtn.click()
    })
    await new Promise((r) => setTimeout(r, 2500))

    // Verify Patient Home loaded with Shreya's name and Patient ID
    const homeTextAfterLogin = await page.evaluate(() => document.body.innerText)
    const storedUser = await page.evaluate(() => JSON.parse(localStorage.getItem("ayushlink_user") || "{}"))
    const storedPatientId = await page.evaluate(() => localStorage.getItem("ayushlink_current_patient_id"))

    console.log("[VERIFY] Logged in Home Screen displays Shreya:", homeTextAfterLogin.includes("Shreya"))
    console.log("[VERIFY] Stored User Patient ID:", storedUser?.patient_id)
    console.log("[VERIFY] Restored Patient ID matches MongoDB Created ID:", storedUser?.patient_id === createdPatientId)

    if (storedUser?.patient_id !== createdPatientId) {
      throw new Error(`Patient ID mismatch! Expected ${createdPatientId}, got ${storedUser?.patient_id}`)
    }

    // -------------------------------------------------------------------------
    // STEP 6: Regression Check - Dynamic Patient Session Switch
    // -------------------------------------------------------------------------
    console.log("\n--- STEP 6: Regression Check - Clean Session Switch to Another Patient ---")
    // Register Patient 2: Ramesh
    const testPhone2 = "98230" + String((uid + 1) % 100000).padStart(5, "0")
    const testName2 = "Kavita Patil SessionTest"
    await patientsCol.deleteMany({ phone: testPhone2 })

    // Logout Shreya
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const signOut = btns.find((b) => b.innerText.includes("Sign out") || b.innerText.includes("साइन आउट") || b.innerText.includes("लॉग आउट"))
      if (signOut) signOut.click()
    })
    await new Promise((r) => setTimeout(r, 1200))

    // Navigate to register Patient 2
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const regLink = btns.find((b) => b.innerText.includes("Create Account") || b.innerText.includes("खाता बनाएं") || b.innerText.includes("खाते तयार करा"))
      if (regLink) regLink.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    await page.evaluate(
      ({ name, phone, pass }) => {
        function setVal(input, val) {
          if (!input) return
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
          setter.call(input, val)
          input.dispatchEvent(new Event("input", { bubbles: true }))
          input.dispatchEvent(new Event("change", { bubbles: true }))
        }

        const textInputs = document.querySelectorAll('form input[type="text"]')
        if (textInputs[0]) setVal(textInputs[0], name)

        const telInput = document.querySelector('form input[type="tel"]')
        if (telInput) setVal(telInput, phone)

        const passInput = document.querySelector('form input[type="password"]')
        if (passInput) setVal(passInput, pass)

        const numInput = document.querySelector('form input[type="number"]')
        if (numInput) setVal(numInput, "32")

        const genderBtns = Array.from(document.querySelectorAll("form button")).filter(
          (b) => b.innerText.includes("Female") || b.innerText.includes("महिला") || b.innerText.includes("स्त्री")
        )
        if (genderBtns[0]) genderBtns[0].click()

        if (textInputs[1]) setVal(textInputs[1], "Nandgaon")
      },
      { name: testName2, phone: testPhone2, pass: "KavitaPass!123" }
    )
    await new Promise((r) => setTimeout(r, 500))

    await page.evaluate(() => {
      const submitBtn = document.querySelector('form button[type="submit"]') || Array.from(document.querySelectorAll("form button")).find((b) => b.innerText.includes("Create") || b.innerText.includes("खाता"))
      if (submitBtn) submitBtn.click()
    })
    await new Promise((r) => setTimeout(r, 3000))

    const patient2Doc = await patientsCol.findOne({ phone: testPhone2 })
    const storedUser2 = await page.evaluate(() => JSON.parse(localStorage.getItem("ayushlink_user") || "{}"))

    console.log("[VERIFY] Patient 2 Created in MongoDB:", !!patient2Doc, "ID:", patient2Doc?.patient_id)
    console.log("[VERIFY] Active Session Updated to Patient 2:", storedUser2?.patient_id === patient2Doc?.patient_id)
    console.log("[VERIFY] No stale data from Shreya:", storedUser2?.patient_id !== createdPatientId)

    if (storedUser2?.patient_id !== patient2Doc?.patient_id || storedUser2?.patient_id === createdPatientId) {
      throw new Error("Patient session switch cross-contamination detected!")
    }

    console.log("\n" + "=".repeat(80))
    console.log(">>> ALL PATIENT AUTHENTICATION & MONGODB TESTS PASSED 100% <<<")
    console.log("=".repeat(80))
    return {
      success: true,
      createdPatientId,
      shreyaDoc,
      testPhone,
    }
  } finally {
    await browser.close()
    await client.close()
  }
}

runPatientAuthTest()
  .then((res) => {
    console.log("\n[COMPLETE] Result:", JSON.stringify(res, null, 2))
    process.exit(0)
  })
  .catch((err) => {
    console.error("\n[FAILED] Error:", err)
    process.exit(1)
  })
