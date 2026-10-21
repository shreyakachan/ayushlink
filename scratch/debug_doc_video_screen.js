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

async function testDoc() {
  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1280, height: 800 },
  })

  try {
    const page = await browser.newPage()
    page.on("console", (msg) => console.log(`[BROWSER]: ${msg.text()}`))

    await page.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
    await sleep(2800)

    // Click Get Started
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
      if (btn) btn.click()
    })
    await sleep(800)

    // Click Doctor
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
    await sleep(3500)

    const docApiResult = await page.evaluate(async () => {
      const api = await import("/src/lib/api.js")
      try {
        const reqs = await api.getDoctorVideoRequests()
        return { success: true, reqs, token: api.getAuthToken(), role: api.getAuthRole(), user: api.getAuthUser() }
      } catch (err) {
        return { success: false, error: err.message }
      }
    })
    console.log("Doctor API Result in Browser:", JSON.stringify(docApiResult, null, 2))

    const pageText = await page.evaluate(() => document.body.innerText)
    console.log("Section on screen:", pageText.includes("Live Video Consultation Requests"))
    console.log("Patient names on screen:", {
      hasShreya: pageText.includes("Shreya"),
      hasKavita: pageText.includes("Kavita"),
      hasArjun: pageText.includes("Arjun"),
    })

  } finally {
    await browser.close()
  }
}

testDoc().catch(console.error)
