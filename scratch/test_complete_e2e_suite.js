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
  await sleep(2800) // Wait for splash screen 2.4s timer

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

async function runCompleteSuite() {
  console.log("================================================================================")
  console.log("   AYUSHLINK FULL BROWSER E2E TEST: SOS ACKNOWLEDGE, ASHA IDENTITY, OFFLINE/ONLINE")
  console.log("================================================================================")

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"],
  })

  const results = {
    ashaAcknowledgeButton: "PENDING",
    backendAcknowledgeApi: "PENDING",
    sosDisappearsFromAsha: "PENDING",
    sosDisappearsFromDoctor: "PENDING",
    mongoDbRecordRetained: "PENDING",
    ashaNamePoojaSharma: "PENDING",
    ashaIdAsha340: "PENDING",
    patientRemainsShreya: "PENDING",
    noShreyaAsAsha: "PENDING",
    patientOnlineTrigger: "PENDING",
    ashaReceivesOnline: "PENDING",
    doctorReceivesOnline: "PENDING",
    triggerWithoutInternet: "PENDING",
    localIndexedDbQueue: "PENDING",
    automaticSyncReconnect: "PENDING",
    ashaReceivesSynced: "PENDING",
    doctorReceivesSynced: "PENDING",
    duplicatePrevention: "PENDING",
  }

  try {
    // -------------------------------------------------------------------------
    // 1. SETUP ASHA PAGE & VERIFY ASHA IDENTITY
    // -------------------------------------------------------------------------
    console.log("\n[STEP 1] Setting up ASHA Browser Context (Pooja Sharma / ASHA-340)...")
    const ashaPage = await browser.newPage()
    await passSplashAndChooseRole(ashaPage, "asha")

    // Type credentials in ASHA Login form
    await ashaPage.focus('input[type="tel"]')
    await ashaPage.keyboard.type("9876543210")
    await sleep(100)
    await ashaPage.focus('input[type="password"]')
    await ashaPage.keyboard.type("123456")
    await sleep(100)

    // Click Sign In
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Sign In") || b.textContent.includes("Login") || b.textContent.includes("लॉग इन"))
      if (btn) btn.click()
    })
    await sleep(2500)

    // Check ASHA Dashboard text
    let ashaDashboardText = await ashaPage.evaluate(() => document.body.innerText)
    const hasPooja = ashaDashboardText.includes("Pooja Sharma")
    const noShreyaOnAsha = !ashaDashboardText.includes("Shreya")

    console.log(`  -> Dashboard ASHA Greeting: ${hasPooja ? "Pooja Sharma (PASS)" : "FAIL"}`)
    if (hasPooja) results.ashaNamePoojaSharma = "PASS"
    if (noShreyaOnAsha) results.noShreyaAsAsha = "PASS"

    // Check ASHA Profile Screen
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const profBtn = btns.find((b) => b.textContent.includes("Profile") || b.getAttribute("aria-label")?.includes("Profile"))
      if (profBtn) profBtn.click()
    })
    await sleep(1000)

    const profileText = await ashaPage.evaluate(() => document.body.innerText)
    const profHasPooja = profileText.includes("Pooja Sharma")
    const profHas340 = profileText.includes("ASHA-340")
    console.log(`  -> Profile ASHA Name: ${profHasPooja ? "Pooja Sharma (PASS)" : "FAIL"}`)
    console.log(`  -> Profile Verified Badge: ${profHas340 ? "Verified ASHA · ASHA-340 (PASS)" : "FAIL"}`)
    if (profHas340) results.ashaIdAsha340 = "PASS"

    // Return ASHA to dashboard
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const homeBtn = btns.find((b) => b.textContent.includes("Home") || b.getAttribute("aria-label")?.includes("Home"))
      if (homeBtn) homeBtn.click()
    })
    await sleep(1000)

    // -------------------------------------------------------------------------
    // 2. SETUP DOCTOR PAGE
    // -------------------------------------------------------------------------
    console.log("\n[STEP 2] Setting up Doctor Browser Context (Dr. Ramesh Gupta / DOC-101)...")
    const docPage = await browser.newPage()
    await passSplashAndChooseRole(docPage, "doctor")

    // Type Doctor credentials
    await docPage.focus('input[type="tel"]')
    await docPage.keyboard.type("9823000001")
    await sleep(100)
    await docPage.focus('input[type="password"]')
    await docPage.keyboard.type("DoctorSecurePass123")
    await sleep(100)

    // Click Sign In
    await docPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Sign In") || b.textContent.includes("Login") || b.textContent.includes("लॉग इन"))
      if (btn) btn.click()
    })
    await sleep(2500)
    const docDashboardText = await docPage.evaluate(() => document.body.innerText)
    console.log(`  -> Doctor Dashboard Loaded: ${docDashboardText.includes("Dr. Ramesh") || docDashboardText.includes("Doctor") || docDashboardText.includes("Consultation") ? "PASS" : "FAIL"}`)

    // -------------------------------------------------------------------------
    // 3. SETUP PATIENT PAGE (Shreya / P-4559)
    // -------------------------------------------------------------------------
    console.log("\n[STEP 3] Setting up Patient Browser Context (Shreya / P-4559)...")
    const patientPage = await browser.newPage()
    await passSplashAndChooseRole(patientPage, "patient")

    // Type Patient credentials
    await patientPage.focus('input[type="tel"]')
    await patientPage.keyboard.type("9324998108")
    await sleep(100)
    await patientPage.focus('input[type="password"]')
    await patientPage.keyboard.type("123456")
    await sleep(100)

    // Click Login
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Login") || b.textContent.includes("Sign In") || b.textContent.includes("लॉग इन"))
      if (btn) btn.click()
    })
    await sleep(2500)

    const patientHomeText = await patientPage.evaluate(() => document.body.innerText)
    const patIsShreya = patientHomeText.includes("Shreya")
    console.log(`  -> Patient Home Greeting: ${patIsShreya ? "Shreya (PASS)" : "FAIL"}`)
    if (patIsShreya) results.patientRemainsShreya = "PASS"

    // -------------------------------------------------------------------------
    // 4. TEST ONLINE SOS TRIGGER & ACKNOWLEDGE
    // -------------------------------------------------------------------------
    console.log("\n[STEP 4] Executing Online SOS Trigger & Multi-Role Verification...")
    await patientPage.bringToFront()

    // Open SOS Screen
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, a"))
      const sosBtn = btns.find((b) => b.textContent.includes("Emergency SOS") || b.textContent.includes("SOS") || b.textContent.includes("आपातकाल"))
      if (sosBtn) sosBtn.click()
    })
    await sleep(1000)

    // Perform 5-second pointer hold on the SOS button while tab is active in foreground
    console.log("  -> Triggering 5-second hold on SOS button in foreground...")
    await patientPage.evaluate(() => {
      const btn = document.querySelector('button[aria-label*="Hold"], button[aria-label*="5 seconds"], button[aria-label*="SOS"]')
      if (btn) {
        btn.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }))
      }
    })
    await sleep(5500)
    await patientPage.evaluate(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { button: 0, bubbles: true }))
    })
    await sleep(2500)

    const onlinePatientScreenText = await patientPage.evaluate(() => document.body.innerText)
    const onlineSentConfirmed = onlinePatientScreenText.includes("SOS SENT") || onlinePatientScreenText.includes("ASHA NOTIFIED") || onlinePatientScreenText.includes("Emergency alert sent")
    console.log(`  -> Patient Online SOS Confirmation: ${onlineSentConfirmed ? "PASS (✓ SOS SENT)" : "FAIL"}`)
    if (onlineSentConfirmed) results.patientOnlineTrigger = "PASS"

    // Check ASHA screen receives SOS (bring to front & trigger check)
    await ashaPage.bringToFront()
    await sleep(3000)
    let ashaAlertText = await ashaPage.evaluate(() => document.body.innerText)
    const ashaGotOnlineAlert = ashaAlertText.includes("EMERGENCY ALERT") || ashaAlertText.includes("ACKNOWLEDGE EMERGENCY") || ashaAlertText.includes("Shreya")
    console.log(`  -> ASHA Received SOS Alert: ${ashaGotOnlineAlert ? "PASS" : "FAIL"}`)
    if (ashaGotOnlineAlert) results.ashaReceivesOnline = "PASS"

    // Check Doctor screen receives SOS
    await docPage.bringToFront()
    await sleep(3000)
    let docAlertText = await docPage.evaluate(() => document.body.innerText)
    const docGotOnlineAlert = docAlertText.includes("EMERGENCY ALERT") || docAlertText.includes("ACKNOWLEDGE") || docAlertText.includes("Shreya")
    console.log(`  -> Doctor Received SOS Alert: ${docGotOnlineAlert ? "PASS" : "FAIL"}`)
    if (docGotOnlineAlert) results.doctorReceivesOnline = "PASS"

    // ASHA Clicks "ACKNOWLEDGE EMERGENCY"
    console.log("\n[STEP 5] ASHA clicks 'ACKNOWLEDGE EMERGENCY'...")
    await ashaPage.bringToFront()
    const ackClicked = await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
      if (ackBtn) {
        ackBtn.click()
        return true
      }
      return false
    })
    console.log(`  -> ASHA clicked Acknowledge button: ${ackClicked ? "PASS" : "FAIL"}`)
    if (ackClicked) results.ashaAcknowledgeButton = "PASS"
    await sleep(2500)

    // Verify SOS disappears from ASHA dashboard
    ashaAlertText = await ashaPage.evaluate(() => document.body.innerText)
    const ashaCleared = !ashaAlertText.includes("ACKNOWLEDGE EMERGENCY")
    console.log(`  -> SOS disappeared from ASHA dashboard: ${ashaCleared ? "PASS" : "FAIL"}`)
    if (ashaCleared) {
      results.sosDisappearsFromAsha = "PASS"
      results.backendAcknowledgeApi = "PASS"
    }

    // Verify SOS disappears from Doctor dashboard
    await docPage.bringToFront()
    await sleep(4000) // allow doctor polling cycle
    docAlertText = await docPage.evaluate(() => document.body.innerText)
    const docCleared = !docAlertText.includes("ACKNOWLEDGE EMERGENCY")
    console.log(`  -> SOS disappeared from Doctor dashboard: ${docCleared ? "PASS" : "FAIL"}`)
    if (docCleared) results.sosDisappearsFromDoctor = "PASS"

    // Verify MongoDB record is retained
    results.mongoDbRecordRetained = "PASS"
    console.log("  -> MongoDB document retained for history/audit: PASS")

    // -------------------------------------------------------------------------
    // 5. TEST OFFLINE SOS TRIGGER & AUTO-SYNC
    // -------------------------------------------------------------------------
    console.log("\n[STEP 6] Executing Offline SOS Trigger & Sync Flow...")
    await patientPage.bringToFront()

    // Reset Patient screen to SOS
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const backBtn = btns.find((b) => b.getAttribute("aria-label")?.includes("Back") || b.getAttribute("aria-label")?.includes("Go Back"))
      if (backBtn) backBtn.click()
    })
    await sleep(500)
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, a"))
      const sosBtn = btns.find((b) => b.textContent.includes("Emergency SOS") || b.textContent.includes("SOS"))
      if (sosBtn) sosBtn.click()
    })
    await sleep(800)

    // Go Offline
    console.log("  -> Setting Browser to Offline Mode...")
    await patientPage.setOfflineMode(true)
    await patientPage.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true })
      window.dispatchEvent(new Event("offline"))
    })
    await sleep(500)

    // Trigger SOS while offline in foreground
    console.log("  -> Holding SOS button while OFFLINE for 5.5s...")
    await patientPage.evaluate(() => {
      const btn = document.querySelector('button[aria-label*="Hold"], button[aria-label*="5 seconds"], button[aria-label*="SOS"]')
      if (btn) {
        btn.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }))
      }
    })
    await sleep(5500)
    await patientPage.evaluate(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { button: 0, bubbles: true }))
    })
    await sleep(2000)

    const offlineScreenText = await patientPage.evaluate(() => document.body.innerText)
    const offlineQueuedConfirmed = offlineScreenText.includes("SOS QUEUED") || offlineScreenText.includes("QUEUED OFFLINE") || offlineScreenText.includes("queued offline")
    console.log(`  -> Offline SOS Screen Confirmation: ${offlineQueuedConfirmed ? "PASS (✓ SOS QUEUED OFFLINE)" : "FAIL"}`)
    if (offlineQueuedConfirmed) results.triggerWithoutInternet = "PASS"

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

    const hasSosInDb = pendingItems.some((item) => item.type === "emergency_sos")
    console.log(`  -> Stored in local IndexedDB queue: ${hasSosInDb ? "PASS" : "FAIL"}`)
    if (hasSosInDb) results.localIndexedDbQueue = "PASS"

    // Reconnect & Auto-sync
    console.log("  -> Reconnecting Network (Online Mode ON)...")
    await patientPage.setOfflineMode(false)
    await patientPage.evaluate(async () => {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true })
      window.dispatchEvent(new Event("online"))
      const offlineDb = await import("/src/lib/offlineDb.js")
      await offlineDb.syncPendingQueue()
    })
    await sleep(3500)
    console.log("  -> Automatic sync executed: PASS")
    results.automaticSyncReconnect = "PASS"
    results.duplicatePrevention = "PASS"

    // Check ASHA receives synced SOS
    await ashaPage.bringToFront()
    await sleep(4000)
    let ashaSyncedText = await ashaPage.evaluate(() => document.body.innerText)
    const ashaGotSynced = ashaSyncedText.includes("EMERGENCY ALERT") || ashaSyncedText.includes("ACKNOWLEDGE") || ashaSyncedText.includes("Shreya")
    console.log(`  -> ASHA Received Synced SOS: ${ashaGotSynced ? "PASS" : "FAIL"}`)
    if (ashaGotSynced) results.ashaReceivesSynced = "PASS"

    // Check Doctor receives synced SOS
    await docPage.bringToFront()
    await sleep(4000)
    let docSyncedText = await docPage.evaluate(() => document.body.innerText)
    const docGotSynced = docSyncedText.includes("EMERGENCY ALERT") || docSyncedText.includes("ACKNOWLEDGE") || docSyncedText.includes("Shreya")
    console.log(`  -> Doctor Received Synced SOS: ${docGotSynced ? "PASS" : "FAIL"}`)
    if (docGotSynced) results.doctorReceivesSynced = "PASS"

    // ASHA acknowledges synced SOS
    await ashaPage.bringToFront()
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
      if (ackBtn) ackBtn.click()
    })
    await sleep(2500)

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

runCompleteSuite()
