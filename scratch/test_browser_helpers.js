import puppeteer from "puppeteer-core"

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const FRONTEND_URL = "http://localhost:5173"

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function testHelpers() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  const page = await browser.newPage()
  await page.goto(FRONTEND_URL, { waitUntil: "networkidle0" })

  // 1. Splash Screen -> Click Get Started
  console.log("[1] Checking Splash Screen...")
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
    if (btn) btn.click()
  })
  await sleep(600)

  // 2. Role Select -> Click ASHA Worker
  console.log("[2] Role Select -> Clicking ASHA Worker...")
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("ASHA Worker") || b.textContent.includes("आशा कार्यकर्ता"))
    if (btn) btn.click()
  })
  await sleep(600)

  // 3. Login ASHA: Type phone and password using React-compatible input dispatch
  console.log("[3] Login Screen -> Typing ASHA credentials (9876543210 / 123456)...")
  await page.evaluate(() => {
    function setReactValue(input, value) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
      setter.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
      input.dispatchEvent(new Event("change", { bubbles: true }))
    }
    const phoneInput = document.querySelector('input[type="tel"]')
    const passInput = document.querySelector('input[type="password"]')
    if (phoneInput) setReactValue(phoneInput, "9876543210")
    if (passInput) setReactValue(passInput, "123456")
  })
  await sleep(300)

  // Submit form
  await page.evaluate(() => {
    const form = document.querySelector("form")
    if (form) form.requestSubmit()
  })
  await sleep(1500)

  const dashboardText = await page.evaluate(() => document.body.innerText)
  console.log("Dashboard Loaded? Has Pooja Sharma:", dashboardText.includes("Pooja Sharma"))
  console.log("Has ASHA Worker:", dashboardText.includes("ASHA") || dashboardText.includes("आशा"))

  await browser.close()
}

testHelpers().catch(console.error)
