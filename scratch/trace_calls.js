import puppeteer from "puppeteer-core"

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const FRONTEND_URL = "http://localhost:5173"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function run() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  })

  const patPage = await browser.newPage()
  const calls = []

  patPage.on("request", (req) => {
    if (req.url().includes("/consultations/active-request")) {
      calls.push({
        type: "req",
        url: req.url(),
        auth: req.headers()["authorization"] || "NONE",
        time: Date.now(),
      })
    }
  })

  patPage.on("response", (res) => {
    if (res.url().includes("/consultations/active-request")) {
      calls.push({
        type: "res",
        url: res.url(),
        status: res.status(),
        time: Date.now(),
      })
    }
  })

  await patPage.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
  await sleep(2800)

  // Get started -> Patient
  await patPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
    if (btn) btn.click()
  })
  await sleep(800)
  await patPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Patient") || b.textContent.includes("मरीज"))
    if (btn) btn.click()
  })
  await sleep(800)

  await patPage.focus('input[type="tel"]')
  await patPage.keyboard.type("9324998108")
  await patPage.focus('input[type="password"]')
  await patPage.keyboard.type("123456")
  await patPage.evaluate(() => {
    const form = document.querySelector("form")
    if (form) form.requestSubmit()
  })
  await sleep(2000)

  const patientToken = await patPage.evaluate(() => localStorage.getItem("ayushlink_patient_token"))
  console.log("Patient Token:", patientToken ? patientToken.slice(0, 20) + "..." : "NONE")

  await patPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Talk to Doctor") || b.textContent.includes("Video Consultation"))
    if (btn) btn.click()
  })
  await sleep(2000)

  await patPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const reqBtn = btns.find((b) => b.textContent.includes("Request Video Consultation"))
    if (reqBtn) reqBtn.click()
  })
  await sleep(2500)

  console.log("\n[DOCTOR LOGIN IN TAB 2]")
  const docPage = await browser.newPage()
  await docPage.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
  await sleep(2800)
  await docPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
    if (btn) btn.click()
  })
  await sleep(800)
  await docPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Doctor") || b.textContent.includes("डॉक्टर"))
    if (btn) btn.click()
  })
  await sleep(800)

  await docPage.focus('input[type="tel"]')
  await docPage.keyboard.type("9823000001")
  await docPage.focus('input[type="password"]')
  await docPage.keyboard.type("DoctorSecurePass123")
  await docPage.evaluate(() => {
    const form = document.querySelector("form")
    if (form) form.requestSubmit()
  })
  await sleep(3000)

  const doctorToken = await docPage.evaluate(() => localStorage.getItem("ayushlink_token"))
  console.log("Doctor Token in localStorage:", doctorToken ? doctorToken.slice(0, 20) + "..." : "NONE")

  await sleep(3000)

  console.log("\n--- Captured Network Calls for /consultations/active-request ---")
  for (const c of calls) {
    if (c.type === "req") {
      const matchPat = patientToken && c.auth.includes(patientToken)
      const matchDoc = doctorToken && c.auth.includes(doctorToken)
      console.log(`REQ: ${c.url.slice(-25)} | Auth: ${c.auth.slice(0, 25)}... | IsPatToken: ${matchPat} | IsDocToken: ${matchDoc}`)
    } else {
      console.log(`RES: ${c.url.slice(-25)} | Status: ${c.status}`)
    }
  }

  await browser.close()
}

run()
