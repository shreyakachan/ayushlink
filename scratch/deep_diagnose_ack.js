import puppeteer from "puppeteer-core"

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const FRONTEND_URL = "http://localhost:5173"
const BACKEND_URL = "http://127.0.0.1:8000/api"

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
    if (target === "asha") {
      roleBtn = btns.find((b) => b.textContent.includes("ASHA Worker") || b.textContent.includes("आशा कार्यकर्ता") || b.textContent.includes("आशा कार्यकर्ती"))
    } else if (target === "doctor") {
      roleBtn = btns.find((b) => b.textContent.includes("Doctor") || b.textContent.includes("डॉक्टर"))
    } else if (target === "patient") {
      roleBtn = btns.find((b) => b.textContent.includes("Patient") || b.textContent.includes("मरीज") || b.textContent.includes("रुग्ण"))
    }
    if (roleBtn) roleBtn.click()
  }, roleTarget)
  await sleep(800)
}

async function deepDiagnose() {
  console.log("=== DEEP DIAGNOSIS OF ASHA ACKNOWLEDGE BUTTON ===")
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"],
  })

  // 1. Patient Page
  const patientPage = await browser.newPage()
  await passSplashAndChooseRole(patientPage, "patient")

  await patientPage.focus('input[type="tel"]')
  await patientPage.keyboard.type("9324998108")
  await sleep(100)
  await patientPage.focus('input[type="password"]')
  await patientPage.keyboard.type("123456")
  await sleep(100)

  await patientPage.evaluate(() => {
    const form = document.querySelector("form")
    if (form) form.requestSubmit()
  })
  await sleep(2500)

  // 2. ASHA Page
  const ashaPage = await browser.newPage()
  
  // Attach comprehensive network & console inspectors
  ashaPage.on("console", (msg) => {
    console.log(`[ASHA CONSOLE] [${msg.type()}] ${msg.text()}`)
  })
  ashaPage.on("request", (req) => {
    if (req.url().includes("/emergency") || req.url().includes("/api/")) {
      console.log(`[ASHA REQ] ${req.method()} ${req.url()}`)
      const postData = req.postData()
      if (postData) console.log(`  Payload: ${postData}`)
      console.log(`  Auth Header: ${req.headers()["authorization"] || "NONE"}`)
    }
  })
  ashaPage.on("response", async (res) => {
    if (res.url().includes("/emergency") || res.url().includes("/api/")) {
      let body = ""
      try {
        body = await res.text()
      } catch (e) {
        body = `<error reading body: ${e.message}>`
      }
      console.log(`[ASHA RES] ${res.status()} ${res.url()}`)
      console.log(`  Body: ${body.slice(0, 300)}`)
    }
  })

  await passSplashAndChooseRole(ashaPage, "asha")
  await ashaPage.focus('input[type="tel"]')
  await ashaPage.keyboard.type("9876543210")
  await sleep(100)
  await ashaPage.focus('input[type="password"]')
  await ashaPage.keyboard.type("123456")
  await sleep(100)

  await ashaPage.evaluate(() => {
    const form = document.querySelector("form")
    if (form) form.requestSubmit()
  })
  await sleep(2500)

  // 3. Trigger Patient SOS
  console.log("\n--- TRIGGERING PATIENT SOS ---")
  await patientPage.bringToFront()
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
  console.log("--- PATIENT SOS SENT ---")

  // 4. Switch to ASHA Page and inspect
  console.log("\n--- SWITCHING TO ASHA PAGE ---")
  await ashaPage.bringToFront()
  await ashaPage.evaluate(() => window.dispatchEvent(new Event("focus")))
  await sleep(2000)

  // Check what emergency alert is in DOM
  const emergencyDomInfo = await ashaPage.evaluate(() => {
    const card = document.querySelector("section.flex.flex-col.gap-4")
    const btns = Array.from(document.querySelectorAll("button"))
    const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
    return {
      hasCard: !!card,
      cardText: card ? card.innerText : null,
      hasAckBtn: !!ackBtn,
      ackBtnText: ackBtn ? ackBtn.innerText : null,
      ackBtnDisabled: ackBtn ? ackBtn.disabled : null,
    }
  })
  console.log("ASHA Emergency DOM Info Before Click:", JSON.stringify(emergencyDomInfo, null, 2))

  // 5. CLICK the Acknowledge Button
  console.log("\n--- EXECUTING PHYSICAL MOUSE CLICK ON ACKNOWLEDGE BUTTON ---")
  const clickResult = await ashaPage.evaluate(async () => {
    const btns = Array.from(document.querySelectorAll("button"))
    const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
    if (!ackBtn) return { error: "Button not found in DOM" }
    
    // Check bounding rect
    const rect = ackBtn.getBoundingClientRect()
    ackBtn.click()
    return { success: true, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }
  })
  console.log("Click execution result:", clickResult)

  // Wait 4 seconds to observe network traffic, polling, state changes
  console.log("\n--- WAITING 4 SECONDS TO OBSERVE POST-CLICK BEHAVIOR ---")
  await sleep(4000)

  const emergencyDomInfoAfter = await ashaPage.evaluate(() => {
    const text = document.body.innerText
    const btns = Array.from(document.querySelectorAll("button"))
    const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
    return {
      hasEmergencyAlertText: text.includes("EMERGENCY ALERT"),
      hasAckBtn: !!ackBtn,
      ackBtnText: ackBtn ? ackBtn.innerText : null,
      hasAcknowledgedText: text.includes("Emergency Acknowledged") || text.includes("Status: ASHA_ACKNOWLEDGED"),
    }
  })
  console.log("ASHA Emergency DOM Info After Click:", JSON.stringify(emergencyDomInfoAfter, null, 2))

  // 6. Polling check (wait 8 seconds for polling interval)
  console.log("\n--- WAITING 8 SECONDS TO OBSERVE POLLING RECOVERY / RESURRECTION ---")
  await sleep(8000)

  const emergencyDomInfoAfterPolling = await ashaPage.evaluate(() => {
    const text = document.body.innerText
    const btns = Array.from(document.querySelectorAll("button"))
    const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
    return {
      hasEmergencyAlertText: text.includes("EMERGENCY ALERT"),
      hasAckBtn: !!ackBtn,
      ackBtnText: ackBtn ? ackBtn.innerText : null,
    }
  })
  console.log("ASHA Emergency DOM Info After Polling:", JSON.stringify(emergencyDomInfoAfterPolling, null, 2))

  await browser.close()
  console.log("\n=== DEEP DIAGNOSIS COMPLETED ===")
}

deepDiagnose().catch(console.error)
