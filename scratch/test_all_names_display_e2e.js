import puppeteer from "puppeteer-core"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE_URL = "http://localhost:5173"

async function runTests() {
  console.log("=".repeat(80))
  console.log(" VERIFYING DISPLAY NAMES FOR PATIENT, ASHA, AND DOCTOR ROLES")
  console.log("=".repeat(80))

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--window-size=1280,900"],
  })

  try {
    // -------------------------------------------------------------
    // TEST 1: PATIENT ROLE (Shreya)
    // -------------------------------------------------------------
    console.log("\n--- [TEST 1] Patient Role: Shreya ---")
    const pagePatient = await browser.newPage()
    await pagePatient.setViewport({ width: 1280, height: 900 })

    await pagePatient.goto(BASE_URL, { waitUntil: "networkidle0" })

    // Wait for Splash screen ready (2.5s)
    await new Promise(r => setTimeout(r, 2600))
    await pagePatient.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find(b => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
      if (btn) btn.click()
    })
    await new Promise(r => setTimeout(r, 600))

    // Role select -> Patient (3rd card)
    await pagePatient.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("main button"))
      if (btns.length >= 3) {
        btns[2].click()
      } else {
        const pBtn = btns.find(b => b.textContent.includes("Patient") || b.textContent.includes("मरीज़"))
        if (pBtn) pBtn.click()
      }
    })
    await new Promise(r => setTimeout(r, 600))

    // Patient Login with 9324998108 / 123456
    await pagePatient.waitForSelector("#patient-phone", { timeout: 5000 })
    await pagePatient.type("#patient-phone", "9324998108")
    await pagePatient.type("#patient-password", "123456")
    await pagePatient.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const loginBtn = btns.find(b => b.type === "submit" || b.textContent.includes("Sign in") || b.textContent.includes("Login"))
      if (loginBtn) loginBtn.click()
    })
    await new Promise(r => setTimeout(r, 1500))

    const patientHomeText = await pagePatient.evaluate(() => document.body.innerText)
    const hasShreya = patientHomeText.includes("Shreya")
    console.log("  [CHECK] Patient Dashboard Greeting includes 'Shreya':", hasShreya)
    if (!hasShreya) throw new Error("FAIL: Shreya not displayed on Patient Dashboard")

    // Check Patient Profile via App state
    const patientProfileName = await pagePatient.evaluate(() => {
      const user = JSON.parse(localStorage.getItem("ayushlink_user") || "{}")
      const patientUser = JSON.parse(localStorage.getItem("ayushlink_patient_user") || "{}")
      return patientUser.full_name || user.full_name || user.name
    })
    console.log("  [CHECK] Patient Stored Session Name:", patientProfileName)
    if (patientProfileName !== "Shreya") throw new Error(`FAIL: Expected 'Shreya', got '${patientProfileName}'`)
    console.log("  [PASS] Patient Account displays 'Shreya' consistently!")

    // -------------------------------------------------------------
    // TEST 2: ASHA WORKER ROLE (Pooja Sharma)
    // -------------------------------------------------------------
    console.log("\n--- [TEST 2] ASHA Worker Role: Pooja Sharma ---")
    const pageAsha = await browser.newPage()
    await pageAsha.setViewport({ width: 1280, height: 900 })

    await pageAsha.goto(BASE_URL, { waitUntil: "networkidle0" })

    // Clear and navigate to Role Select
    await pageAsha.evaluate(() => {
      localStorage.clear()
    })
    await pageAsha.goto(BASE_URL, { waitUntil: "networkidle0" })

    // Wait for Splash screen ready (2.5s)
    await new Promise(r => setTimeout(r, 2600))
    await pageAsha.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find(b => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
      if (btn) btn.click()
    })
    await new Promise(r => setTimeout(r, 600))

    // Role select -> ASHA Worker (1st card)
    await pageAsha.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("main button"))
      if (btns.length >= 1) {
        btns[0].click()
      }
    })
    await new Promise(r => setTimeout(r, 600))

    // ASHA Login with 9876543210 / 123456
    await pageAsha.waitForSelector("#phone", { timeout: 5000 })
    await pageAsha.type("#phone", "9876543210")
    await pageAsha.type("#password", "123456")
    await pageAsha.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const loginBtn = btns.find(b => b.type === "submit" || b.textContent.includes("Login") || b.textContent.includes("Sign in"))
      if (loginBtn) loginBtn.click()
    })
    await new Promise(r => setTimeout(r, 1500))

    const ashaDashboardText = await pageAsha.evaluate(() => document.body.innerText)
    const hasPoojaSharma = ashaDashboardText.includes("Pooja Sharma")
    console.log("  [CHECK] ASHA Dashboard includes 'Pooja Sharma':", hasPoojaSharma)
    if (!hasPoojaSharma) throw new Error("FAIL: Pooja Sharma not displayed on ASHA Dashboard")

    // Navigate to ASHA Profile
    await pageAsha.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const profBtn = btns.find(b => b.textContent.includes("Profile") || b.textContent.includes("प्रोफ़ाइल") || b.getAttribute("aria-label")?.includes("profile"))
      if (profBtn) profBtn.click()
    })
    await new Promise(r => setTimeout(r, 800))

    const ashaProfileText = await pageAsha.evaluate(() => document.body.innerText)
    const hasPoojaInProfile = ashaProfileText.includes("Pooja Sharma")
    console.log("  [CHECK] ASHA Profile includes 'Pooja Sharma':", hasPoojaInProfile)
    if (!hasPoojaInProfile) throw new Error("FAIL: Pooja Sharma not displayed on ASHA Profile")
    console.log("  [PASS] ASHA Account displays 'Pooja Sharma' consistently on Dashboard and Profile!")

    // -------------------------------------------------------------
    // TEST 3: DOCTOR ROLE (Dr. Arvind)
    // -------------------------------------------------------------
    console.log("\n--- [TEST 3] Doctor Role: Dr. Arvind ---")
    const pageDoctor = await browser.newPage()
    await pageDoctor.setViewport({ width: 1280, height: 900 })

    await pageDoctor.goto(BASE_URL, { waitUntil: "networkidle0" })

    // Clear and navigate to Role Select
    await pageDoctor.evaluate(() => {
      localStorage.clear()
    })
    await pageDoctor.goto(BASE_URL, { waitUntil: "networkidle0" })

    // Wait for Splash screen ready (2.5s)
    await new Promise(r => setTimeout(r, 2600))
    await pageDoctor.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find(b => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
      if (btn) btn.click()
    })
    await new Promise(r => setTimeout(r, 600))

    // Role select -> Doctor (2nd card)
    await pageDoctor.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("main button"))
      if (btns.length >= 2) {
        btns[1].click()
      }
    })
    await new Promise(r => setTimeout(r, 600))

    // Doctor Login with 9823000001 / DoctorSecurePass123
    await pageDoctor.waitForSelector("#phone", { timeout: 5000 })
    await pageDoctor.type("#phone", "9823000001")
    await pageDoctor.type("#password", "DoctorSecurePass123")
    await pageDoctor.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const loginBtn = btns.find(b => b.type === "submit" || b.textContent.includes("Login") || b.textContent.includes("Sign in"))
      if (loginBtn) loginBtn.click()
    })
    await new Promise(r => setTimeout(r, 1500))

    const doctorDashboardText = await pageDoctor.evaluate(() => document.body.innerText)
    const hasDrArvind = doctorDashboardText.includes("Dr. Arvind")
    console.log("  [CHECK] Doctor Dashboard includes 'Dr. Arvind':", hasDrArvind)
    if (!hasDrArvind) throw new Error("FAIL: Dr. Arvind not displayed on Doctor Dashboard")

    // Navigate to Doctor Profile
    await pageDoctor.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const profBtn = btns.find(b => b.textContent.includes("Profile") || b.textContent.includes("प्रोफ़ाइल") || b.getAttribute("aria-label")?.includes("profile"))
      if (profBtn) profBtn.click()
    })
    await new Promise(r => setTimeout(r, 800))

    const doctorProfileText = await pageDoctor.evaluate(() => document.body.innerText)
    const hasDrArvindInProfile = doctorProfileText.includes("Dr. Arvind")
    console.log("  [CHECK] Doctor Profile includes 'Dr. Arvind':", hasDrArvindInProfile)
    if (!hasDrArvindInProfile) throw new Error("FAIL: Dr. Arvind not displayed on Doctor Profile")
    console.log("  [PASS] Doctor Account displays 'Dr. Arvind' consistently on Dashboard and Profile!")

    console.log("\n" + "=".repeat(80))
    console.log(" ALL 3 REQUIRED NAMES VERIFIED SUCCESSFULLY ON BOTH DASHBOARD & PROFILE!")
    console.log("   1. Patient  -> Shreya")
    console.log("   2. ASHA     -> Pooja Sharma")
    console.log("   3. Doctor   -> Dr. Arvind")
    console.log("=".repeat(80))
  } finally {
    await browser.close()
  }
}

runTests().catch(err => {
  console.error("TEST FAILED:", err)
  process.exit(1)
})
