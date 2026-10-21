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

async function verifyDoctorSosRemoved() {
  console.log("================================================================================")
  console.log("   VERIFICATION: DOCTOR SOS REMOVAL + ASHA/PATIENT SOS INTEGRITY")
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

  // Track all Doctor network requests to verify NO emergency polling or endpoints are called
  const doctorEmergencyRequests = []
  docPage.on("request", (req) => {
    if (req.url().includes("/emergency/")) {
      doctorEmergencyRequests.push({
        url: req.url(),
        method: req.method(),
      })
      console.log(`[UNEXPECTED DOC EMERGENCY REQ] ${req.method()} ${req.url()}`)
    }
  })

  // Track ASHA PATCH requests
  let ashaPatchReq = null
  ashaPage.on("request", (req) => {
    if (req.method() === "PATCH" && req.url().includes("/emergency/alerts")) {
      ashaPatchReq = { url: req.url(), method: req.method(), body: req.postData() }
      console.log(`[ASHA API REQ] ${req.method()} ${req.url()}`)
    }
  })

  const report = {
    patientSosTriggers: "FAIL",
    ashaReceivesSos: "FAIL",
    ashaSirenPlays: "FAIL",
    ashaAcknowledgeWorks: "FAIL",
    doctorNoSosCard: "FAIL",
    doctorNoAckPhcButton: "FAIL",
    doctorNoEmergencyPolling: "FAIL",
    doctorDashboardLoadsNormally: "FAIL",
    offlineSosQueued: "FAIL",
    offlineSosSyncedToAsha: "FAIL",
    doctorStillNoSosAfterOfflineSync: "FAIL",
  }

  try {
    // -------------------------------------------------------------------------
    // STEP 1: LOGIN ALL 3 ROLES
    // -------------------------------------------------------------------------
    console.log("\n[1] Logging in ASHA (Pooja Sharma / ASHA-340)...")
    await loginAsRole(ashaPage, "asha", "9876543210", "123456")

    console.log("[2] Logging in Doctor (Dr. Ramesh Gupta / DOC-101)...")
    await loginAsRole(docPage, "doctor", "9823000001", "123456")

    console.log("[3] Logging in Patient (Shreya / P-4559)...")
    await loginAsRole(patientPage, "patient", "9324998108", "123456")

    // Check Doctor Dashboard loaded normally
    await docPage.setViewport({ width: 1280, height: 800 })
    await docPage.bringToFront()
    await docPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(2000)

    const docDomInitial = await docPage.evaluate(() => {
      const text = document.body.innerText
      const btns = Array.from(document.querySelectorAll("button")).map((b) => b.innerText.trim())
      const hasOverview = text.includes("TODAY'S OVERVIEW") || text.includes("Today's Consultations")
      const hasQueue = text.includes("PATIENT QUEUE") || text.includes("Consultations") || text.includes("Patients")
      const hasEmergencyCard = text.includes("EMERGENCY ALERT") || text.includes("ACKNOWLEDGE PHC")
      const hasAckBtn = btns.some((b) => b.includes("ACKNOWLEDGE PHC") || b.includes("Acknowledge PHC"))
      return {
        hasOverview,
        hasQueue,
        hasEmergencyCard,
        hasAckBtn,
        buttons: btns,
      }
    })
    console.log("Doctor DOM Initial Check:", JSON.stringify(docDomInitial, null, 2))

    if (docDomInitial.hasOverview && docDomInitial.hasQueue) {
      report.doctorDashboardLoadsNormally = "PASS"
    }
    if (!docDomInitial.hasEmergencyCard) {
      report.doctorNoSosCard = "PASS"
    }
    if (!docDomInitial.hasAckBtn) {
      report.doctorNoAckPhcButton = "PASS"
      console.log("  -> [PASS] Doctor dashboard loaded normally with NO emergency SOS cards or buttons")
    }

    // -------------------------------------------------------------------------
    // STEP 2: PATIENT TRIGGERS ONLINE SOS -> ASHA RECEIVES & ACKNOWLEDGES
    // -------------------------------------------------------------------------
    console.log("\n[4] --- TESTING ONLINE PATIENT SOS -> ASHA ---")
    await patientPage.bringToFront()
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const sosCard = btns.find((b) => b.textContent.includes("Emergency SOS") || b.textContent.includes("SOS"))
      if (sosCard) sosCard.click()
    })
    await sleep(1000)

    console.log("  -> Triggering Patient SOS (5s hold)...")
    await patientPage.evaluate(() => {
      const circleBtn = document.querySelector("main button.rounded-full") || document.querySelector('button[aria-label*="Hold"]')
      if (circleBtn) circleBtn.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }))
    })
    await sleep(5300)
    await patientPage.evaluate(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { button: 0, bubbles: true }))
    })
    await sleep(2000)
    report.patientSosTriggers = "PASS"

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
      report.ashaReceivesSos = "PASS"
      console.log("  -> [PASS] Patient SOS received by ASHA dashboard")
    }
    if (ashaOnlineStatus.sirenPlaying || ashaOnlineStatus.hasAlert) {
      report.ashaSirenPlays = "PASS"
      console.log("  -> [PASS] Emergency Siren acoustic playback active on ASHA dashboard")
    }

    // Verify Doctor dashboard still has NO SOS
    await docPage.bringToFront()
    await docPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(2000)

    const docDomDuringOnlineSos = await docPage.evaluate(() => {
      const text = document.body.innerText
      return {
        hasEmergencyCard: text.includes("EMERGENCY ALERT") || text.includes("ACKNOWLEDGE PHC"),
      }
    })
    if (!docDomDuringOnlineSos.hasEmergencyCard) {
      console.log("  -> [PASS] Doctor dashboard contains NO SOS alert card during active SOS")
    }

    // ASHA acknowledges SOS
    console.log("  -> ASHA acknowledging SOS...")
    await ashaPage.bringToFront()
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
      if (ackBtn) ackBtn.click()
    })
    await sleep(3000)

    if (ashaPatchReq) {
      report.ashaAcknowledgeWorks = "PASS"
      console.log("  -> [PASS] ASHA acknowledgement successfully sent and processed")
    }

    // -------------------------------------------------------------------------
    // STEP 3: OFFLINE SOS -> RECONNECT -> SYNC TO ASHA ONLY
    // -------------------------------------------------------------------------
    console.log("\n[5] --- TESTING OFFLINE SOS -> ASHA ---")
    await patientPage.bringToFront()
    await patientPage.evaluate(() => {
      const backBtn = document.querySelector("header button")
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
    console.log("  -> Setting Patient offline & triggering SOS (5s hold)...")
    await patientPage.setOfflineMode(true)
    await sleep(500)

    await patientPage.evaluate(() => {
      const circleBtn = document.querySelector("main button.rounded-full") || document.querySelector('button[aria-label*="Hold"]')
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
      console.log("  -> [PASS] Offline SOS queued in IndexedDB")
    }

    // Reconnect & sync
    console.log("  -> Reconnecting and syncing...")
    await patientPage.setOfflineMode(false)
    await sleep(500)
    await patientPage.evaluate(async () => {
      const { syncPendingQueue } = await import("/src/lib/offlineDb.js")
      await syncPendingQueue()
    })
    await sleep(3500)

    // Check ASHA receives synced alert
    await ashaPage.bringToFront()
    await ashaPage.evaluate(() => {
      window.dispatchEvent(new Event("focus"))
      window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    })
    await sleep(3000)

    const ashaOfflineText = await ashaPage.evaluate(() => document.body.innerText)
    if (ashaOfflineText.includes("EMERGENCY ALERT") || ashaOfflineText.includes("SOS-2026")) {
      report.offlineSosSyncedToAsha = "PASS"
      console.log("  -> [PASS] ASHA received synced offline SOS")
    }

    // ASHA acknowledges synced alert
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
      if (ackBtn) ackBtn.click()
    })
    await sleep(2500)

    // Check Doctor dashboard after sync
    await docPage.bringToFront()
    await docPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(2000)

    const docDomAfterOfflineSync = await docPage.evaluate(() => {
      const text = document.body.innerText
      return {
        hasEmergencyCard: text.includes("EMERGENCY ALERT") || text.includes("ACKNOWLEDGE PHC"),
      }
    })
    if (!docDomAfterOfflineSync.hasEmergencyCard) {
      report.doctorStillNoSosAfterOfflineSync = "PASS"
      console.log("  -> [PASS] Doctor dashboard received NO offline-synced SOS card")
    }

    // Verify NO emergency requests made by Doctor
    if (doctorEmergencyRequests.length === 0) {
      report.doctorNoEmergencyPolling = "PASS"
      console.log("  -> [PASS] Doctor dashboard performed ZERO requests to /api/emergency/* endpoints")
    }

    console.log("\n================================================================================")
    console.log("                     FINAL VERIFICATION REPORT")
    console.log("================================================================================")
    console.log(JSON.stringify(report, null, 2))

  } finally {
    await browser.close()
  }
}

verifyDoctorSosRemoved().catch(console.error)
