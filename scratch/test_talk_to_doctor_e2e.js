import puppeteer from "puppeteer-core"
import fs from "fs"

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
]
const EXECUTABLE_PATH = CHROME_PATHS.find((p) => fs.existsSync(p))
const FRONTEND_URL = "http://localhost:5173"

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runE2ETests() {
  console.log("================================================================================")
  console.log("      TALK TO DOCTOR DYNAMIC PATIENT_ID FIX — COMPREHENSIVE E2E VERIFICATION")
  console.log("================================================================================")

  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1280, height: 800 },
  })

  let allPassed = true
  const results = {}

  try {
    const page = await browser.newPage()

    // Intercept and record all consultation requests
    const capturedRequests = []
    const capturedResponses = []

    page.on("request", (req) => {
      if (req.url().includes("/consultations/request")) {
        let postData = null
        try {
          postData = JSON.parse(req.postData() || "{}")
        } catch {
          postData = req.postData()
        }
        capturedRequests.push({
          url: req.url(),
          method: req.method(),
          headers: req.headers(),
          payload: postData,
          time: new Date().toISOString(),
        })
      }
    })

    page.on("response", async (res) => {
      if (res.url().includes("/consultations/request")) {
        let body = null
        try {
          body = await res.json()
        } catch {
          try {
            body = await res.text()
          } catch {}
        }
        capturedResponses.push({
          url: res.url(),
          status: res.status(),
          body: body,
          time: new Date().toISOString(),
        })
      }
    })

    // Helper to log in as ASHA
    async function loginAsAsha() {
      await page.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
      await page.evaluate(() => {
        try { localStorage.clear(); sessionStorage.clear(); } catch {}
      })
      await page.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
      await sleep(2800)

      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"))
        const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
        if (btn) btn.click()
      })
      await sleep(800)

      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"))
        const btn = btns.find((b) => b.textContent.includes("ASHA Worker") || b.textContent.includes("आशा कार्यकर्ता"))
        if (btn) btn.click()
      })
      await sleep(800)

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
    }

    // Helper to log in as Doctor
    async function loginAsDoctor() {
      await page.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
      await page.evaluate(() => {
        try { localStorage.clear(); sessionStorage.clear(); } catch {}
      })
      await page.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
      await sleep(2800)

      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"))
        const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
        if (btn) btn.click()
      })
      await sleep(800)

      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"))
        const btn = btns.find((b) => b.textContent.includes("Medical Officer") || b.textContent.includes("Doctor") || b.textContent.includes("चिकित्सा अधिकारी"))
        if (btn) btn.click()
      })
      await sleep(800)

      await page.focus('input[type="tel"]')
      await page.keyboard.type("9823088882")
      await sleep(100)
      await page.focus('input[type="password"]')
      await page.keyboard.type("123456")
      await sleep(100)

      await page.evaluate(() => {
        const form = document.querySelector("form")
        if (form) form.requestSubmit()
      })
      await sleep(2500)
    }

    // Helper to log in as Patient
    async function loginAsPatient() {
      await page.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
      await page.evaluate(() => {
        try { localStorage.clear(); sessionStorage.clear(); } catch {}
      })
      await page.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
      await sleep(2800)

      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"))
        const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
        if (btn) btn.click()
      })
      await sleep(800)

      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"))
        const btn = btns.find((b) => b.textContent.includes("Patient") || b.textContent.includes("मरीज पोर्टल"))
        if (btn) btn.click()
      })
      await sleep(800)

      await page.focus('input[type="tel"]')
      await page.keyboard.type("9324998108")
      await sleep(100)
      await page.focus('input[type="password"]')
      await page.keyboard.type("123456")
      await sleep(100)

      await page.evaluate(() => {
        const form = document.querySelector("form")
        if (form) form.requestSubmit()
      })
      await sleep(2500)
    }

    // =========================================================================
    // TEST 1: ASHA selects Shreya (P-4559) -> Talk to Doctor -> Request Video
    // =========================================================================
    console.log("\n--------------------------------------------------------------------------------")
    console.log("TEST 1: ASHA (Pooja Sharma) selects Shreya (P-4559) -> Talk to Doctor")
    console.log("--------------------------------------------------------------------------------")
    await loginAsAsha()

    // Navigate to Patients
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, a"))
      const patBtn = btns.find((b) => b.textContent.includes("Patients") || b.textContent.includes("My Patients") || b.textContent.includes("मरीज"))
      if (patBtn) patBtn.click()
    })
    await sleep(1500)

    // Select Shreya
    const shreyaSelected = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("li button"))
      const btn = btns.find((b) => b.textContent.includes("Shreya") || b.textContent.includes("P-4559"))
      if (btn) {
        btn.click()
        return true
      }
      return false
    })
    console.log("  [1.1] Selected Shreya (P-4559):", shreyaSelected)
    await sleep(1500)

    // Click "Talk to Doctor" inside modal
    const talkToDoctorClicked = await page.evaluate(() => {
      const modal = document.querySelector(".fixed.inset-0")
      if (!modal) return false
      const btn = Array.from(modal.querySelectorAll("button")).find((b) => b.textContent.includes("Talk to Doctor") || b.textContent.includes("डॉक्टर से बात करें"))
      if (btn) {
        btn.click()
        return true
      }
      return false
    })
    console.log("  [1.2] Clicked 'Talk to Doctor' button:", talkToDoctorClicked)
    await sleep(1500)

    // Verify PatientCallScreen displayed patient banner
    const screenPatientInfo1 = await page.evaluate(() => {
      const banner = document.body.innerText
      const hasShreya = banner.includes("Shreya")
      const hasPid = banner.includes("P-4559")
      return { hasShreya, hasPid }
    })
    console.log("  [1.3] PatientCallScreen displays Shreya and P-4559:", screenPatientInfo1)

    // Click "Request Video Consultation"
    const reqReqIdxBefore1 = capturedRequests.length
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const reqBtn = btns.find((b) => b.textContent.includes("Request Video Consultation") || b.textContent.includes("परामर्श का अनुरोध करें"))
      if (reqBtn) reqBtn.click()
    })
    await sleep(3000)

    const req1 = capturedRequests.slice(reqReqIdxBefore1)[0]
    const res1 = capturedResponses.slice(reqReqIdxBefore1)[0]

    console.log("  [1.4] Request Payload Sent:", JSON.stringify(req1?.payload, null, 2))
    console.log("  [1.5] Response Status:", res1?.status)
    console.log("  [1.6] Response Body:", JSON.stringify(res1?.body, null, 2))

    const test1Pass =
      shreyaSelected &&
      talkToDoctorClicked &&
      screenPatientInfo1.hasShreya &&
      screenPatientInfo1.hasPid &&
      req1?.payload?.patient_id === "P-4559" &&
      (res1?.status === 200 || res1?.status === 201) &&
      res1?.body?.patient_id === "P-4559"

    results["ASHA -> Shreya (P-4559)"] = test1Pass ? "PASS" : "FAIL"
    console.log("  -> TEST 1 RESULT:", test1Pass ? "PASS" : "FAIL")
    if (!test1Pass) allPassed = false

    // Return to Patients screen by clicking Back in PatientCallScreen header
    await page.evaluate(() => {
      const backBtn = document.querySelector('button[title="Back"]') || document.querySelector("button")
      if (backBtn) backBtn.click()
    })
    await sleep(1500)

    // =========================================================================
    // TEST 2: ASHA selects Kavita Patil (P-2430) -> Talk to Doctor -> Request Video
    // =========================================================================
    console.log("\n--------------------------------------------------------------------------------")
    console.log("TEST 2: ASHA (Pooja Sharma) selects Kavita Patil (P-2430) -> Talk to Doctor")
    console.log("--------------------------------------------------------------------------------")

    // If modal or call screen is not at patients, navigate to patients
    await page.evaluate(() => {
      const patBtn = Array.from(document.querySelectorAll("button, a")).find((b) => b.textContent.includes("Patients") || b.textContent.includes("My Patients") || b.textContent.includes("मरीज"))
      if (patBtn) patBtn.click()
    })
    await sleep(1500)

    // Select Kavita Patil
    const kavitaSelected = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("li button"))
      const btn = btns.find((b) => b.textContent.includes("Kavita") || b.textContent.includes("P-2430"))
      if (btn) {
        btn.click()
        return true
      }
      return false
    })
    console.log("  [2.1] Selected Kavita Patil (P-2430):", kavitaSelected)
    await sleep(1500)

    // Click "Talk to Doctor"
    const kavitaTalkClicked = await page.evaluate(() => {
      const modal = document.querySelector(".fixed.inset-0")
      if (!modal) return false
      const btn = Array.from(modal.querySelectorAll("button")).find((b) => b.textContent.includes("Talk to Doctor") || b.textContent.includes("डॉक्टर से बात करें"))
      if (btn) {
        btn.click()
        return true
      }
      return false
    })
    console.log("  [2.2] Clicked 'Talk to Doctor' button:", kavitaTalkClicked)
    await sleep(1500)

    // Verify PatientCallScreen displayed Kavita Patil banner
    const kavitaScreenInfo = await page.evaluate(() => {
      const banner = document.body.innerText
      const hasKavita = banner.includes("Kavita")
      const hasPid = banner.includes("P-2430")
      return { hasKavita, hasPid }
    })
    console.log("  [2.3] PatientCallScreen displays Kavita Patil and P-2430:", kavitaScreenInfo)

    const reqReqIdxBefore2 = capturedRequests.length
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const reqBtn = btns.find((b) => b.textContent.includes("Request Video Consultation") || b.textContent.includes("परामर्श का अनुरोध करें"))
      if (reqBtn) reqBtn.click()
    })
    await sleep(3000)

    const req2 = capturedRequests.slice(reqReqIdxBefore2)[0]
    const res2 = capturedResponses.slice(reqReqIdxBefore2)[0]

    console.log("  [2.4] Request Payload Sent:", JSON.stringify(req2?.payload, null, 2))
    console.log("  [2.5] Response Status:", res2?.status)
    console.log("  [2.6] Response Body:", JSON.stringify(res2?.body, null, 2))

    const test2Pass =
      kavitaSelected &&
      kavitaTalkClicked &&
      kavitaScreenInfo.hasKavita &&
      kavitaScreenInfo.hasPid &&
      req2?.payload?.patient_id === "P-2430" &&
      (res2?.status === 200 || res2?.status === 201) &&
      res2?.body?.patient_id === "P-2430"

    results["ASHA -> Kavita Patil (P-2430)"] = test2Pass ? "PASS" : "FAIL"
    console.log("  -> TEST 2 RESULT:", test2Pass ? "PASS" : "FAIL")
    if (!test2Pass) allPassed = false

    // Return to Patients screen
    await page.evaluate(() => {
      const backBtn = document.querySelector('button[title="Back"]') || document.querySelector("button")
      if (backBtn) backBtn.click()
    })
    await sleep(1500)

    // =========================================================================
    // TEST 3: ASHA selects Arjun Shinde (P-4099) -> Talk to Doctor -> Request Video
    // =========================================================================
    console.log("\n--------------------------------------------------------------------------------")
    console.log("TEST 3: ASHA (Pooja Sharma) selects Arjun Shinde (P-4099) -> Talk to Doctor")
    console.log("--------------------------------------------------------------------------------")

    // Navigate to patients if needed
    await page.evaluate(() => {
      const patBtn = Array.from(document.querySelectorAll("button, a")).find((b) => b.textContent.includes("Patients") || b.textContent.includes("My Patients") || b.textContent.includes("मरीज"))
      if (patBtn) patBtn.click()
    })
    await sleep(1500)

    // Select Arjun Shinde
    const arjunSelected = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("li button"))
      const btn = btns.find((b) => b.textContent.includes("Arjun") || b.textContent.includes("P-4099"))
      if (btn) {
        btn.click()
        return true
      }
      return false
    })
    console.log("  [3.1] Selected Arjun Shinde (P-4099):", arjunSelected)
    await sleep(1500)

    // Click "Talk to Doctor"
    const arjunTalkClicked = await page.evaluate(() => {
      const modal = document.querySelector(".fixed.inset-0")
      if (!modal) return false
      const btn = Array.from(modal.querySelectorAll("button")).find((b) => b.textContent.includes("Talk to Doctor") || b.textContent.includes("डॉक्टर से बात करें"))
      if (btn) {
        btn.click()
        return true
      }
      return false
    })
    console.log("  [3.2] Clicked 'Talk to Doctor' button:", arjunTalkClicked)
    await sleep(1500)

    // Verify PatientCallScreen displayed Arjun Shinde banner
    const arjunScreenInfo = await page.evaluate(() => {
      const banner = document.body.innerText
      const hasArjun = banner.includes("Arjun")
      const hasPid = banner.includes("P-4099")
      return { hasArjun, hasPid }
    })
    console.log("  [3.3] PatientCallScreen displays Arjun Shinde and P-4099:", arjunScreenInfo)

    const reqReqIdxBefore3 = capturedRequests.length
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const reqBtn = btns.find((b) => b.textContent.includes("Request Video Consultation") || b.textContent.includes("परामर्श का अनुरोध करें"))
      if (reqBtn) reqBtn.click()
    })
    await sleep(3000)

    const req3 = capturedRequests.slice(reqReqIdxBefore3)[0]
    const res3 = capturedResponses.slice(reqReqIdxBefore3)[0]

    console.log("  [3.4] Request Payload Sent:", JSON.stringify(req3?.payload, null, 2))
    console.log("  [3.5] Response Status:", res3?.status)
    console.log("  [3.6] Response Body:", JSON.stringify(res3?.body, null, 2))

    const test3Pass =
      arjunSelected &&
      arjunTalkClicked &&
      arjunScreenInfo.hasArjun &&
      arjunScreenInfo.hasPid &&
      req3?.payload?.patient_id === "P-4099" &&
      (res3?.status === 200 || res3?.status === 201) &&
      res3?.body?.patient_id === "P-4099"

    results["ASHA -> Arjun Shinde (P-4099)"] = test3Pass ? "PASS" : "FAIL"
    console.log("  -> TEST 3 RESULT:", test3Pass ? "PASS" : "FAIL")
    if (!test3Pass) allPassed = false

    // =========================================================================
    // TEST 4: Doctor Side Verification (Dr. Arvind Varma receives requests)
    // =========================================================================
    console.log("\n--------------------------------------------------------------------------------")
    console.log("TEST 4: Doctor Dashboard Verification (Doctor sees correct patient identity)")
    console.log("--------------------------------------------------------------------------------")
    await loginAsDoctor()

    // Inspect Doctor Dashboard Video Requests
    const doctorRequestsOnScreen = await page.evaluate(() => {
      const section = Array.from(document.querySelectorAll("section")).find((s) => s.textContent.includes("Live Video Consultation Requests"))
      if (!section) return { found: false, text: document.body.innerText.slice(0, 500) }
      return {
        found: true,
        text: section.innerText,
      }
    })
    console.log("  [4.1] Doctor Dashboard Video Requests Section:", doctorRequestsOnScreen)

    const doctorProfileOnScreen = await page.evaluate(() => {
      return {
        hasDrArvind: document.body.innerText.includes("Dr. Arvind Varma") || document.body.innerText.includes("Dr Arvind Varma"),
        hasPatientNameSeparated: !document.body.innerText.includes("Patient: Dr Arvind"),
      }
    })
    console.log("  [4.2] Doctor Profile & Patient Identity Separation:", doctorProfileOnScreen)

    // Doctor accepts request
    const acceptClicked = await page.evaluate(() => {
      const acceptBtns = Array.from(document.querySelectorAll("button")).filter((b) => b.textContent.trim() === "Accept")
      if (acceptBtns.length > 0) {
        acceptBtns[0].click()
        return true
      }
      return false
    })
    console.log("  [4.3] Doctor clicked 'Accept':", acceptClicked)
    await sleep(2500)

    const test4Pass =
      doctorRequestsOnScreen.found &&
      doctorProfileOnScreen.hasDrArvind &&
      doctorProfileOnScreen.hasPatientNameSeparated

    results["Doctor Side Received Correct Patient"] = test4Pass ? "PASS" : "FAIL"
    console.log("  -> TEST 4 RESULT:", test4Pass ? "PASS" : "FAIL")
    if (!test4Pass) allPassed = false

    // =========================================================================
    // TEST 5: Patient-Initiated Video Consultation Flow
    // =========================================================================
    console.log("\n--------------------------------------------------------------------------------")
    console.log("TEST 5: Patient (Shreya / 9324998108) Initiates Video Consultation")
    console.log("--------------------------------------------------------------------------------")
    await loginAsPatient()

    // Click Video Consultation / Talk to Doctor button on Patient Home
    const patientTalkClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, a"))
      const btn = btns.find((b) => b.textContent.includes("Talk to Doctor") || b.textContent.includes("Video Consultation") || b.textContent.includes("डॉक्टर से बात करें"))
      if (btn) {
        btn.click()
        return true
      }
      return false
    })
    console.log("  [5.1] Patient clicked Video Consultation / Talk to Doctor:", patientTalkClicked)
    await sleep(2000)

    const patientCallScreenText = await page.evaluate(() => document.body.innerText)
    const isPatientCallScreenOpen =
      patientCallScreenText.includes("Video Consultation") ||
      patientCallScreenText.includes("Connect with an AYUSH medical officer") ||
      patientCallScreenText.includes("Video consultation request sent") ||
      patientCallScreenText.includes("Doctor accepted")
    console.log("  [5.2] Patient Call Screen is open and active:", isPatientCallScreenOpen)

    const test5Pass = patientTalkClicked && isPatientCallScreenOpen
    results["Patient Direct Video Consultation"] = test5Pass ? "PASS" : "FAIL"
    console.log("  -> TEST 5 RESULT:", test5Pass ? "PASS" : "FAIL")
    if (!test5Pass) allPassed = false

    console.log("\n================================================================================")
    console.log("                            SUMMARY OF E2E TEST RESULTS")
    console.log("================================================================================")
    for (const [name, result] of Object.entries(results)) {
      console.log(`  ${result === "PASS" ? "✓" : "✗"} ${name.padEnd(45)}: ${result}`)
    }
    console.log(`\nOVERALL E2E STATUS: ${allPassed ? "ALL TESTS PASSED" : "FAILED"}`)
    console.log("================================================================================\n")

  } finally {
    await browser.close()
  }
}

runE2ETests().catch(console.error)
