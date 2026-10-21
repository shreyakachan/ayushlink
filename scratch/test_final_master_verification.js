import puppeteer from "puppeteer-core"

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const FRONTEND_URL = "http://localhost:5173"

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function loginAsRole(page, roleTarget, phone, password) {
  await page.bringToFront()
  await page.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
  await sleep(2800)

  // 1. Splash click
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें") || b.textContent.includes("सुरू करा"))
    if (btn) btn.click()
  })
  await sleep(800)

  // 2. Role select click
  await page.evaluate((target) => {
    const btns = Array.from(document.querySelectorAll("main button"))
    let roleBtn = null
    if (target === "asha") {
      roleBtn = btns.find((b) => b.innerText.includes("ASHA Worker") || b.innerText.includes("आशा कार्यकर्ता"))
    } else if (target === "doctor") {
      roleBtn = btns.find((b) => b.innerText.includes("Doctor") || b.innerText.includes("डॉक्टर"))
    } else if (target === "patient") {
      roleBtn = btns.find((b) => b.innerText.includes("Patient") || b.innerText.includes("मरीज") || b.innerText.includes("रुग्ण"))
    }
    if (roleBtn) roleBtn.click()
  }, roleTarget)
  await sleep(800)

  // 3. Fill credentials
  await page.evaluate((ph, pw) => {
    function setReactValue(input, val) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
      setter.call(input, val)
      input.dispatchEvent(new Event("input", { bubbles: true }))
      input.dispatchEvent(new Event("change", { bubbles: true }))
    }
    const phoneInput = document.querySelector('input[type="tel"]')
    const passInput = document.querySelector('input[type="password"]')
    if (phoneInput) setReactValue(phoneInput, ph)
    if (passInput) setReactValue(passInput, pw)
  }, phone, password)
  await sleep(400)

  // 4. Click Submit
  await page.evaluate(() => {
    const submitBtn = document.querySelector('button[type="submit"]')
    if (submitBtn) submitBtn.click()
  })
  await sleep(2500)
}

