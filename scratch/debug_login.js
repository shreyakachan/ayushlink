import puppeteer from "puppeteer-core"

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const FRONTEND_URL = "http://localhost:5173"

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function debugLogin() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  const page = await browser.newPage()
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()))
  await page.goto(FRONTEND_URL, { waitUntil: "networkidle0" })

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
    if (btn) btn.click()
  })
  await sleep(500)

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("ASHA Worker") || b.textContent.includes("आशा कार्यकर्ता"))
    if (btn) btn.click()
  })
  await sleep(500)

  console.log("Current Screen text on Login:", await page.evaluate(() => document.body.innerText.slice(0, 200)))

  // Focus and type directly with puppeteer keyboard
  await page.focus('input[type="tel"]')
  await page.keyboard.type("9876543210")
  await sleep(100)

  await page.focus('input[type="password"]')
  await page.keyboard.type("123456")
  await sleep(100)

  // Click login button
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const loginBtn = btns.find((b) => b.textContent.includes("Sign In") || b.textContent.includes("Login") || b.textContent.includes("लॉग इन"))
    if (loginBtn) loginBtn.click()
  })
  await sleep(2000)

  console.log("Current Screen text after Login:", await page.evaluate(() => document.body.innerText.slice(0, 500)))

  await browser.close()
}

debugLogin().catch(console.error)
