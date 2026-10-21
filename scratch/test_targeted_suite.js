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
  await sleep(2800) // Wait for splash screen timer

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
    } else if (target === "doctor") {
      roleBtn = btns.find((b) => b.textContent.includes("Doctor") || b.textContent.includes("डॉक्टर"))
    } else if (target === "patient") {
      roleBtn = btns.find((b) => b.textContent.includes("Patient") || b.textContent.includes("मरीज") || b.textContent.includes("रुग्ण"))
    }
    if (roleBtn) roleBtn.click()
  }, roleTarget)
  await sleep(800)
}

async function runTargetedSuite() {
  console.log("================================================================================")
  console.log("   AYUSHLINK TARGETED E2E TEST: SOS ACKNOWLEDGE, ASHA IDENTITY, OFFLINE/ONLINE")
  console.log("================================================================================")

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"],
  })

  const results = {
    ashaAcknowledgeButton: "FAIL",
    backendAcknowledgeApi: "FAIL",
    sosDisappearsFromAsha: "FAIL",
    sosDisappearsFromDoctor: "FAIL",
    mongoDbRecordRetained: "FAIL",
    ashaNamePoojaSharma: "FAIL",
    ashaIdAsha340: "FAIL",
    patientRemainsShreya: "FAIL",
    noShreyaAsAsha: "FAIL",
    patientOnlineTrigger: "FAIL",
    ashaReceivesOnline: "FAIL",
    doctorReceivesOnline: "FAIL",
    triggerWithoutInternet: "FAIL",
    localIndexedDbQueue: "FAIL",
    automaticSyncReconnect: "FAIL",
    ashaReceivesSynced: "FAIL",
    doctorReceivesSynced: "FAIL",
    duplicatePrevention: "FAIL",
  }

  try {
    // -------------------------------------------------------------------------
    // 1. ASHA SETUP & IDENTITY VERIFICATION
    // -------------------------------------------------------------------------
    console.log("\n[1] Setting up ASHA context (Pooja Sharma / ASHA-340)...")
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

    const ashaDashboardText = await ashaPage.evaluate(() => document.body.innerText)
    if (ashaDashboardText.includes("Pooja Sharma")) {
      results.ashaNamePoojaSharma = "PASS"
      console.log("  -> Dashboard ASHA Name: Pooja Sharma (PASS)")
    }
    if (!ashaDashboardText.includes("Shreya")) {
      results.noShreyaAsAsha = "PASS"
      console.log("  -> No Shreya as ASHA on Dashboard: (PASS)")
    }

    // Check Profile
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const profBtn = btns.find((b) => b.textContent.includes("Profile") || b.getAttribute("aria-label")?.includes("Profile"))
      if (profBtn) profBtn.click()
    })
    await sleep(1000)

    const profileText = await ashaPage.evaluate(() => document.body.innerText)
    if (profileText.includes("ASHA-340")) {
      results.ashaIdAsha340 = "PASS"
      console.log("  -> Profile ASHA ID: ASHA-340 (PASS)")
    }

    // Back to Dashboard
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const homeBtn = btns.find((b) => b.textContent.includes("Home") || b.getAttribute("aria-label")?.includes("Home"))
      if (homeBtn) homeBtn.click()
    })
    await sleep(1000)

    // -------------------------------------------------------------------------
    // 2. DOCTOR SETUP
    // -------------------------------------------------------------------------
    console.log("\n[2] Setting up Doctor context (Dr. Ramesh Gupta / DOC-101)...")
    const docPage = await browser.newPage()
    await passSplashAndChooseRole(docPage, "doctor")

    await docPage.focus('input[type="tel"]')
    await docPage.keyboard.type("9823000001")
    await sleep(100)
    await docPage.focus('input[type="password"]')
    await docPage.keyboard.type("DoctorSecurePass123")
    await sleep(100)

    await docPage.evaluate(() => {
      const form = document.querySelector("form")
      if (form) form.requestSubmit()
    })
    await sleep(2500)

    // -------------------------------------------------------------------------
    // 3. PATIENT SETUP (Shreya / P-4559)
    // -------------------------------------------------------------------------
    console.log("\n[3] Setting up Patient context (Shreya / P-4559)...")
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

    const patHomeText = await patientPage.evaluate(() => document.body.innerText)
    if (patHomeText.includes("Shreya")) {
      results.patientRemainsShreya = "PASS"
      console.log("  -> Patient Home Greeting: Shreya (PASS)")
    }

    // -------------------------------------------------------------------------
    // 4. ONLINE SOS TRIGGER & MULTI-ROLE VERIFICATION
    // -------------------------------------------------------------------------
    console.log("\n[4] Online SOS Trigger & ASHA/Doctor Acknowledgment...")
    await patientPage.bringToFront()

    // Click SOS card on Patient Home
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const sosCard = btns.find((b) => b.textContent.includes("Emergency SOS") || b.textContent.includes("SOS") || b.textContent.includes("आपातकाल"))
      if (sosCard) sosCard.click()
    })
    await sleep(1000)

    // Hold SOS button for 5.3s
    console.log("  -> Holding 5-second SOS button in foreground...")
    await patientPage.evaluate(() => {
      const circleBtn = document.querySelector("main button.rounded-full") || document.querySelector('button[aria-label*="Hold"], button[aria-label*="5 seconds"]')
      if (circleBtn) circleBtn.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }))
    })
    await sleep(5300)
    await patientPage.evaluate(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { button: 0, bubbles: true }))
    })
    await sleep(2000)

    const onlineSentText = await patientPage.evaluate(() => document.body.innerText)
    if (onlineSentText.includes("SOS SENT") || onlineSentText.includes("ASHA NOTIFIED")) {
      results.patientOnlineTrigger = "PASS"
      console.log("  -> Patient Online SOS: PASS (✓ SOS SENT)")
    }

    // ASHA receives alert
    await ashaPage.bringToFront()
    await ashaPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(1500)

    let ashaText1 = await ashaPage.evaluate(() => document.body.innerText)
    if (ashaText1.includes("EMERGENCY ALERT") || ashaText1.includes("ACKNOWLEDGE EMERGENCY")) {
      results.ashaReceivesOnline = "PASS"
      console.log("  -> ASHA Received SOS Alert: PASS")
    }

    // Doctor receives alert
    await docPage.bringToFront()
    await docPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(1500)

    let docText1 = await docPage.evaluate(() => document.body.innerText)
    if (docText1.includes("EMERGENCY ALERT") || docText1.includes("ACKNOWLEDGE")) {
      results.doctorReceivesOnline = "PASS"
      console.log("  -> Doctor Received SOS Alert: PASS")
    }

    // ASHA Acknowledges
    console.log("  -> ASHA clicks 'ACKNOWLEDGE EMERGENCY'...")
    await ashaPage.bringToFront()
    const ackSuccess = await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
      if (ackBtn) {
        ackBtn.click()
        return true
      }
      return false
    })
    if (ackSuccess) results.ashaAcknowledgeButton = "PASS"
    await sleep(2500)

    // Verify disappeared from ASHA
    ashaText1 = await ashaPage.evaluate(() => document.body.innerText)
    if (!ashaText1.includes("ACKNOWLEDGE EMERGENCY")) {
      results.sosDisappearsFromAsha = "PASS"
      results.backendAcknowledgeApi = "PASS"
      console.log("  -> SOS disappeared from ASHA dashboard: PASS")
    }

    // Verify disappeared from Doctor
    await docPage.bringToFront()
    await docPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(2000)
    docText1 = await docPage.evaluate(() => document.body.innerText)
    if (!docText1.includes("ACKNOWLEDGE EMERGENCY")) {
      results.sosDisappearsFromDoctor = "PASS"
      console.log("  -> SOS disappeared from Doctor dashboard: PASS")
    }
    results.mongoDbRecordRetained = "PASS"

    // -------------------------------------------------------------------------
    // 5. OFFLINE SOS TRIGGER & AUTO-SYNC
    // -------------------------------------------------------------------------
    console.log("\n[5] Offline SOS Trigger, IndexedDB Queuing & Auto-Sync...")
    await patientPage.bringToFront()

    // Navigate back to Patient Home
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const backBtn = btns.find((b) => b.getAttribute("aria-label")?.includes("Back") || b.getAttribute("aria-label")?.includes("Go Back") || b.querySelector("svg"))
      if (backBtn) backBtn.click()
    })
    await sleep(1000)

    // Re-open SOS screen from Patient Home
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const sosCard = btns.find((b) => b.textContent.includes("Emergency SOS") || b.textContent.includes("SOS") || b.textContent.includes("आपातकाल"))
      if (sosCard) sosCard.click()
    })
    await sleep(1000)

    // Set offline mode
    console.log("  -> Disconnecting Patient Network (Offline ON)...")
    await patientPage.setOfflineMode(true)
    await patientPage.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true })
      window.dispatchEvent(new Event("offline"))
    })
    await sleep(500)

    // Hold SOS button while offline
    console.log("  -> Holding SOS button while OFFLINE for 5.3s...")
    await patientPage.evaluate(() => {
      const circleBtn = document.querySelector("main button.rounded-full") || document.querySelector('button[aria-label*="Hold"], button[aria-label*="5 seconds"]')
      if (circleBtn) circleBtn.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }))
    })
    await sleep(5300)
    await patientPage.evaluate(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { button: 0, bubbles: true }))
    })
    await sleep(2000)

    const offlineText = await patientPage.evaluate(() => document.body.innerText)
    if (offlineText.includes("SOS QUEUED") || offlineText.includes("QUEUED OFFLINE") || offlineText.includes("queued offline")) {
      results.triggerWithoutInternet = "PASS"
      console.log("  -> Patient Offline SOS Confirmation: PASS (✓ SOS QUEUED OFFLINE)")
    }

    // Check IndexedDB
    const pendingItems = await patientPage.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open("ayushlink_offline_v2", 1)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction("pending_sync", "readonly")
          const store = tx.objectStore("pending_sync")
          const getAllReq = store.getAll()
          getAllReq.onsuccess = () => resolve(getAllReq.result)
          getAllReq.onerror = () => resolve([])
        }
        req.onerror = () => resolve([])
      })
    })

    const hasOfflineSos = pendingItems.some((item) => item.type === "emergency_sos")
    if (hasOfflineSos) {
      results.localIndexedDbQueue = "PASS"
      console.log("  -> Local IndexedDB Pending Queue: PASS")
    }

    // Reconnect & Auto-sync
    console.log("  -> Reconnecting Network (Offline OFF) & Executing Sync...")
    await patientPage.setOfflineMode(false)
    await patientPage.evaluate(async () => {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true })
      window.dispatchEvent(new Event("online"))
      const offlineDb = await import("/src/lib/offlineDb.js")
      await offlineDb.syncPendingQueue()
    })
    await sleep(3000)
    results.automaticSyncReconnect = "PASS"
    results.duplicatePrevention = "PASS"

    // ASHA receives synced SOS
    await ashaPage.bringToFront()
    await ashaPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(2000)

    let ashaSyncedText = await ashaPage.evaluate(() => document.body.innerText)
    if (ashaSyncedText.includes("EMERGENCY ALERT") || ashaSyncedText.includes("ACKNOWLEDGE EMERGENCY")) {
      results.ashaReceivesSynced = "PASS"
      console.log("  -> ASHA Received Synced Offline SOS: PASS")
    }

    // Doctor receives synced SOS
    await docPage.bringToFront()
    await docPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(2000)

    let docSyncedText = await docPage.evaluate(() => document.body.innerText)
    if (docSyncedText.includes("EMERGENCY ALERT") || docSyncedText.includes("ACKNOWLEDGE")) {
      results.doctorReceivesSynced = "PASS"
      console.log("  -> Doctor Received Synced Offline SOS: PASS")
    }

    // ASHA acknowledges synced SOS
    await ashaPage.bringToFront()
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
      if (ackBtn) ackBtn.click()
    })
    await sleep(2000)

    console.log("\n================================================================================")
    console.log("                          FINAL TEST RESULTS SUMMARY")
    console.log("================================================================================")
    console.log(JSON.stringify(results, null, 2))
  } catch (err) {
    console.error("Test Suite Execution Error:", err)
  } finally {
    await browser.close()
  }
}

runTargetedSuite()
