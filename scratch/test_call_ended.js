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

  // Patient
  const patPage = await browser.newPage()
  await patPage.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
  await sleep(2800)
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

  // Doctor
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

  // Accept
  await docPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const acceptBtn = btns.find((b) => b.textContent.trim() === "Accept")
    if (acceptBtn) acceptBtn.click()
  })
  await sleep(2000)

  // Join call on both
  await patPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const joinBtn = btns.find((b) => b.textContent.includes("Join Video Consultation"))
    if (joinBtn) joinBtn.click()
  })
  await sleep(1000)
  await docPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const joinBtn = btns.find((b) => b.textContent.includes("Join Video Consultation"))
    if (joinBtn) joinBtn.click()
  })
  await sleep(3000)

  console.log("Doctor ending call...")
  await docPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const endBtn = btns.find((b) => b.title === "End Call" || b.textContent.includes("End Call") || b.className.includes("bg-red-600"))
    if (endBtn) endBtn.click()
  })
  await sleep(1000)

  // Bring patPage to front to allow WebSocket message processing
  await patPage.bringToFront()
  await sleep(2000)

  const patText = await patPage.evaluate(() => document.body.innerText)
  console.log("Patient screen text after call ended:", patText.slice(0, 300))
  console.log("Patient ended stage reached:", patText.includes("Consultation Ended") || patText.includes("Return to Dashboard"))

  await browser.close()
}

run()
