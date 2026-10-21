import puppeteer from "puppeteer-core"

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const FRONTEND_URL = "http://localhost:5173"

async function debugDoctor() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  const page = await browser.newPage()
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()))
  await page.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
  await new Promise((r) => setTimeout(r, 2800))

  // Click Get Started
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Get Started"))
    if (btn) btn.click()
  })
  await new Promise((r) => setTimeout(r, 800))

  const roleBtns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("main button")).map((b) => b.innerText.trim())
  })
  console.log("Role buttons found:\n", roleBtns)

  // Click Doctor button
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("main button"))
    const docBtn = btns.find((b) => b.innerText.includes("Doctor"))
    if (docBtn) docBtn.click()
  })
  await new Promise((r) => setTimeout(r, 800))

  const loginText = await page.evaluate(() => document.body.innerText)
  console.log("After choosing Doctor, page text:\n", loginText.slice(0, 300))

  // Type Doctor credentials
  await page.evaluate(() => {
    function setReactValue(input, val) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
      setter.call(input, val)
      input.dispatchEvent(new Event("input", { bubbles: true }))
      input.dispatchEvent(new Event("change", { bubbles: true }))
    }
    const phoneInput = document.querySelector('input[type="tel"]')
    const passInput = document.querySelector('input[type="password"]')
    if (phoneInput) setReactValue(phoneInput, "9823000001")
    if (passInput) setReactValue(passInput, "123456")
  })
  await new Promise((r) => setTimeout(r, 400))

  await page.evaluate(() => {
    const submitBtn = document.querySelector('button[type="submit"]')
    if (submitBtn) submitBtn.click()
  })
  await new Promise((r) => setTimeout(r, 2500))

  const docDashboardText = await page.evaluate(() => document.body.innerText)
  console.log("After Doctor Login, dashboard text:\n", docDashboardText.slice(0, 300))
  console.log("Doctor logged in successfully:", docDashboardText.includes("Ramesh") || docDashboardText.includes("Doctor"))

  await browser.close()
}

debugDoctor().catch(console.error)
