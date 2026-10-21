import puppeteer from "puppeteer-core"

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const FRONTEND_URL = "http://localhost:5173"

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function passSplashAndChooseRole(page, roleTarget) {
  await page.bringToFront()
  await page.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
  await sleep(2800)

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें") || b.textContent.includes("सुरू करा"))
    if (btn) btn.click()
  })
  await sleep(800)

  await page.evaluate((target) => {
    const btns = Array.from(document.querySelectorAll("button"))
    let roleBtn = null
    if (target === "doctor") {
      roleBtn = btns.find((b) => b.textContent.includes("Doctor") || b.textContent.includes("डॉक्टर"))
    } else if (target === "patient") {
      roleBtn = btns.find((b) => b.textContent.includes("Patient") || b.textContent.includes("मरीज") || b.textContent.includes("रुग्ण"))
    }
    if (roleBtn) roleBtn.click()
  }, roleTarget)
  await sleep(800)
}

async function testDocAck() {
  console.log("=== TARGETED TEST: DOCTOR ACKNOWLEDGE PHC ===")
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"],
  })

  const patientContext = await browser.createBrowserContext()
  const doctorContext = await browser.createBrowserContext()

  const patientPage = await patientContext.newPage()
  const docPage = await doctorContext.newPage()

  docPage.on("request", (req) => {
    if (req.url().includes("/emergency/")) {
      console.log(`[DOC REQ] ${req.method()} ${req.url()}`, req.postData() || "")
    }
  })
  docPage.on("response", async (res) => {
    if (res.url().includes("/emergency/")) {
      const text = await res.text().catch(() => "")
      console.log(`[DOC RES] ${res.status()} ${res.url()}`, text.slice(0, 150))
    }
  })

  // 1. Login Doctor
  console.log("[1] Login Doctor...")
  await passSplashAndChooseRole(docPage, "doctor")
  await docPage.evaluate(() => {
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
  await sleep(500)
  await docPage.evaluate(() => {
    const submitBtn = document.querySelector('button[type="submit"]')
    if (submitBtn) submitBtn.click()
  })
  await sleep(2500)

  // 2. Login Patient
  console.log("[2] Login Patient...")
  await passSplashAndChooseRole(patientPage, "patient")
  await patientPage.evaluate(() => {
    function setReactValue(input, val) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
      setter.call(input, val)
      input.dispatchEvent(new Event("input", { bubbles: true }))
      input.dispatchEvent(new Event("change", { bubbles: true }))
    }
    const phoneInput = document.querySelector('input[type="tel"]')
    const passInput = document.querySelector('input[type="password"]')
    if (phoneInput) setReactValue(phoneInput, "9324998108")
    if (passInput) setReactValue(passInput, "123456")
  })
  await sleep(500)
  await patientPage.evaluate(() => {
    const submitBtn = document.querySelector('button[type="submit"]')
    if (submitBtn) submitBtn.click()
  })
  await sleep(2500)

  // 3. Patient triggers SOS
  console.log("[3] Patient triggers Online SOS...")
  await patientPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const sosCard = btns.find((b) => b.textContent.includes("Emergency SOS") || b.textContent.includes("SOS"))
    if (sosCard) sosCard.click()
  })
  await sleep(1000)

  await patientPage.evaluate(() => {
    const circleBtn = document.querySelector("main button.rounded-full") || document.querySelector('button[aria-label*="Hold"], button[aria-label*="5 seconds"]')
    if (circleBtn) circleBtn.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }))
  })
  await sleep(5300)
  await patientPage.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerup", { button: 0, bubbles: true }))
  })
  await sleep(2000)

  // 4. Doctor checks alert
  console.log("[4] Doctor checking alert...")
  await docPage.bringToFront()
  await docPage.evaluate(() => window.dispatchEvent(new Event("focus")))
  await sleep(4000)

  const docDomBefore = await docPage.evaluate(() => {
    const text = document.body.innerText
    const btns = Array.from(document.querySelectorAll("button")).map((b) => b.innerText.trim())
    return { hasEmergencyAlertText: text.includes("EMERGENCY ALERT"), buttons: btns }
  })
  console.log("Doctor DOM before click:", JSON.stringify(docDomBefore, null, 2))

  // 5. Doctor clicks ACKNOWLEDGE PHC
  console.log("[5] Doctor clicking ACKNOWLEDGE PHC...")
  const docClicked = await docPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE PHC") || b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
    if (ackBtn) {
      ackBtn.click()
      return true
    }
    return false
  })
  console.log("Doctor clicked result:", docClicked)
  await sleep(3000)

  const docDomAfter = await docPage.evaluate(() => {
    const text = document.body.innerText
    return { hasEmergencyAlertText: text.includes("EMERGENCY ALERT") }
  })
  console.log("Doctor DOM after click:", JSON.stringify(docDomAfter, null, 2))

  await browser.close()
}

testDocAck().catch(console.error)
