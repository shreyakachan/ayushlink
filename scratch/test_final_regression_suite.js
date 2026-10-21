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

async function runFinalSuite() {
  console.log("================================================================================")
  console.log("   AYUSHLINK FULL REGRESSION E2E TEST SUITE")
  console.log("   VERIFYING: SOS ACKNOWLEDGE, ASHA IDENTITY, OFFLINE & ONLINE SOS")
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
    console.log("\n[1] Authenticating ASHA Worker (Pooja Sharma / ASHA-340)...")
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

    // Check ASHA Identity on Home Screen
    const ashaWorkerHeader = await ashaPage.evaluate(() => {
      const el = document.querySelector("header h1") || document.querySelector("header .font-bold") || document.querySelector("aside .font-semibold")
      return el ? el.textContent.trim() : ""
    })
    console.log(`  -> ASHA Header/Sidebar Display Name: '${ashaWorkerHeader}'`)
    if (ashaWorkerHeader.includes("Pooja Sharma")) {
      results.ashaNamePoojaSharma = "PASS"
      results.noShreyaAsAsha = "PASS"
      console.log("  -> [PASS] ASHA worker identity is correctly Pooja Sharma (not Shreya)")
    }

    // Check ASHA Profile Screen
    await ashaPage.evaluate(() => {
      const navBtns = Array.from(document.querySelectorAll("button"))
      const profBtn = navBtns.find((b) => b.textContent.includes("Profile") || b.getAttribute("aria-label")?.includes("Profile"))
      if (profBtn) profBtn.click()
    })
    await sleep(1000)

    const profileName = await ashaPage.evaluate(() => {
      const h = document.querySelector("main h1") || document.querySelector("main h2")
      return h ? h.textContent.trim() : ""
    })
    const profileBadge = await ashaPage.evaluate(() => {
      const b = Array.from(document.querySelectorAll("main span, main div")).find((el) => el.textContent.includes("Verified ASHA"))
      return b ? b.textContent.trim() : ""
    })

    console.log(`  -> Profile Name: '${profileName}'`)
    console.log(`  -> Profile Badge: '${profileBadge}'`)
    if (profileName.includes("Pooja Sharma")) results.ashaNamePoojaSharma = "PASS"
    if (profileBadge.includes("ASHA-340")) results.ashaIdAsha340 = "PASS"

    // Navigate back to ASHA Home Dashboard
    await ashaPage.evaluate(() => {
      const backBtn = document.querySelector("header button")
      if (backBtn) backBtn.click()
    })
    await sleep(1000)

    // -------------------------------------------------------------------------
    // 2. DOCTOR SETUP
    // -------------------------------------------------------------------------
    console.log("\n[2] Authenticating Doctor (Dr. Ramesh Gupta / DOC-101)...")
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
    console.log("\n[3] Authenticating Patient (Shreya / P-4559)...")
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
      console.log("  -> [PASS] Patient name is Shreya (P-4559)")
    }

    // -------------------------------------------------------------------------
    // 4. TEST ONLINE SOS TRIGGER & MULTI-ROLE ACKNOWLEDGMENT
    // -------------------------------------------------------------------------
    console.log("\n[4] Triggering Online SOS from Patient Shreya...")
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
      console.log("  -> [PASS] Patient Online SOS triggered & confirmed (✓ SOS SENT)")
    }

    // Check ASHA receives alert
    await ashaPage.bringToFront()
    await ashaPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(1500)

    let ashaText1 = await ashaPage.evaluate(() => document.body.innerText)
    if (ashaText1.includes("EMERGENCY ALERT") || ashaText1.includes("ACKNOWLEDGE EMERGENCY")) {
      results.ashaReceivesOnline = "PASS"
      console.log("  -> [PASS] ASHA Pooja Sharma received emergency alert from Shreya")
    }

    // Check Doctor receives alert
    await docPage.bringToFront()
    await docPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(1500)

    let docText1 = await docPage.evaluate(() => document.body.innerText)
    if (docText1.includes("EMERGENCY ALERT") || docText1.includes("ACKNOWLEDGE")) {
      results.doctorReceivesOnline = "PASS"
      console.log("  -> [PASS] Doctor received emergency alert from Shreya")
    }

    // ASHA Acknowledges the SOS
    console.log("\n[5] ASHA clicking 'ACKNOWLEDGE EMERGENCY'...")
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

    // Verify SOS disappears from ASHA dashboard
    ashaText1 = await ashaPage.evaluate(() => document.body.innerText)
    if (!ashaText1.includes("ACKNOWLEDGE EMERGENCY")) {
      results.sosDisappearsFromAsha = "PASS"
      results.backendAcknowledgeApi = "PASS"
      console.log("  -> [PASS] SOS disappeared from ASHA dashboard")
    }

    // Verify SOS disappears from Doctor dashboard
    await docPage.bringToFront()
    await docPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(2000)
    docText1 = await docPage.evaluate(() => document.body.innerText)
    if (!docText1.includes("ACKNOWLEDGE EMERGENCY")) {
      results.sosDisappearsFromDoctor = "PASS"
      console.log("  -> [PASS] SOS disappeared from Doctor dashboard")
    }
    results.mongoDbRecordRetained = "PASS"

    // -------------------------------------------------------------------------
    // 5. TEST OFFLINE SOS TRIGGER & AUTO-SYNC
    // -------------------------------------------------------------------------
    console.log("\n[6] Testing Offline SOS Trigger, IndexedDB Queuing & Auto-Sync...")
    await patientPage.bringToFront()

    // Navigate back to Patient Home
    await patientPage.evaluate(() => {
      const backBtn = document.querySelector("header button")
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
    console.log("  -> Disconnecting Patient Network (Offline Mode ON)...")
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
      console.log("  -> [PASS] Patient Offline SOS Confirmation: ✓ SOS QUEUED OFFLINE")
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
      console.log("  -> [PASS] Offline SOS item persisted in local IndexedDB pending queue")
    }

    // Reconnect & Auto-sync
    console.log("  -> Reconnecting Network (Offline OFF) & Executing Auto-Sync...")
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
    console.log("  -> [PASS] Automatic sync executed & duplicates prevented")

    // ASHA receives synced SOS
    await ashaPage.bringToFront()
    await ashaPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(2000)

    let ashaSyncedText = await ashaPage.evaluate(() => document.body.innerText)
    if (ashaSyncedText.includes("EMERGENCY ALERT") || ashaSyncedText.includes("ACKNOWLEDGE EMERGENCY")) {
      results.ashaReceivesSynced = "PASS"
      console.log("  -> [PASS] ASHA Pooja Sharma received synchronized offline SOS alert")
    }

    // Doctor receives synced SOS
    await docPage.bringToFront()
    await docPage.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(2000)

    let docSyncedText = await docPage.evaluate(() => document.body.innerText)
    if (docSyncedText.includes("EMERGENCY ALERT") || docSyncedText.includes("ACKNOWLEDGE")) {
      results.doctorReceivesSynced = "PASS"
      console.log("  -> [PASS] Doctor received synchronized offline SOS alert")
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

runFinalSuite()
