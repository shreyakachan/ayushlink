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

async function test() {
  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  const page = await browser.newPage()
  
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()))

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

  // Type phone & pass
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

  const text = await page.evaluate(() => document.body.innerText)
  console.log("Dashboard Loaded? Has Pooja Sharma:", text.includes("Pooja Sharma"))

  // Now test AudioContext state before and after user gesture
  const preAudio = await page.evaluate(() => {
    const s = window.__ayushlink_emergency_siren
    return {
      state: s ? s.getAudioContextState() : "no siren object",
      isPlaying: s ? s.isSirenPlaying() : false,
    }
  })
  console.log("AudioContext state BEFORE user gesture:", preAudio)

  // Real user click on the dashboard main element
  await page.click("main")
  await sleep(500)

  const postAudio = await page.evaluate(() => {
    const s = window.__ayushlink_emergency_siren
    return {
      state: s ? s.getAudioContextState() : "no siren object",
      isPlaying: s ? s.isSirenPlaying() : false,
    }
  })
  console.log("AudioContext state AFTER user gesture:", postAudio)

  await browser.close()
}

test().catch(console.error)
