import puppeteer from "puppeteer-core"
import { execSync } from "child_process"

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const FRONTEND_URL = "http://localhost:5173"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function run() {
  console.log("Cleaning consultations...")
  execSync("python scratch/clean_consultations.py", { stdio: "inherit" })

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"],
  })

  const patContext = await browser.createBrowserContext()
  const docContext = await browser.createBrowserContext()

  const pPage = await patContext.newPage()
  const dPage = await docContext.newPage()

  // 1. Patient Login
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

  // Navigate to Video Consultation
  await pPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Talk to Doctor") || b.textContent.includes("Video Consultation"))
    if (btn) btn.click()
  })
  await sleep(2000)

  // Submit request
  await pPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const reqBtn = btns.find((b) => b.textContent.includes("Request Video Consultation"))
    if (reqBtn) reqBtn.click()
  })
  await sleep(2500)

  const isWaiting = await pPage.evaluate(() => document.body.innerText.includes("Video consultation request sent"))
  console.log("Patient in waiting stage:", isWaiting)

  // 2. Doctor Login
  await dPage.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
  await sleep(2800)
  await dPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
    if (btn) btn.click()
  })
  await sleep(800)
  await dPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Doctor") || b.textContent.includes("डॉक्टर"))
    if (btn) btn.click()
  })
  await sleep(800)
  await dPage.focus('input[type="tel"]')
  await dPage.keyboard.type("9823000001")
  await dPage.focus('input[type="password"]')
  await dPage.keyboard.type("DoctorSecurePass123")
  await dPage.evaluate(() => {
    const form = document.querySelector("form")
    if (form) form.requestSubmit()
  })
  await sleep(3000)

  // Doctor clicks Decline
  const declineClicked = await dPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const declineBtn = btns.find((b) => b.textContent.trim() === "Decline")
    if (declineBtn) {
      declineBtn.click()
      return true
    }
    return false
  })
  console.log("Doctor clicked Decline:", declineClicked)

  // Wait 1.8 seconds (1.2s polling)
  await sleep(1800)

  const patientText = await pPage.evaluate(() => document.body.innerText)
  const hasRejectionMsg = patientText.includes("Doctor is currently occupied or declined")
  const returnedToRequest = patientText.toLowerCase().includes("select available doctor")
  console.log("Patient has rejection error banner:", hasRejectionMsg)
  console.log("Patient automatically returned to request stage without refresh:", returnedToRequest)

  await browser.close()
  execSync("python scratch/clean_consultations.py", { stdio: "inherit" })
}

run()
