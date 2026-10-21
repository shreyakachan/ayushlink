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
  })

  const page = await browser.newPage()
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
    const btn = btns.find((b) => b.textContent.includes("Doctor") || b.textContent.includes("डॉक्टर"))
    if (btn) btn.click()
  })
  await sleep(800)

  // Type phone & pass
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

  const text = await page.evaluate(() => document.body.innerText)
  console.log("Doctor Dashboard text snippet:\n", text.slice(0, 400))
  console.log("Has Dr. Arvind Varma:", text.includes("Dr. Arvind Varma") || text.includes("Dr Arvind Varma"))
  console.log("Has DOC-501:", text.includes("DOC-501"))

  await browser.close()
}

testDoc().catch(console.error)
