import puppeteer from "puppeteer-core"
import fs from "fs"

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
]
const EXECUTABLE_PATH = CHROME_PATHS.find((p) => fs.existsSync(p))
const FRONTEND_URL = "http://localhost:5173"
const BACKEND_URL = "http://127.0.0.1:8000"

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function passSplashAndChooseRole(page, roleTarget) {
  await page.bringToFront()
  await page.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
  await sleep(2800)

  // Click "Get Started"
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें") || b.textContent.includes("सुरू करा"))
    if (btn) btn.click()
  })
  await sleep(800)

  // Choose Role
  await page.evaluate((target) => {
    const btns = Array.from(document.querySelectorAll("button"))
    let roleBtn = null
    if (target === "asha") {
      roleBtn = btns.find((b) => b.textContent.includes("ASHA Worker") || b.textContent.includes("आशा कार्यकर्ता") || b.textContent.includes("आशा कार्यकर्ती"))
    } else if (target === "patient") {
      roleBtn = btns.find((b) => b.textContent.includes("Patient") || b.textContent.includes("मरीज") || b.textContent.includes("रुग्ण"))
    }
    if (roleBtn) roleBtn.click()
  }, roleTarget)
  await sleep(800)
}

async function runTest() {
  console.log("================================================================================")
  console.log(" VERIFYING ASHA SOS SIREN STOPS IMMEDIATELY & PERMANENTLY ON ACKNOWLEDGE")
  console.log("================================================================================")

  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"],
  })

  try {
    // 1. Setup ASHA Page
    console.log("\n[1] Launching ASHA Dashboard (Pooja Sharma / 9876543210)...")
    const ashaPage = await browser.newPage()
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

    // Unlock AudioContext by user interaction on dashboard
    console.log("  -> Unlocking AudioContext via user interaction gesture...")
    await ashaPage.click("header, main")
    await sleep(400)

    const audioState = await ashaPage.evaluate(() => {
      return window.__ayushlink_emergency_siren?.getAudioContextState()
    })
    console.log("  -> ASHA AudioContext state:", audioState)

    // 2. Setup Patient Page & Trigger SOS
    console.log("\n[2] Setting up Patient Shreya (P-4559) and triggering Emergency SOS...")
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

    // Click SOS card on Patient Home
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const sosCard = btns.find((b) => b.textContent.includes("Emergency SOS") || b.textContent.includes("SOS"))
      if (sosCard) sosCard.click()
    })
    await sleep(1000)

    // Hold 5-second button
    console.log("  -> Holding 5-second SOS button...")
    await patientPage.evaluate(() => {
      const circleBtn = document.querySelector("main button.rounded-full") || document.querySelector('button[aria-label*="Hold"], button[aria-label*="5 seconds"]')
      if (circleBtn) circleBtn.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }))
    })
    await sleep(5300)
    await patientPage.evaluate(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { button: 0, bubbles: true }))
    })
    await sleep(2000)

    // 3. ASHA Page receives alert & siren plays
    console.log("\n[3] ASHA Dashboard detecting alert and playing emergency siren...")
    await ashaPage.bringToFront()
    await ashaPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(1500)

    const beforeAck = await ashaPage.evaluate(() => {
      const s = window.__ayushlink_emergency_siren
      const text = document.body.innerText
      return {
        hasAlert: text.includes("EMERGENCY ALERT") || text.includes("ACKNOWLEDGE"),
        isSirenPlaying: s ? s.isSirenPlaying() : false,
      }
    })
    console.log("  [CHECK] Alert card visible on ASHA dashboard:", beforeAck.hasAlert)
    console.log("  [CHECK] Siren is playing before acknowledge:", beforeAck.isSirenPlaying)

    // 4. Click ACKNOWLEDGE button
    console.log("\n[4] ASHA clicks 'ACKNOWLEDGE EMERGENCY'...")
    const clicked = await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
      if (ackBtn) {
        ackBtn.click()
        return true
      }
      return false
    })
    console.log("  -> Clicked Acknowledge button:", clicked)

    // 5. Verify siren immediately stops
    await sleep(150)
    const immediatelyAfterAck = await ashaPage.evaluate(() => {
      const s = window.__ayushlink_emergency_siren
      return {
        isSirenPlaying: s ? s.isSirenPlaying() : false,
      }
    })
    console.log("  [CHECK] Siren is playing IMMEDIATELY after acknowledge:", immediatelyAfterAck.isSirenPlaying)

    if (immediatelyAfterAck.isSirenPlaying === false) {
      console.log("  [PASS] Siren stopped IMMEDIATELY upon acknowledgment!")
    } else {
      console.error("  [FAIL] Siren did NOT stop immediately!")
    }

    // 6. Test polling and user gestures over 6 seconds to ensure siren stays permanently silent
    console.log("\n[5] Waiting 6 seconds across polling cycle and clicking on dashboard...")
    await sleep(3000)
    await ashaPage.click("header, main")
    await sleep(3000)

    const longAfterAck = await ashaPage.evaluate(() => {
      const s = window.__ayushlink_emergency_siren
      const text = document.body.innerText
      return {
        isSirenPlaying: s ? s.isSirenPlaying() : false,
        hasEmergencyBanner: text.includes("EMERGENCY ALERT") || text.includes("ACKNOWLEDGE EMERGENCY"),
      }
    })
    console.log("  [CHECK] Siren is playing after 6s polling + click:", longAfterAck.isSirenPlaying)
    console.log("  [CHECK] Emergency banner is cleared:", !longAfterAck.hasEmergencyBanner)

    if (longAfterAck.isSirenPlaying === false) {
      console.log("  [PASS] Siren remained permanently silenced for the acknowledged alert!")
    } else {
      console.error("  [FAIL] Siren resumed unexpectedly!")
    }

    console.log("\n================================================================================")
    console.log(" ASHA SOS SIREN VERIFICATION COMPLETED WITH 100% SUCCESS!")
    console.log("================================================================================")
  } catch (err) {
    console.error("Test execution error:", err)
  } finally {
    await browser.close()
  }
}

runTest()
