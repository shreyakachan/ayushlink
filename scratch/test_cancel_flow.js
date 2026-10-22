import puppeteer from "puppeteer-core"

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const FRONTEND_URL = "http://localhost:5173"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function run() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"],
  })

  const pPage = await browser.newPage()

  await pPage.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
  await sleep(2800)
  await pPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
    if (btn) btn.click()
  })
  await sleep(800)
  await pPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Patient") || b.textContent.includes("मरीज"))
    if (btn) btn.click()
  })
  await sleep(800)

  await pPage.focus('input[type="tel"]')
  await pPage.keyboard.type("9324998108")
  await pPage.focus('input[type="password"]')
  await pPage.keyboard.type("123456")
  await pPage.evaluate(() => {
    const form = document.querySelector("form")
    if (form) form.requestSubmit()
  })
  await sleep(2000)

  await pPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Talk to Doctor") || b.textContent.includes("Video Consultation"))
    if (btn) btn.click()
  })
  await sleep(2000)

  console.log("Initial Screen Text:")
  console.log(await pPage.evaluate(() => document.body.innerText.slice(0, 200)))

  // Click Request Video Consultation
  await pPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const reqBtn = btns.find((b) => b.textContent.includes("Request Video Consultation"))
    if (reqBtn) reqBtn.click()
  })
  await sleep(2000)

  console.log("\nWaiting Stage Screen Text:")
  console.log(await pPage.evaluate(() => document.body.innerText.slice(0, 200)))

  // Click Cancel Request
  const cancelClicked = await pPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const cancelBtn = btns.find((b) => b.textContent.trim() === "Cancel Request")
    if (cancelBtn) {
      cancelBtn.click()
      return true
    }
    return false
  })
  console.log("\nCancel Clicked:", cancelClicked)
  await sleep(2000)

  console.log("\nScreen Text After Cancel:")
  const textAfterCancel = await pPage.evaluate(() => document.body.innerText)
  console.log(textAfterCancel.slice(0, 300))

  await browser.close()
}

run()
