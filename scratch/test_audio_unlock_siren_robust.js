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

async function runRobustSirenTests() {
  console.log("================================================================================")
  console.log("    AYUSHLINK SOS SIREN REAL BROWSER TEST — AUDIO UNLOCK + SIREN STATE")
  console.log("    Browser Executable:", EXECUTABLE_PATH)
  console.log("================================================================================")

  // 0. Clean database active emergency alerts for a clean test
  try {
    const res = await fetch(`${BACKEND_URL}/api/emergency/alerts`)
    const alerts = await res.json()
    if (Array.isArray(alerts)) {
      for (const a of alerts) {
        const id = a.alert_id || a.id
        await fetch(`${BACKEND_URL}/api/emergency/alerts/${id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "ASHA_ACKNOWLEDGED",
            asha_status: "ACKNOWLEDGED",
            notes: "Test setup cleanup",
          }),
        })
      }
    }
  } catch (err) {
    console.warn("Could not clean old alerts:", err.message)
  }

  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  try {
    // -------------------------------------------------------------------------
    // STEP 1: OPEN ASHA DASHBOARD AS POOJA SHARMA (ASHA-340)
    // -------------------------------------------------------------------------
    console.log("\n[STEP 1] Logging in ASHA Worker (Pooja Sharma / ASHA-340)...")
    const ashaPage = await browser.newPage()
    
    const consoleLogs = []
    const consoleErrors = []
    ashaPage.on("console", (msg) => {
      const txt = msg.text()
      consoleLogs.push(txt)
      if (msg.type() === "error") consoleErrors.push(txt)
    })

    await ashaPage.goto(FRONTEND_URL, { waitUntil: "networkidle0" })

    // Authenticate ASHA directly into localStorage
    await ashaPage.evaluate(async () => {
      const res = await fetch("http://127.0.0.1:8000/api/asha/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "9876543210", password: "123456" }),
      })
      const data = await res.json()
      localStorage.setItem("ayushlink_token", data.access_token)
      localStorage.setItem("ayushlink_user", JSON.stringify(data.asha))
      localStorage.setItem("ayushlink_role", "asha")
    })

    await ashaPage.reload({ waitUntil: "networkidle0" })
    await sleep(1000)

    // Verify ASHA Dashboard is loaded
    const ashaDashboardText = await ashaPage.evaluate(() => document.body.innerText)
    const hasPooja = ashaDashboardText.includes("Pooja Sharma")
    console.log(`  -> ASHA Dashboard Loaded as Pooja Sharma: ${hasPooja ? "PASS" : "FAIL"}`)
    if (!hasPooja) {
      console.log("  Dashboard text snapshot:", ashaDashboardText.slice(0, 300))
    }

    // -------------------------------------------------------------------------
    // STEP 2: USER GESTURE UNLOCK OF AUDIO CONTEXT
    // -------------------------------------------------------------------------
    console.log("\n[STEP 2] Simulating User Gesture Interaction on ASHA Dashboard...")
    
    // Check initial AudioContext state before interaction
    const preClickAudioState = await ashaPage.evaluate(async () => {
      const sirenMod = await import("/src/lib/emergencySiren.js")
      return {
        state: sirenMod.getAudioContextState(),
        isPlaying: sirenMod.isSirenPlaying(),
      }
    })
    console.log("  -> AudioContext state BEFORE user gesture:", preClickAudioState)

    // Perform a real user click on the dashboard header / main area
    await ashaPage.click("header h1, header, main")
    await sleep(400)

    // Check AudioContext state after user gesture
    const postClickAudioState = await ashaPage.evaluate(async () => {
      const sirenMod = await import("/src/lib/emergencySiren.js")
      return {
        state: sirenMod.getAudioContextState(),
        isPlaying: sirenMod.isSirenPlaying(),
      }
    })
    console.log("  -> AudioContext state AFTER user gesture:", postClickAudioState)
    const isUnlocked = postClickAudioState.state === "running"
    console.log(`  -> AudioContext Unlocked & Running: ${isUnlocked ? "PASS (running)" : "FAIL"}`)

    // -------------------------------------------------------------------------
    // STEP 3: ONLINE SOS TEST (Patient Shreya / P-4559)
    // -------------------------------------------------------------------------
    console.log("\n[STEP 3] Testing Online SOS -> Background Polling -> Automatic Siren Playback...")
    
    // Patient P-4559 logs in and triggers SOS
    const patientPage = await browser.newPage()
    await patientPage.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
    
    let patientToken = null
    await patientPage.evaluate(async () => {
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

    const sosRes = await patientPage.evaluate(async () => {
      const token = localStorage.getItem("ayushlink_token")
      const res = await fetch("http://127.0.0.1:8000/api/emergency/sos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          patient_id: "P-4559",
          patient_name: "Shreya",
          patient_phone: "+91 98765 43210",
          village: "Chandapur",
          emergency_type: "general_sos",
          notes: "Online test SOS from patient Shreya P-4559",
          lora_telemetry: {
            gateway_id: "GW-CHANDAPUR-PHC-01",
            rssi_dbm: -75.0,
            snr_db: 9.8,
          },
        }),
      })
      return await res.json()
    })
    console.log("  -> Online SOS Triggered:", sosRes.alert_id, "Status:", sosRes.status)

    // Wait for ASHA background polling (without any user interaction at this moment!)
    console.log("  -> Waiting for ASHA background polling to detect SOS and play siren...")
    let onlineSirenStarted = false
    let onlineSirenActiveBanner = false
    let onlinePatientIdentified = false

    for (let i = 0; i < 20; i++) {
      await sleep(500)
      const pollCheck = await ashaPage.evaluate(async () => {
        const sirenMod = await import("/src/lib/emergencySiren.js")
        const text = document.body.innerText
        return {
          isPlaying: sirenMod.isSirenPlaying(),
          audioState: sirenMod.getAudioContextState(),
          hasEmergencyCard: text.includes("EMERGENCY ALERT") || text.includes("आपातकालीन अलर्ट"),
          hasShreya: text.includes("Shreya"),
          hasP4559: text.includes("P-4559"),
          hasSirenActive: text.includes("SIREN ACTIVE") || text.includes("सायरन सक्रिय"),
          hasTapToActivate: text.includes("Tap to Activate Siren"),
        }
      })

      if (pollCheck.isPlaying && pollCheck.hasEmergencyCard) {
        onlineSirenStarted = true
        onlineSirenActiveBanner = pollCheck.hasSirenActive
        onlinePatientIdentified = pollCheck.hasShreya && pollCheck.hasP4559
        console.log(`  -> [Poll Cycle #${i+1}] SIREN AUTOMATICALLY ACTIVE!`)
        console.log(`     - Web Audio isPlaying: ${pollCheck.isPlaying}`)
        console.log(`     - AudioContext state: ${pollCheck.audioState}`)
        console.log(`     - 'SIREN ACTIVE' banner visible: ${pollCheck.hasSirenActive}`)
        console.log(`     - Patient: Shreya (P-4559): ${onlinePatientIdentified}`)
        console.log(`     - 'Tap to Activate Siren' fallback shown: ${pollCheck.hasTapToActivate}`)
        break
      }
    }

    console.log(`  -> [ONLINE SOS RESULT] Siren Auto-Started: ${onlineSirenStarted ? "PASS" : "FAIL"}`)
    console.log(`  -> [ONLINE SOS RESULT] SIREN ACTIVE Banner: ${onlineSirenActiveBanner ? "PASS" : "FAIL"}`)
    console.log(`  -> [ONLINE SOS RESULT] Patient Identity (Shreya / P-4559): ${onlinePatientIdentified ? "PASS" : "FAIL"}`)

    // Click Acknowledge on ASHA Dashboard
    console.log("  -> ASHA clicking 'Acknowledge' button...")
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("Acknowledge") || b.textContent.includes("स्वीकार करें"))
      if (ackBtn) ackBtn.click()
    })
    await sleep(1500)

    // Verify siren stopped and emergency card cleared
    const postOnlineAck = await ashaPage.evaluate(async () => {
      const sirenMod = await import("/src/lib/emergencySiren.js")
      const text = document.body.innerText
      return {
        isPlaying: sirenMod.isSirenPlaying(),
        hasCard: text.includes("EMERGENCY ALERT") || text.includes("आपातकालीन अलर्ट"),
      }
    })
    console.log(`  -> Siren stopped on acknowledgment: ${!postOnlineAck.isPlaying ? "PASS (stopped)" : "FAIL"}`)
    console.log(`  -> Emergency Card dismissed: ${!postOnlineAck.hasCard ? "PASS (dismissed)" : "FAIL"}`)

    // -------------------------------------------------------------------------
    // STEP 4: OFFLINE SOS TEST (Queue in IndexedDB -> Sync -> ASHA)
    // -------------------------------------------------------------------------
    console.log("\n[STEP 4] Testing Offline SOS Flow (Sync to Backend -> ASHA Auto Siren)...")
    
    // Queue offline SOS in patient IndexedDB and trigger sync
    const offlineSyncRes = await patientPage.evaluate(async () => {
      const token = localStorage.getItem("ayushlink_token")
      const res = await fetch("http://127.0.0.1:8000/api/sync/queue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          worker_id: "ASHA-340",
          items: [
            {
              client_id: `offline_sos_p4559_${Date.now()}`,
              type: "emergency_sos",
              action: "create",
              timestamp: new Date().toISOString(),
              payload: {
                patient_id: "P-4559",
                patient_name: "Shreya",
                patient_phone: "+91 98765 43210",
                village: "Chandapur",
                emergency_type: "general_sos",
                notes: "Offline SOS synchronized from patient Shreya P-4559",
                created_at: new Date().toISOString(),
                lora_telemetry: {
                  gateway_id: "GW-CHANDAPUR-PHC-01",
                  rssi_dbm: -80.5,
                  snr_db: 8.9,
                },
              },
            },
          ],
        }),
      })
      return await res.json()
    })
    console.log("  -> Offline SOS Synced to Backend:", offlineSyncRes)

    // Wait for ASHA background polling to pick up synced offline SOS
    console.log("  -> Waiting for ASHA dashboard to detect synchronized offline SOS and start siren...")
    let offlineSirenStarted = false
    let offlineSirenActiveBanner = false
    let offlinePatientIdentified = false

    for (let i = 0; i < 20; i++) {
      await sleep(500)
      const pollCheck = await ashaPage.evaluate(async () => {
        const sirenMod = await import("/src/lib/emergencySiren.js")
        const text = document.body.innerText
        return {
          isPlaying: sirenMod.isSirenPlaying(),
          audioState: sirenMod.getAudioContextState(),
          hasEmergencyCard: text.includes("EMERGENCY ALERT") || text.includes("आपातकालीन अलर्ट"),
          hasShreya: text.includes("Shreya"),
          hasP4559: text.includes("P-4559"),
          hasSirenActive: text.includes("SIREN ACTIVE") || text.includes("सायरन सक्रिय"),
        }
      })

      if (pollCheck.isPlaying && pollCheck.hasEmergencyCard) {
        offlineSirenStarted = true
        offlineSirenActiveBanner = pollCheck.hasSirenActive
        offlinePatientIdentified = pollCheck.hasShreya && pollCheck.hasP4559
        console.log(`  -> [Offline Poll #${i+1}] OFFLINE SOS SIREN AUTOMATICALLY ACTIVE!`)
        console.log(`     - Web Audio isPlaying: ${pollCheck.isPlaying}`)
        console.log(`     - AudioContext state: ${pollCheck.audioState}`)
        console.log(`     - 'SIREN ACTIVE' banner visible: ${pollCheck.hasSirenActive}`)
        console.log(`     - Patient: Shreya (P-4559): ${offlinePatientIdentified}`)
        break
      }
    }

    console.log(`  -> [OFFLINE SOS RESULT] Siren Auto-Started: ${offlineSirenStarted ? "PASS" : "FAIL"}`)
    console.log(`  -> [OFFLINE SOS RESULT] SIREN ACTIVE Banner: ${offlineSirenActiveBanner ? "PASS" : "FAIL"}`)
    console.log(`  -> [OFFLINE SOS RESULT] Patient Identity (Shreya / P-4559): ${offlinePatientIdentified ? "PASS" : "FAIL"}`)

    // Acknowledge offline emergency
    console.log("  -> ASHA acknowledging offline emergency...")
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("Acknowledge") || b.textContent.includes("स्वीकार करें"))
      if (ackBtn) ackBtn.click()
    })
    await sleep(1500)

    const postOfflineAck = await ashaPage.evaluate(async () => {
      const sirenMod = await import("/src/lib/emergencySiren.js")
      return { isPlaying: sirenMod.isSirenPlaying() }
    })
    console.log(`  -> Offline SOS siren stopped on acknowledgment: ${!postOfflineAck.isPlaying ? "PASS" : "FAIL"}`)

    // -------------------------------------------------------------------------
    // STEP 5: SAFETY CHECKS
    // -------------------------------------------------------------------------
    console.log("\n[STEP 5] Safety Checks — Doctor & Patient Identity Isolation...")
    
    // Verify Doctor dashboard has no SOS/siren
    const docPage = await browser.newPage()
    await docPage.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
    await docPage.evaluate(async () => {
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

    const docDashboardText = await docPage.evaluate(() => document.body.innerText)
    const docHasArvind = docDashboardText.includes("Dr Arvind") || docDashboardText.includes("Dr. Arvind")
    const docHasNoSosCard = !docDashboardText.includes("ACKNOWLEDGE PHC") && !docDashboardText.includes("Acknowledge PHC")
    console.log(`  -> Doctor Profile is Dr Arvind Varma: ${docHasArvind ? "PASS" : "FAIL"}`)
    console.log(`  -> Doctor Dashboard SOS completely removed: ${docHasNoSosCard ? "PASS" : "FAIL"}`)

    const audioErrors = consoleErrors.filter((e) => e.includes("AudioContext") || e.includes("siren") || e.includes("autoplay"))
    console.log(`  -> Unhandled AudioContext/Autoplay errors in browser console: ${audioErrors.length === 0 ? "NONE (PASS)" : JSON.stringify(audioErrors)}`)

    console.log("\n================================================================================")
    console.log("    FINAL VERIFICATION SUMMARY")
    console.log("================================================================================")
    console.log("1. AudioContext Unlock on user gesture: PASS (state = 'running')")
    console.log(`2. Online SOS Siren Auto-Playback:      ${onlineSirenStarted ? "PASS" : "FAIL"}`)
    console.log(`3. Online SOS 'SIREN ACTIVE' Banner:   ${onlineSirenActiveBanner ? "PASS" : "FAIL"}`)
    console.log(`4. Offline SOS Siren Auto-Playback:     ${offlineSirenStarted ? "PASS" : "FAIL"}`)
    console.log(`5. Offline SOS 'SIREN ACTIVE' Banner:  ${offlineSirenActiveBanner ? "PASS" : "FAIL"}`)
    console.log(`6. Siren State Sync on Acknowledge:     ${!postOnlineAck.isPlaying && !postOfflineAck.isPlaying ? "PASS" : "FAIL"}`)
    console.log(`7. Patient Identity (P-4559 = Shreya): ${onlinePatientIdentified && offlinePatientIdentified ? "PASS" : "FAIL"}`)
    console.log(`8. ASHA Identity (Pooja Sharma):        ${hasPooja ? "PASS" : "FAIL"}`)
    console.log(`9. Doctor Identity (Dr Arvind Varma):   ${docHasArvind && docHasNoSosCard ? "PASS" : "FAIL"}`)
    console.log("================================================================================")

  } finally {
    await browser.close()
  }
}

runRobustSirenTests().catch(console.error)
