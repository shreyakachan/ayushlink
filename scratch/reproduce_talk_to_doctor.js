import puppeteer from "puppeteer-core"
import fs from "fs"

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
]
const EXECUTABLE_PATH = CHROME_PATHS.find((p) => fs.existsSync(p))
const FRONTEND_URL = "http://localhost:5173"
const BACKEND_URL = "http://127.0.0.1:8000"

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function reproduceTalkToDoctor() {
  console.log("================================================================================")
  console.log("    REPRODUCING 'TALK TO DOCTOR' PATIENT_ID ERROR IN REAL BROWSER")
  console.log("================================================================================")

  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1280, height: 800 },
  })

  try {
    const page = await browser.newPage()

    const capturedRequests = []
    const capturedResponses = []

    page.on("request", (req) => {
      if (req.url().includes("/consultations/request")) {
        capturedRequests.push({
          url: req.url(),
          method: req.method(),
          headers: req.headers(),
          postData: req.postData(),
        })
      }
    })

    page.on("response", async (res) => {
      if (res.url().includes("/consultations/request")) {
        let body = ""
        try {
          body = await res.text()
        } catch {}
        capturedResponses.push({
          url: res.url(),
          status: res.status(),
          body: body,
        })
      }
    })

    page.on("console", (msg) => {
      console.log(`  [BROWSER CONSOLE ${msg.type()}]:`, msg.text())
    })

    // 1. Splash -> Role Select -> ASHA Login
    console.log("\n[1] Logging in as ASHA Pooja Sharma (ASHA-340)...")
    await page.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
    await sleep(2800)

    // Click Get Started
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
      if (btn) btn.click()
    })
    await sleep(800)

    // Click ASHA Worker
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("ASHA Worker") || b.textContent.includes("आशा कार्यकर्ता"))
      if (btn) btn.click()
    })
    await sleep(800)

    // Type 9876543210 / 123456
    await page.focus('input[type="tel"]')
    await page.keyboard.type("9876543210")
    await sleep(100)
    await page.focus('input[type="password"]')
    await page.keyboard.type("123456")
    await sleep(100)

    await page.evaluate(() => {
      const form = document.querySelector("form")
      if (form) form.requestSubmit()
    })
    await sleep(2500)

    console.log("  -> ASHA Dashboard Loaded:", (await page.evaluate(() => document.body.innerText)).includes("Pooja Sharma"))

    // 2. Navigate to "My Patients"
    console.log("\n[2] Navigating to My Patients...")
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, a"))
      const patBtn = btns.find((b) => b.textContent.includes("Patients") || b.textContent.includes("My Patients") || b.textContent.includes("मरीज"))
      if (patBtn) patBtn.click()
    })
    await sleep(1500)

    // Check list of patients in My Patients screen
    const patientListInfo = await page.evaluate(() => {
      const lis = Array.from(document.querySelectorAll("li"))
      return lis.map((li) => li.innerText.replace(/\n+/g, " | "))
    })
    console.log("  -> Patients found on screen:", patientListInfo)

    // 3. Select Patient (e.g. Shreya / P-4559 or first patient)
    console.log("\n[3] Selecting Patient Shreya / P-4559...")
    const selectedPatient = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("li button"))
      const shreyaBtn = btns.find((b) => b.textContent.includes("Shreya") || b.textContent.includes("P-4559"))
      if (shreyaBtn) {
        shreyaBtn.click()
        return shreyaBtn.innerText.replace(/\n+/g, " | ")
      }
      if (btns.length > 0) {
        btns[0].click()
        return btns[0].innerText.replace(/\n+/g, " | ")
      }
      return null
    })
    console.log("  -> Selected Patient button text:", selectedPatient)
    await sleep(1500)

    // Inspect the patient detail modal on screen
    const modalText = await page.evaluate(() => {
      const modal = document.querySelector(".fixed.inset-0")
      return modal ? modal.innerText.replace(/\n+/g, " | ") : "No modal"
    })
    console.log("  -> Patient Detail Modal content:", modalText)

    // Check if there is a "Talk to Doctor" button or how to reach consultation
    const modalButtons = await page.evaluate(() => {
      const modal = document.querySelector(".fixed.inset-0")
      if (!modal) return []
      return Array.from(modal.querySelectorAll("button")).map((b) => b.textContent.trim())
    })
    console.log("  -> Modal buttons:", modalButtons)

    // 4. Test calling POST /api/consultations/request with current frontend behavior
    console.log("\n[4] Simulating / Invoking requestConsultation as ASHA...")
    const requestTest = await page.evaluate(async () => {
      const api = await import("/src/lib/api.js")
      try {
        const payload = {
          doctor_id: "DOC-101",
          reason: "Medical consultation & symptom evaluation",
          urgency: "routine",
          symptoms: [],
        }
        const res = await api.requestConsultation(payload)
        return { success: true, res }
      } catch (err) {
        return { success: false, error: err.message, status: err.status }
      }
    })
    console.log("  -> requestConsultation result:", requestTest)

    console.log("\n[5] Captured Network Request & Response:")
    console.log("  -> Captured Requests:", JSON.stringify(capturedRequests, null, 2))
    console.log("  -> Captured Responses:", JSON.stringify(capturedResponses, null, 2))

  } finally {
    await browser.close()
  }
}

reproduceTalkToDoctor().catch(console.error)
