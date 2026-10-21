import puppeteer from "puppeteer-core"

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const FRONTEND_URL = "http://localhost:5173"
const BACKEND_URL = "http://127.0.0.1:8000/api"

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runBrowserTests() {
  console.log("================================================================================")
  console.log("    AYUSHLINK FULL E2E BROWSER UI TEST: SOS ACKNOWLEDGE, ASHA IDENTITY, OFFLINE/ONLINE")
  console.log("================================================================================")

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"],
  })

  try {
    // -------------------------------------------------------------------------
    // TEST SUITE 1: ASHA IDENTITY VERIFICATION
    // -------------------------------------------------------------------------
    console.log("\n[TEST 1] ASHA Worker Identity Verification (Pooja Sharma / ASHA-340)...")
    const ashaPage = await browser.newPage()
    await ashaPage.goto(FRONTEND_URL, { waitUntil: "networkidle0" })

    // Clear session to ensure clean state
    await ashaPage.evaluate(() => localStorage.clear())
    await ashaPage.reload({ waitUntil: "networkidle0" })

    // Step through Role Select -> ASHA Login
    // Click "Get Started" on Splash screen if present
    const getStartedBtn = await ashaPage.$("button")
    if (getStartedBtn) {
      await ashaPage.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"))
        const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
        if (btn) btn.click()
      })
      await sleep(600)
    }

    // Select ASHA Worker role
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ashaBtn = btns.find((b) => b.textContent.includes("ASHA Worker") || b.textContent.includes("आशा कार्यकर्ता"))
      if (ashaBtn) ashaBtn.click()
    })
    await sleep(600)

    // Fill in ASHA Login: Phone: 9876543210, Password: 123456
    const phoneInput = await ashaPage.$('input[type="tel"]')
    const passInput = await ashaPage.$('input[type="password"]')
    if (phoneInput && passInput) {
      await phoneInput.type("9876543210")
      await passInput.type("123456")
      await ashaPage.evaluate(() => {
        const form = document.querySelector("form")
        if (form) form.requestSubmit()
      })
      await sleep(1500)
    }

    // Check ASHA Name on Dashboard
    const ashaDashboardText = await ashaPage.evaluate(() => document.body.innerText)
    const hasPoojaSharma = ashaDashboardText.includes("Pooja Sharma")
    const hasShreyaAsAsha = ashaDashboardText.includes("Shreya") && !ashaDashboardText.includes("Patient")

    console.log(`  -> Dashboard ASHA Name displayed: ${hasPoojaSharma ? "Pooja Sharma (CORRECT)" : "UNKNOWN"}`)
    if (hasShreyaAsAsha) {
      console.error("  [FAIL] 'Shreya' incorrectly displayed on ASHA dashboard!")
    } else {
      console.log("  -> [PASS] 'Shreya' is NOT displayed as ASHA worker identity.")
    }

    // Navigate to Profile screen
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const profBtn = btns.find((b) => b.textContent.includes("Profile") || b.getAttribute("aria-label")?.includes("Profile"))
      if (profBtn) profBtn.click()
    })
    await sleep(800)

    const profileText = await ashaPage.evaluate(() => document.body.innerText)
    const profileHasPooja = profileText.includes("Pooja Sharma")
    const profileHasAsha340 = profileText.includes("ASHA-340")
    console.log(`  -> Profile Screen Name: ${profileHasPooja ? "Pooja Sharma (CORRECT)" : "FAIL"}`)
    console.log(`  -> Profile Screen Verified Badge: ${profileHasAsha340 ? "Verified ASHA · ASHA-340 (CORRECT)" : "FAIL"}`)

    // -------------------------------------------------------------------------
    // TEST SUITE 2: ONLINE SOS TRIGGER + ACKNOWLEDGE WORKFLOW
    // -------------------------------------------------------------------------
    console.log("\n[TEST 2] Online SOS Trigger -> ASHA & Doctor Receive -> ASHA Acknowledges...")

    // 1. Doctor Page Setup
    const docPage = await browser.newPage()
    await docPage.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
    await docPage.evaluate(async () => {
      // Login as Doctor DOC-101 directly
      const res = await fetch("http://127.0.0.1:8000/api/doctor/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "9823000001", password: "DoctorSecurePass123" }),
      })
      const data = await res.json()
      localStorage.setItem("ayushlink_token", data.access_token)
      localStorage.setItem("ayushlink_user", JSON.stringify(data.doctor))
      localStorage.setItem("ayushlink_role", "doctor")
    })
    await docPage.reload({ waitUntil: "networkidle0" })
    await sleep(1000)

    // Navigate Doctor to doctor-home
    await docPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const docRoleBtn = btns.find((b) => b.textContent.includes("Doctor") || b.textContent.includes("डॉक्टर"))
      if (docRoleBtn) docRoleBtn.click()
    })
    await sleep(1000)

    // 2. Patient Page Setup
    const patientPage = await browser.newPage()
    await patientPage.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
    await patientPage.evaluate(async () => {
      // Login as Patient Shreya P-4559 directly
      const res = await fetch("http://127.0.0.1:8000/api/patient/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "9324998108", password: "123456" }),
      })
      const data = await res.json()
      localStorage.setItem("ayushlink_token", data.access_token)
      localStorage.setItem("ayushlink_user", JSON.stringify(data.patient))
      localStorage.setItem("ayushlink_role", "patient")
    })
    await patientPage.reload({ waitUntil: "networkidle0" })
    await sleep(1000)

    // Open Patient Emergency SOS screen
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, a"))
      const sosBtn = btns.find((b) => b.textContent.includes("Emergency SOS") || b.textContent.includes("SOS") || b.textContent.includes("आपातकाल"))
      if (sosBtn) sosBtn.click()
    })
    await sleep(800)

    // Trigger SOS via 5-second pointer hold on the red SOS button
    console.log("  -> Holding SOS button on Patient screen for 5.2 seconds...")
    const sosBtnHandle = await patientPage.$('button[aria-label*="Hold"], button[aria-label*="5 seconds"], button[aria-label*="SOS"]')
    if (sosBtnHandle) {
      const box = await sosBtnHandle.boundingBox()
      await patientPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await patientPage.mouse.down()
      await sleep(5200)
      await patientPage.mouse.up()
      await sleep(2500)
    }

    // Verify Patient Screen shows "✓ SOS SENT"
    const patientScreenText = await patientPage.evaluate(() => document.body.innerText)
    const sosSentConfirmed = patientScreenText.includes("SOS SENT") || patientScreenText.includes("ASHA NOTIFIED") || patientScreenText.includes("Emergency alert sent")
    console.log(`  -> Patient SOS Sent Confirmation: ${sosSentConfirmed ? "PASS (✓ SOS SENT)" : "FAIL"}`)

    // Verify ASHA Dashboard received the SOS alert
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const homeBtn = btns.find((b) => b.textContent.includes("Home") || b.getAttribute("aria-label")?.includes("Home"))
      if (homeBtn) homeBtn.click()
    })
    await sleep(2000)

    let ashaText = await ashaPage.evaluate(() => document.body.innerText)
    const ashaReceivedAlert = ashaText.includes("EMERGENCY ALERT") || ashaText.includes("ACKNOWLEDGE EMERGENCY")
    console.log(`  -> ASHA Dashboard received SOS Alert: ${ashaReceivedAlert ? "PASS" : "FAIL"}`)

    // Verify Doctor Dashboard received the SOS alert
    let docText = await docPage.evaluate(() => document.body.innerText)
    const docReceivedAlert = docText.includes("EMERGENCY ALERT") || docText.includes("ACKNOWLEDGE") || docText.includes("Shreya")
    console.log(`  -> Doctor Dashboard received SOS Alert: ${docReceivedAlert ? "PASS" : "FAIL"}`)

    // ASHA Clicks "ACKNOWLEDGE EMERGENCY"
    console.log("  -> ASHA clicking 'ACKNOWLEDGE EMERGENCY' button...")
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
      if (ackBtn) ackBtn.click()
    })
    await sleep(2000)

    // Verify SOS disappears from ASHA dashboard
    ashaText = await ashaPage.evaluate(() => document.body.innerText)
    const ashaAlertCleared = !ashaText.includes("ACKNOWLEDGE EMERGENCY")
    console.log(`  -> SOS disappeared from ASHA dashboard: ${ashaAlertCleared ? "PASS" : "FAIL"}`)

    // Verify SOS disappears from Doctor dashboard
    await sleep(4000) // allow doctor polling cycle
    docText = await docPage.evaluate(() => document.body.innerText)
    const docAlertCleared = !docText.includes("ACKNOWLEDGE EMERGENCY")
    console.log(`  -> SOS disappeared from Doctor dashboard: ${docAlertCleared ? "PASS" : "FAIL"}`)

    // -------------------------------------------------------------------------
    // TEST SUITE 3: OFFLINE SOS QUEUING + AUTO-SYNC
    // -------------------------------------------------------------------------
    console.log("\n[TEST 3] Offline SOS Queuing in IndexedDB & Auto-Sync upon Reconnect...")

    // 1. Reset patient screen to SOS
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

    // 2. Set Offline Mode in browser
    console.log("  -> Disconnecting patient network (Offline Mode ON)...")
    await patientPage.setOfflineMode(true)
    await patientPage.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true })
      window.dispatchEvent(new Event("offline"))
    })
    await sleep(500)

    // 3. Hold SOS button for 5 seconds while offline
    console.log("  -> Holding SOS button while OFFLINE for 5.2 seconds...")
    const offlineSosBtn = await patientPage.$('button[aria-label*="Hold"], button[aria-label*="5 seconds"], button[aria-label*="SOS"]')
    if (offlineSosBtn) {
      const box = await offlineSosBtn.boundingBox()
      await patientPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await patientPage.mouse.down()
      await sleep(5200)
      await patientPage.mouse.up()
      await sleep(1500)
    }

    // 4. Verify Patient Screen shows "✓ SOS QUEUED" and "QUEUED OFFLINE"
    const offlinePatientText = await patientPage.evaluate(() => document.body.innerText)
    const isQueuedOffline = offlinePatientText.includes("SOS QUEUED") || offlinePatientText.includes("QUEUED OFFLINE") || offlinePatientText.includes("queued offline")
    console.log(`  -> Patient Offline Queued Confirmation: ${isQueuedOffline ? "PASS (✓ SOS QUEUED OFFLINE)" : "FAIL"}`)

    // 5. Verify record exists in IndexedDB pending_sync store
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

    const sosPendingItem = pendingItems.find((item) => item.type === "emergency_sos" && item.status === "pending")
    console.log(`  -> IndexedDB pending_sync contains emergency_sos: ${sosPendingItem ? "PASS" : "FAIL"}`)
    if (sosPendingItem) {
      console.log(`     Client ID: ${sosPendingItem.client_id}`)
      console.log(`     Patient: ${sosPendingItem.payload?.patient_name} (${sosPendingItem.payload?.patient_id})`)
    }

    // 6. Reconnect network (Online Mode ON) & trigger automatic sync
    console.log("  -> Reconnecting network (Online Mode ON) & triggering auto-sync...")
    await patientPage.setOfflineMode(false)
    await patientPage.evaluate(async () => {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true })
      window.dispatchEvent(new Event("online"))
    })
    await sleep(2500)

    // Trigger syncPendingQueue from client if needed
    await patientPage.evaluate(async () => {
      const offlineDb = await import("/src/lib/offlineDb.js")
      await offlineDb.syncPendingQueue()
    })
    await sleep(2000)

    // 7. Verify ASHA receives the synced SOS
    await ashaPage.evaluate(async () => {
      const api = await import("/src/lib/api.js")
      return await api.getActiveEmergencyAlerts()
    })
    await sleep(2000)

    const ashaTextAfterSync = await ashaPage.evaluate(() => document.body.innerText)
    const ashaGotSyncedAlert = ashaTextAfterSync.includes("EMERGENCY ALERT") || ashaTextAfterSync.includes("ACKNOWLEDGE")
    console.log(`  -> ASHA received synchronized Offline SOS: ${ashaGotSyncedAlert ? "PASS" : "FAIL"}`)

    // 8. ASHA Acknowledges the synced SOS
    console.log("  -> ASHA acknowledging synchronized offline SOS...")
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("ACKNOWLEDGE") || b.textContent.includes("Acknowledge"))
      if (ackBtn) ackBtn.click()
    })
    await sleep(2000)

    const ashaFinalText = await ashaPage.evaluate(() => document.body.innerText)
    const ashaFinalCleared = !ashaFinalText.includes("ACKNOWLEDGE EMERGENCY")
    console.log(`  -> Synced SOS cleared from ASHA dashboard: ${ashaFinalCleared ? "PASS" : "FAIL"}`)

    console.log("\n================================================================================")
    console.log("                      ALL E2E BROWSER TESTS COMPLETED!")
    console.log("================================================================================")
  } catch (err) {
    console.error("E2E Browser Test Error:", err)
  } finally {
    await browser.close()
  }
}

runBrowserTests()