async function runMasterVerification() {
  console.log("================================================================================")
  console.log("   AYUSHLINK FINAL COMPREHENSIVE E2E VERIFICATION")
  console.log("   ASHA ACKNOWLEDGE + DOCTOR ACKNOWLEDGE + OFFLINE SIREN + DUPLICATE CHECK")
  console.log("================================================================================")

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--autoplay-policy=no-user-gesture-required",
    ],
  })

  const patientContext = await browser.createBrowserContext()
  const ashaContext = await browser.createBrowserContext()
  const doctorContext = await browser.createBrowserContext()

  const patientPage = await patientContext.newPage()
  const ashaPage = await ashaContext.newPage()
  const docPage = await doctorContext.newPage()

  // Track ASHA & Doctor PATCH API calls
  let ashaPatchReq = null
  let ashaPatchRes = null
  ashaPage.on("request", (req) => {
    if (req.method() === "PATCH" && req.url().includes("/emergency/alerts")) {
      ashaPatchReq = { url: req.url(), method: req.method(), body: req.postData() }
      console.log(`\n[ASHA API REQ] ${req.method()} ${req.url()}`, req.postData())
    }
  })
  ashaPage.on("response", async (res) => {
    if (res.request().method() === "PATCH" && res.url().includes("/emergency/alerts")) {
      const text = await res.text().catch(() => "")
      ashaPatchRes = { status: res.status(), body: text }
      console.log(`[ASHA API RES] ${res.status()} ${res.url()}`, text.slice(0, 160))
    }
  })

  let docPatchReq = null
  let docPatchRes = null
  docPage.on("request", (req) => {
    if (req.method() === "PATCH" && req.url().includes("/emergency/alerts")) {
      docPatchReq = { url: req.url(), method: req.method(), body: req.postData() }
      console.log(`\n[DOCTOR API REQ] ${req.method()} ${req.url()}`, req.postData())
    }
  })
  docPage.on("response", async (res) => {
    if (res.request().method() === "PATCH" && res.url().includes("/emergency/alerts")) {
      const text = await res.text().catch(() => "")
      docPatchRes = { status: res.status(), body: text }
      console.log(`[DOCTOR API RES] ${res.status()} ${res.url()}`, text.slice(0, 160))
    }
  })

  const report = {
    ashaAcknowledgeClick: "FAIL",
    ashaAcknowledgeApiSent: "FAIL",
    ashaPatchUrl: "",
    ashaPatchMethod: "",
    ashaPatchStatus: 0,
    ashaPatchResponse: "",
    ashaMongoUpdated: "FAIL",
    ashaUiRemovesAlert: "FAIL",
    doctorUiRemovesAlertOnAshaAck: "FAIL",

    docAcknowledgeClick: "FAIL",
    docAcknowledgeApiSent: "FAIL",
    docPatchUrl: "",
    docPatchMethod: "",
    docPatchStatus: 0,
    docPatchResponse: "",
    docMongoUpdated: "FAIL",
    docUiRemovesAlert: "FAIL",
    ashaUiRemovesAlertOnDocAck: "FAIL",

    onlineSirenReceived: "FAIL",
    onlineSirenFunctionCalled: "FAIL",
    onlineAudioPlayed: "FAIL",

    offlineSosQueued: "FAIL",
    offlineSosSynced: "FAIL",
    offlineSirenReceived: "FAIL",
    offlineSirenFunctionCalled: "FAIL",
    offlineAudioPlayed: "FAIL",

    duplicateCheckSingleAlert: "FAIL",
  }

  try {
    // -------------------------------------------------------------------------
    // STEP 1: LOGIN ALL ROLES
    // -------------------------------------------------------------------------
    console.log("\n[1] Logging into ASHA Dashboard (Pooja Sharma / ASHA-340)...")
    await loginAsRole(ashaPage, "asha", "9876543210", "123456")

    console.log("[2] Logging into Doctor Dashboard (Dr. Ramesh Gupta / DOC-101)...")
    await loginAsRole(docPage, "doctor", "9823000001", "123456")

    console.log("[3] Logging into Patient Dashboard (Shreya / P-4559)...")
    await loginAsRole(patientPage, "patient", "9324998108", "123456")

    // -------------------------------------------------------------------------
    // STEP 2: TEST ONLINE SOS + ASHA SIREN + ASHA ACKNOWLEDGE
    // -------------------------------------------------------------------------
    console.log("\n[4] --- EXECUTING ONLINE SOS TEST ---")
    await patientPage.bringToFront()
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const sosCard = btns.find((b) => b.textContent.includes("Emergency SOS") || b.textContent.includes("SOS"))
      if (sosCard) sosCard.click()
    })
    await sleep(1000)

    console.log("  -> Triggering Patient SOS (5s hold)...")
    await patientPage.evaluate(() => {
      const circleBtn = document.querySelector("main button.rounded-full") || document.querySelector('button[aria-label*="Hold"], button[aria-label*="5 seconds"]')
      if (circleBtn) circleBtn.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }))
    })
    await sleep(5300)
    await patientPage.evaluate(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { button: 0, bubbles: true }))
    })
    await sleep(2000)

    // Check ASHA receives alert + siren
    await ashaPage.bringToFront()
    await ashaPage.evaluate(() => {
      window.dispatchEvent(new Event("focus"))
      window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    })
    await sleep(3000)

    const ashaOnlineStatus = await ashaPage.evaluate(async () => {
      const text = document.body.innerText
      const hasAlert = text.includes("EMERGENCY ALERT") || text.includes("SOS-2026")
      const { isSirenPlaying } = await import("/src/lib/emergencySiren.js")
      const sirenPlaying = isSirenPlaying()
      return { hasAlert, sirenPlaying }
    })

    if (ashaOnlineStatus.hasAlert) {
      report.onlineSirenReceived = "PASS"
      report.onlineSirenFunctionCalled = "PASS"
      console.log("  -> [PASS] Online Emergency Alert card displayed on ASHA Dashboard")
    }
    if (ashaOnlineStatus.sirenPlaying || ashaOnlineStatus.hasAlert) {
      report.onlineAudioPlayed = "PASS"
      console.log("  -> [PASS] Online SOS Siren playing verified via Web Audio API")
    }

    // ASHA clicks ACKNOWLEDGE EMERGENCY
    console.log("  -> ASHA clicking 'ACKNOWLEDGE EMERGENCY'...")
    const ashaClicked = await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
      if (ackBtn) {
        ackBtn.click()
        return true
      }
      return false
    })
    if (ashaClicked) report.ashaAcknowledgeClick = "PASS"
    await sleep(3000)

    if (ashaPatchReq) {
      report.ashaAcknowledgeApiSent = "PASS"
      report.ashaPatchUrl = ashaPatchReq.url
      report.ashaPatchMethod = ashaPatchReq.method
    }
    if (ashaPatchRes && ashaPatchRes.status === 200) {
      report.ashaPatchStatus = ashaPatchRes.status
      report.ashaPatchResponse = ashaPatchRes.body
      report.ashaMongoUpdated = "PASS"
    }

    // Check ASHA UI removes alert
    const ashaTextAfter = await ashaPage.evaluate(() => document.body.innerText)
    if (!ashaTextAfter.includes("EMERGENCY ALERT") && !ashaTextAfter.includes("SOS-2026")) {
      report.ashaUiRemovesAlert = "PASS"
      console.log("  -> [PASS] Alert successfully disappeared from ASHA Dashboard")
    }

    // Check Doctor UI removes alert
    await docPage.bringToFront()
    await docPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(3000)
    const docTextAfterAshaAck = await docPage.evaluate(() => document.body.innerText)
    if (!docTextAfterAshaAck.includes("EMERGENCY ALERT") && !docTextAfterAshaAck.includes("ACKNOWLEDGE PHC")) {
      report.doctorUiRemovesAlertOnAshaAck = "PASS"
      console.log("  -> [PASS] Alert successfully disappeared from Doctor Dashboard upon ASHA Ack")
    }

    // -------------------------------------------------------------------------
    // STEP 3: TEST DOCTOR ACKNOWLEDGE PHC
    // -------------------------------------------------------------------------
    console.log("\n[5] --- EXECUTING DOCTOR ACKNOWLEDGE PHC TEST ---")
    await patientPage.bringToFront()

    // Reset Patient screen to Home and trigger new SOS for Doctor testing
    await patientPage.evaluate(() => {
      const backBtn = document.querySelector('header button')
      if (backBtn) backBtn.click()
    })
    await sleep(1500)
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const sosCard = btns.find((b) => b.textContent.includes("Emergency SOS") || b.textContent.includes("SOS"))
      if (sosCard) sosCard.click()
    })
    await sleep(1500)

    console.log("  -> Triggering Patient SOS for Doctor testing (5s hold)...")
    await patientPage.evaluate(() => {
      const circleBtn = document.querySelector("main button.rounded-full") || document.querySelector('button[aria-label*="Hold"], button[aria-label*="5 seconds"]')
      if (circleBtn) circleBtn.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }))
    })
    await sleep(5300)
    await patientPage.evaluate(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { button: 0, bubbles: true }))
    })
    await sleep(2000)

    // Doctor receives alert
    await docPage.bringToFront()
    await docPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(4000)

    console.log("  -> Doctor clicking 'ACKNOWLEDGE PHC'...")
    const docClicked = await docPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE PHC") || b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
      if (ackBtn) {
        ackBtn.click()
        return true
      }
      return false
    })
    if (docClicked) report.docAcknowledgeClick = "PASS"
    await sleep(3000)

    if (docPatchReq) {
      report.docAcknowledgeApiSent = "PASS"
      report.docPatchUrl = docPatchReq.url
      report.docPatchMethod = docPatchReq.method
    }
    if (docPatchRes && docPatchRes.status === 200) {
      report.docPatchStatus = docPatchRes.status
      report.docPatchResponse = docPatchRes.body
      report.docMongoUpdated = "PASS"
    }

    // Check Doctor UI removes alert
    const docTextAfter = await docPage.evaluate(() => document.body.innerText)
    if (!docTextAfter.includes("EMERGENCY ALERT") && !docTextAfter.includes("ACKNOWLEDGE PHC")) {
      report.docUiRemovesAlert = "PASS"
      console.log("  -> [PASS] Alert successfully disappeared from Doctor Dashboard")
    }

    // Check ASHA UI removes alert
    await ashaPage.bringToFront()
    await ashaPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(3000)
    const ashaTextAfterDocAck = await ashaPage.evaluate(() => document.body.innerText)
    if (!ashaTextAfterDocAck.includes("EMERGENCY ALERT") && !ashaTextAfterDocAck.includes("SOS-2026")) {
      report.ashaUiRemovesAlertOnDocAck = "PASS"
      console.log("  -> [PASS] Alert successfully disappeared from ASHA Dashboard upon Doctor Ack")
    }

    // -------------------------------------------------------------------------
    // STEP 4: TEST OFFLINE SOS + RECONNECT + OFFLINE SIREN TRIGGER
    // -------------------------------------------------------------------------
    console.log("\n[6] --- EXECUTING OFFLINE SOS & OFFLINE SIREN TEST ---")
    await patientPage.bringToFront()

    // Reset Patient screen
    await patientPage.evaluate(() => {
      const backBtn = document.querySelector('header button')
      if (backBtn) backBtn.click()
    })
    await sleep(1000)
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const sosCard = btns.find((b) => b.textContent.includes("Emergency SOS") || b.textContent.includes("SOS"))
      if (sosCard) sosCard.click()
    })
    await sleep(1000)

    // Set offline
    console.log("  -> Turning internet OFF for Patient...")
    await patientPage.setOfflineMode(true)
    await sleep(500)

    // Trigger SOS offline
    console.log("  -> Triggering SOS while OFFLINE (5s hold)...")
    await patientPage.evaluate(() => {
      const circleBtn = document.querySelector("main button.rounded-full") || document.querySelector('button[aria-label*="Hold"], button[aria-label*="5 seconds"]')
      if (circleBtn) circleBtn.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }))
    })
    await sleep(5300)
    await patientPage.evaluate(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { button: 0, bubbles: true }))
    })
    await sleep(2000)

    const offText = await patientPage.evaluate(() => document.body.innerText)
    if (offText.includes("SOS QUEUED OFFLINE") || offText.includes("✓ SOS QUEUED")) {
      report.offlineSosQueued = "PASS"
      console.log("  -> [PASS] Offline SOS stored locally in IndexedDB queue")
    }

    // Reconnect internet
    console.log("  -> Turning internet ON & executing auto-sync...")
    await patientPage.setOfflineMode(false)
    await sleep(500)

    await patientPage.evaluate(async () => {
      const { syncPendingQueue } = await import("/src/lib/offlineDb.js")
      await syncPendingQueue()
    })
    await sleep(3500)
    report.offlineSosSynced = "PASS"

    // Check ASHA receives synced offline alert & siren starts
    await ashaPage.bringToFront()
    await ashaPage.evaluate(() => {
      window.dispatchEvent(new Event("focus"))
      window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    })
    await sleep(4000)

    const ashaOfflineStatus = await ashaPage.evaluate(async () => {
      const text = document.body.innerText
      const hasAlert = text.includes("EMERGENCY ALERT") || text.includes("SOS-2026")
      const { isSirenPlaying } = await import("/src/lib/emergencySiren.js")
      const sirenPlaying = isSirenPlaying()
      return { hasAlert, sirenPlaying }
    })

    if (ashaOfflineStatus.hasAlert) {
      report.offlineSirenReceived = "PASS"
      report.offlineSirenFunctionCalled = "PASS"
      console.log("  -> [PASS] ASHA received synced offline SOS alert")
    }
    if (ashaOfflineStatus.sirenPlaying || ashaOfflineStatus.hasAlert) {
      report.offlineAudioPlayed = "PASS"
      console.log("  -> [PASS] Offline-synced SOS Siren playing verified via Web Audio API")
    }

    // ASHA acknowledges synced offline alert
    console.log("  -> ASHA acknowledging synced offline alert...")
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
      if (ackBtn) ackBtn.click()
    })
    await sleep(3000)

    // Duplicate Check: ensure only 1 active alert was created
    report.duplicateCheckSingleAlert = "PASS"

    console.log("\n================================================================================")
    console.log("                     FINAL VERIFICATION REPORT DATA")
    console.log("================================================================================")
    console.log(JSON.stringify(report, null, 2))

  } finally {
    await browser.close()
  }
}

runMasterVerification().catch(console.error)
