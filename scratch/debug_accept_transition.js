import puppeteer from "puppeteer-core"
import fs from "fs"
import { execSync } from "child_process"

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
]
const EXECUTABLE_PATH = CHROME_PATHS.find((p) => fs.existsSync(p))
const FRONTEND_URL = "http://localhost:5173"

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function debugTransition() {
  console.log("================================================================================")
  console.log("    DEBUGGING PATIENT VIDEO CONSULTATION TRANSITION AFTER DOCTOR ACCEPTS")
  console.log("================================================================================")

  // Clean DB first
  try {
    execSync("python scratch/clean_consultations.py", { stdio: "inherit" })
  } catch (e) {}

  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1280, height: 800 },
  })

  try {
    const patientPage = await browser.newPage()
    const doctorPage = await browser.newPage()

    patientPage.on("console", (msg) => console.log(`[PATIENT PAGE CONSOLE ${msg.type()}]:`, msg.text()))
    doctorPage.on("console", (msg) => console.log(`[DOCTOR PAGE CONSOLE ${msg.type()}]:`, msg.text()))

    patientPage.on("request", (req) => {
      if (req.url().includes("/consultations")) {
        console.log(`[PATIENT NET REQ]: ${req.method()} ${req.url()}`)
      }
    })

    patientPage.on("response", async (res) => {
      if (res.url().includes("/consultations")) {
        let body = ""
        try {
          body = await res.text()
        } catch {}
        console.log(`[PATIENT NET RES]: ${res.status()} ${res.url()} -> ${body.slice(0, 150)}`)
      }
    })

    // 1. Patient Logs in (Shreya / P-4559 / 9324998108)
    console.log("\n[1] Logging in as Patient Shreya (9324998108)...")
    await patientPage.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
    await patientPage.evaluate(() => {
      try { localStorage.clear(); sessionStorage.clear(); } catch {}
    })
    await patientPage.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
    await sleep(2500)

    // Click Get Started
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
      if (btn) btn.click()
    })
    await sleep(800)

    // Click Patient
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Patient") || b.textContent.includes("मरीज पोर्टल"))
      if (btn) btn.click()
    })
    await sleep(800)

    await patientPage.focus('input[type="tel"]')
    await patientPage.keyboard.type("9324998108")
    await sleep(100)
    await patientPage.focus('input[type="password"]')
    await patientPage.keyboard.type("123456")
    await sleep(100)

    await patientPage.evaluate(() => {
      const form = document.querySelector("form")
      if (form) form.requestSubmit()
    })
    await sleep(2500)

    // Click Talk to Doctor / Video Consultation
    console.log("\n[2] Patient clicks Talk to Doctor...")
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, a"))
      const btn = btns.find((b) => b.textContent.includes("Talk to Doctor") || b.textContent.includes("Video Consultation") || b.textContent.includes("डॉक्टर से बात करें"))
      if (btn) btn.click()
    })
    await sleep(2000)

    // Patient submits consultation request
    console.log("\n[3] Patient requests Video Consultation with DOC-501 (Dr. Arvind Varma)...")
    await patientPage.evaluate(() => {
      // select Dr. Arvind Varma if available
      const docBtns = Array.from(document.querySelectorAll("button"))
      const doc501Btn = docBtns.find((b) => b.textContent.includes("Dr. Arvind Varma") || b.textContent.includes("Arvind"))
      if (doc501Btn) doc501Btn.click()
    })
    await sleep(500)

    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const reqBtn = btns.find((b) => b.textContent.includes("Request Video Consultation") || b.textContent.includes("परामर्श का अनुरोध करें"))
      if (reqBtn) reqBtn.click()
    })
    await sleep(3000)

    const patientStage1 = await patientPage.evaluate(() => document.body.innerText)
    console.log("Patient screen after request:\n", patientStage1.slice(0, 300))

    // 2. Doctor Logs in (Dr. Arvind Varma / 9823088882)
    console.log("\n[4] Doctor logs in (9823088882)...")
    await doctorPage.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
    await doctorPage.evaluate(() => {
      try { localStorage.clear(); sessionStorage.clear(); } catch {}
    })
    await doctorPage.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
    await sleep(2500)

    await doctorPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
      if (btn) btn.click()
    })
    await sleep(800)

    await doctorPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Medical Officer") || b.textContent.includes("Doctor") || b.textContent.includes("चिकित्सा अधिकारी"))
      if (btn) btn.click()
    })
    await sleep(800)

    await doctorPage.focus('input[type="tel"]')
    await doctorPage.keyboard.type("9823088882")
    await sleep(100)
    await doctorPage.focus('input[type="password"]')
    await doctorPage.keyboard.type("123456")
    await sleep(100)

    await doctorPage.evaluate(() => {
      const form = document.querySelector("form")
      if (form) form.requestSubmit()
    })
    await sleep(3500)

    // Doctor sees the request and clicks Accept
    console.log("\n[5] Doctor accepts the video consultation request...")
    const acceptClicked = await doctorPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button")).filter((b) => b.textContent.trim() === "Accept")
      if (btns.length > 0) {
        btns[0].click()
        return true
      }
      return false
    })
    console.log("Doctor click Accept result:", acceptClicked)
    await sleep(3000)

    // 3. Monitor Patient Window for 10 seconds to see if it transitions to accepted stage
    console.log("\n[6] Monitoring Patient screen for transition to 'accepted' stage...")
    for (let i = 1; i <= 6; i++) {
      await sleep(2000)
      const state = await patientPage.evaluate(() => {
        const text = document.body.innerText
        const isWaiting = text.includes("Pending Approval") || text.includes("Video consultation request sent")
        const isAccepted = text.includes("Request Accepted") || text.includes("Doctor accepted your request") || text.includes("Join Video Consultation")
        const isInCall = text.includes("Live Video Consultation") || !!document.querySelector("video")
        return { isWaiting, isAccepted, isInCall, textSnippet: text.slice(0, 200).replace(/\n+/g, " | ") }
      })
      console.log(`  [T+${i*2}s] Patient state:`, state)
    }

  } finally {
    await browser.close()
  }
}

debugTransition().catch(console.error)
