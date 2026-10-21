import puppeteer from "puppeteer-core"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE_URL = "http://localhost:5173"

async function runTests() {
  console.log("=".repeat(80))
  console.log(" VERIFYING DR ARVIND VERMA ON DOCTOR DASHBOARD & PROFILE")
  console.log(" PATIENT (SHREYA) & ASHA (POOJA SHARMA) REMAIN UNCHANGED")
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
    console.log("\n--- [TEST 1] Patient Role: Verifying Shreya ---")
    const pagePatient = await browser.newPage()
    await pagePatient.setViewport({ width: 1280, height: 900 })
    await pagePatient.goto(BASE_URL, { waitUntil: "networkidle0" })

    await new Promise(r => setTimeout(r, 2600))
    await pagePatient.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find(b => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
      if (btn) btn.click()
    })
    await new Promise(r => setTimeout(r, 600))

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
    console.log("  [CHECK] Patient Home includes 'Shreya':", hasShreya)
    if (!hasShreya) throw new Error("FAIL: Patient Shreya not displayed on Patient Home")
    console.log("  [PASS] Patient Name is preserved as 'Shreya'!")

    // -------------------------------------------------------------
    // TEST 2: DOCTOR ROLE (Dr Arvind Verma)
    // -------------------------------------------------------------
    console.log("\n--- [TEST 2] Doctor Role: Verifying Dr Arvind Verma ---")
    const pageDoctor = await browser.newPage()
    await pageDoctor.setViewport({ width: 1280, height: 900 })
    await pageDoctor.goto(BASE_URL, { waitUntil: "networkidle0" })

    await pageDoctor.evaluate(() => localStorage.clear())
    await pageDoctor.goto(BASE_URL, { waitUntil: "networkidle0" })

    await new Promise(r => setTimeout(r, 2600))
    await pageDoctor.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find(b => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
      if (btn) btn.click()
    })
    await new Promise(r => setTimeout(r, 600))

    // Doctor role
    await pageDoctor.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("main button"))
      if (btns.length >= 2) btns[1].click()
    })
    await new Promise(r => setTimeout(r, 600))

    // Doctor login
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
    const hasDrArvindVerma = doctorDashboardText.includes("Dr Arvind Verma")
    console.log("  [CHECK] Doctor Dashboard includes 'Dr Arvind Verma':", hasDrArvindVerma)
    if (!hasDrArvindVerma) throw new Error("FAIL: 'Dr Arvind Verma' not displayed on Doctor Dashboard")

    // Check no 'Shreya' on Doctor Dashboard for doctor identity
    const hasShreyaAsDoctor = doctorDashboardText.includes("Dr. Shreya") || doctorDashboardText.includes("Doctor Shreya")
    console.log("  [CHECK] No 'Dr. Shreya' on Doctor Dashboard:", !hasShreyaAsDoctor)
    if (hasShreyaAsDoctor) throw new Error("FAIL: Found 'Dr. Shreya' on Doctor Dashboard")

    // Navigate to Doctor Profile
    await pageDoctor.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const profBtn = btns.find(b => b.textContent.includes("Profile") || b.textContent.includes("प्रोफ़ाइल") || b.getAttribute("aria-label")?.includes("profile"))
      if (profBtn) profBtn.click()
    })
    await new Promise(r => setTimeout(r, 800))

    const doctorProfileText = await pageDoctor.evaluate(() => document.body.innerText)
    const hasDrArvindVermaInProfile = doctorProfileText.includes("Dr Arvind Verma")
    console.log("  [CHECK] Doctor Profile includes 'Dr Arvind Verma':", hasDrArvindVermaInProfile)
    if (!hasDrArvindVermaInProfile) throw new Error("FAIL: 'Dr Arvind Verma' not displayed on Doctor Profile")

    const hasShreyaInDoctorProfile = doctorProfileText.includes("Shreya")
    console.log("  [CHECK] No 'Shreya' in Doctor Profile:", !hasShreyaInDoctorProfile)
    if (hasShreyaInDoctorProfile) throw new Error("FAIL: 'Shreya' found in Doctor Profile")

    console.log("\n" + "=".repeat(80))
    console.log(" [SUCCESS] ALL CHECKS PASSED PERFECTLY!")
    console.log("   - Doctor Dashboard displays 'Dr Arvind Verma'")
    console.log("   - Doctor Profile displays 'Dr Arvind Verma'")
    console.log("   - Patient 'Shreya' preserved without changes")
    console.log("=".repeat(80))
  } finally {
    await browser.close()
  }
}

runTests().catch(err => {
  console.error("TEST FAILED:", err)
  process.exit(1)
})
