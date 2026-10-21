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

async function runIsolatedAckTest() {
  console.log("================================================================================")
  console.log("   E2E ISOLATED RE-VERIFICATION: ASHA ACKNOWLEDGE & LIFECYCLE")
  console.log("================================================================================")

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"],
  })

  // Create isolated browser contexts so localStorage does NOT bleed between roles!
  const patientContext = await browser.createBrowserContext()
  const ashaContext = await browser.createBrowserContext()
  const doctorContext = await browser.createBrowserContext()

  const patientPage = await patientContext.newPage()
  const ashaPage = await ashaContext.newPage()
  const docPage = await doctorContext.newPage()

  // Track ASHA network
  let lastPatchReq = null
  let lastPatchRes = null
  ashaPage.on("request", (req) => {
    if (req.method() === "PATCH" && req.url().includes("/emergency/alerts")) {
      lastPatchReq = { url: req.url(), method: req.method(), body: req.postData(), headers: req.headers() }
      console.log(`[ASHA INTERCEPT REQ] ${req.method()} ${req.url()}`, req.postData())
    }
  })
  ashaPage.on("response", async (res) => {
    if (res.request().method() === "PATCH" && res.url().includes("/emergency/alerts")) {
      const text = await res.text().catch(() => "")
      lastPatchRes = { status: res.status(), body: text }
      console.log(`[ASHA INTERCEPT RES] ${res.status()} ${res.url()}`, text.slice(0, 150))
    }
  })

  try {
    // 1. Authenticate ASHA (Pooja Sharma / ASHA-340)
    console.log("\n[1] Logging into ASHA Dashboard (Pooja Sharma / ASHA-340)...")
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

    // 2. Authenticate Doctor (Dr. Ramesh Gupta / DOC-101)
    console.log("[2] Logging into Doctor Dashboard (Dr. Ramesh Gupta / DOC-101)...")
    await passSplashAndChooseRole(docPage, "doctor")
    await docPage.focus('input[type="tel"]')
    await docPage.keyboard.type("9823000001")
    await sleep(100)
    await docPage.focus('input[type="password"]')
    await docPage.keyboard.type("123456")
    await sleep(100)
    await docPage.evaluate(() => {
      const form = document.querySelector("form")
      if (form) form.requestSubmit()
    })
    await sleep(2500)

    // 3. Authenticate Patient (Shreya / P-4559)
    console.log("[3] Logging into Patient Dashboard (Shreya / P-4559)...")
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

    // 4. TEST 1 — ONLINE SOS & ASHA ACKNOWLEDGMENT
    console.log("\n[4] --- TEST 1: ONLINE SOS & ASHA ACKNOWLEDGEMENT ---")
    await patientPage.bringToFront()
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const sosCard = btns.find((b) => b.textContent.includes("Emergency SOS") || b.textContent.includes("SOS"))
      if (sosCard) sosCard.click()
    })
    await sleep(1000)

    // Hold SOS for 5.3s
    console.log("  -> Patient triggering SOS (5s hold)...")
    await patientPage.evaluate(() => {
      const circleBtn = document.querySelector("main button.rounded-full") || document.querySelector('button[aria-label*="Hold"], button[aria-label*="5 seconds"]')
      if (circleBtn) circleBtn.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }))
    })
    await sleep(5300)
    await patientPage.evaluate(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { button: 0, bubbles: true }))
    })
    await sleep(2000)

    const patText = await patientPage.evaluate(() => document.body.innerText)
    console.log(`  -> Patient Status: ${patText.includes("SOS SENT") ? "✓ SOS SENT" : "Failed"}`)

    // Check ASHA receives alert
    await ashaPage.bringToFront()
    await ashaPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(2000)

    let ashaAlertText = await ashaPage.evaluate(() => document.body.innerText)
    console.log(`  -> ASHA Alert Visible: ${ashaAlertText.includes("EMERGENCY ALERT")}`)

    // Check Doctor receives alert
    await docPage.bringToFront()
    await docPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(4000)

    let docAlertText = await docPage.evaluate(() => document.body.innerText)
    console.log(`  -> Doctor Alert Visible: ${docAlertText.includes("EMERGENCY ALERT")}`)

    // ASHA clicks ACKNOWLEDGE EMERGENCY
    console.log("  -> ASHA clicking 'ACKNOWLEDGE EMERGENCY'...")
    await ashaPage.bringToFront()
    const clicked = await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
      if (ackBtn) {
        ackBtn.click()
        return true
      }
      return false
    })
    console.log(`  -> ASHA click performed: ${clicked}`)
    await sleep(3000)

    // Verify disappeared from ASHA
    const ashaTextAfterAck = await ashaPage.evaluate(() => document.body.innerText)
    const ashaCardDisappeared = !ashaTextAfterAck.includes("EMERGENCY ALERT")
    console.log(`  -> Disappeared from ASHA screen: ${ashaCardDisappeared}`)

    // Verify disappeared from Doctor
    await docPage.bringToFront()
    await docPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(4000)
    const docTextAfterAck = await docPage.evaluate(() => document.body.innerText)
    const docCardDisappeared = !docTextAfterAck.includes("EMERGENCY ALERT")
    console.log(`  -> Disappeared from Doctor screen: ${docCardDisappeared}`)

    // Wait full polling interval (7s) on ASHA to verify it DOES NOT resurrect
    console.log("  -> Waiting 7 seconds for polling cycle...")
    await ashaPage.bringToFront()
    await sleep(7500)
    const ashaTextAfterPolling = await ashaPage.evaluate(() => document.body.innerText)
    const ashaRemainsDisappeared = !ashaTextAfterPolling.includes("EMERGENCY ALERT")
    console.log(`  -> Remains disappeared after polling: ${ashaRemainsDisappeared}`)

    // 5. TEST 2 — OFFLINE SOS -> RECONNECT -> SYNC -> ASHA ACKNOWLEDGMENT
    console.log("\n[5] --- TEST 2: OFFLINE SOS -> SYNC -> ASHA ACKNOWLEDGEMENT ---")
    await patientPage.bringToFront()

    // Reset Patient to Home and re-open SOS screen
    console.log("  -> Resetting Patient Screen to Fresh SOS state...")
    await patientPage.evaluate(() => {
      const backBtn = document.querySelector('header button[aria-label*="Back"]') || document.querySelector("header button")
      if (backBtn) backBtn.click()
    })
    await sleep(1000)

    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const sosCard = btns.find((b) => b.textContent.includes("Emergency SOS") || b.textContent.includes("SOS"))
      if (sosCard) sosCard.click()
    })
    await sleep(1000)

    // Simulate offline
    console.log("  -> Simulating Patient Offline...")
    await patientPage.setOfflineMode(true)
    await sleep(500)

    // Trigger SOS offline
    console.log("  -> Triggering SOS while offline (5s hold)...")
    await patientPage.evaluate(() => {
      const circleBtn = document.querySelector("main button.rounded-full") || document.querySelector('button[aria-label*="Hold"], button[aria-label*="5 seconds"]')
      if (circleBtn) circleBtn.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }))
    })
    await sleep(5300)
    await patientPage.evaluate(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { button: 0, bubbles: true }))
    })
    await sleep(2000)

    const offlineSentText = await patientPage.evaluate(() => document.body.innerText)
    console.log(`  -> Offline SOS Queue Status: ${offlineSentText.includes("SOS QUEUED") ? "✓ SOS QUEUED OFFLINE" : "Failed"}`)

    // Reconnect network
    console.log("  -> Reconnecting network & triggering sync...")
    await patientPage.setOfflineMode(false)
    await sleep(500)

    await patientPage.evaluate(async () => {
      const { syncPendingQueue } = await import("/src/lib/offlineDb.js")
      await syncPendingQueue()
    })
    await sleep(3500)

    // Check ASHA receives synced offline SOS
    await ashaPage.bringToFront()
    await ashaPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(4000)

    const ashaSyncedAlertText = await ashaPage.evaluate(() => document.body.innerText)
    console.log(`  -> ASHA Received Synced Offline Alert: ${ashaSyncedAlertText.includes("EMERGENCY ALERT")}`)

    // Check Doctor receives synced offline SOS
    await docPage.bringToFront()
    await docPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(4000)
    const docSyncedAlertText = await docPage.evaluate(() => document.body.innerText)
    console.log(`  -> Doctor Received Synced Offline Alert: ${docSyncedAlertText.includes("EMERGENCY ALERT")}`)

    // ASHA Acknowledges synced alert
    console.log("  -> ASHA clicking 'ACKNOWLEDGE EMERGENCY' on Synced Alert...")
    await ashaPage.bringToFront()
    const clickedSynced = await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
      if (ackBtn) {
        ackBtn.click()
        return true
      }
      return false
    })
    console.log(`  -> Synced Alert ASHA click performed: ${clickedSynced}`)
    await sleep(3000)

    // Verify disappeared from ASHA & Doctor
    const ashaAfterSyncedAck = await ashaPage.evaluate(() => document.body.innerText)
    const docAfterSyncedAck = await docPage.evaluate(() => document.body.innerText)
    const syncedDisappearedAsha = !ashaAfterSyncedAck.includes("EMERGENCY ALERT")
    const syncedDisappearedDoc = !docAfterSyncedAck.includes("EMERGENCY ALERT")
    console.log(`  -> Synced Alert disappeared from ASHA: ${syncedDisappearedAsha}`)
    console.log(`  -> Synced Alert disappeared from Doctor: ${syncedDisappearedDoc}`)

    console.log("\n================================================================================")
    console.log("                     ISOLATED RE-VERIFICATION SUMMARY")
    console.log("================================================================================")
    console.log("LAST PATCH REQ:", JSON.stringify(lastPatchReq, null, 2))
    console.log("LAST PATCH RES:", JSON.stringify(lastPatchRes, null, 2))
    console.log({
      ashaAcknowledgeButton: clicked && clickedSynced ? "PASS" : "FAIL",
      backendAcknowledgeApi: lastPatchRes?.status === 200 ? "PASS" : "FAIL",
      sosDisappearsFromAsha: ashaCardDisappeared ? "PASS" : "FAIL",
      sosDisappearsFromDoctor: docCardDisappeared ? "PASS" : "FAIL",
      remainsDisappearedAfterPolling: ashaRemainsDisappeared ? "PASS" : "FAIL",
      offlineSyncedAcknowledge: !ashaAfterSyncedAck.includes("EMERGENCY ALERT") ? "PASS" : "FAIL",
    })
  } finally {
    await browser.close()
  }
}

runIsolatedAckTest().catch(console.error)
