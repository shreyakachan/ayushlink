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

async function runE2ESirenTest() {
  console.log("================================================================================")
  console.log("    AYUSHLINK SOS SIREN E2E TEST: REAL BROWSER AUDIO UNLOCK + SIREN")
  console.log("    Browser:", EXECUTABLE_PATH)
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
    // STEP 1: ASHA LOGIN VIA UI
    // -------------------------------------------------------------------------
    console.log("\n[STEP 1] Navigating & Logging in as ASHA (Pooja Sharma / ASHA-340)...")
    const ashaPage = await browser.newPage()
    
    const consoleErrors = []
    ashaPage.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text())
    })

    await ashaPage.goto(FRONTEND_URL, { waitUntil: "networkidle0" })

    // Splash screen -> Click "Get Started"
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
      if (btn) btn.click()
    })
    await sleep(600)

    // Role select -> Click "ASHA Worker"
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("ASHA Worker") || b.textContent.includes("आशा कार्यकर्ता"))
      if (btn) btn.click()
    })
    await sleep(600)

    // Fill login form: 9876543210 / 123456
    const phoneInput = await ashaPage.$('input[type="tel"]')
    const passInput = await ashaPage.$('input[type="password"]')
    if (phoneInput && passInput) {
      await phoneInput.type("9876543210")
      await passInput.type("123456")
      await sleep(200)
      await ashaPage.evaluate(() => {
        const form = document.querySelector("form")
        if (form) {
          form.requestSubmit()
        } else {
          const btn = Array.from(document.querySelectorAll("button")).find(
            (b) => b.type === "submit" || b.textContent.includes("Sign In") || b.textContent.includes("Login")
          )
          if (btn) btn.click()
        }
      })
      await sleep(2000)
    }

    const ashaText = await ashaPage.evaluate(() => document.body.innerText)
    const hasPooja = ashaText.includes("Pooja Sharma")
    console.log(`  -> ASHA Dashboard Loaded as Pooja Sharma: ${hasPooja ? "PASS" : "FAIL"}`)

    // -------------------------------------------------------------------------
    // STEP 2: USER INTERACTION & AUDIO CONTEXT UNLOCK
    // -------------------------------------------------------------------------
    console.log("\n[STEP 2] Simulating User Interaction on ASHA Dashboard...")
    
    // Check initial AudioContext state
    const preAudio = await ashaPage.evaluate(async () => {
      const mod = await import("/src/lib/emergencySiren.js")
      return { state: mod.getAudioContextState(), isPlaying: mod.isSirenPlaying() }
    })
    console.log("  -> AudioContext BEFORE click:", preAudio)

    // User clicks somewhere on the ASHA dashboard
    await ashaPage.click("header, main, button")
    await sleep(300)

    const postAudio = await ashaPage.evaluate(async () => {
      const mod = await import("/src/lib/emergencySiren.js")
      return { state: mod.getAudioContextState(), isPlaying: mod.isSirenPlaying() }
    })
    console.log("  -> AudioContext AFTER user click:", postAudio)
    console.log(`  -> AudioContext state is running: ${postAudio.state === "running" ? "PASS" : "FAIL"}`)

    // -------------------------------------------------------------------------
    // STEP 3: ONLINE SOS TEST (Patient Shreya / P-4559)
    // -------------------------------------------------------------------------
    console.log("\n[STEP 3] Testing Online SOS -> Background Polling -> Automatic Siren Playback...")
    
    // Patient P-4559 logs in via API and sends SOS
    const patientLoginRes = await fetch(`${BACKEND_URL}/api/patient/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "9324998108", password: "123456" }),
    })
    const patientLoginData = await patientLoginRes.json()
    const patientToken = patientLoginData.access_token

    const sosRes = await fetch(`${BACKEND_URL}/api/emergency/sos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${patientToken}`,
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
    const sosData = await sosRes.json()
    console.log("  -> Online SOS Triggered:", sosData.alert_id, "Status:", sosData.status)

    // Wait for ASHA background polling (ASHA tab is untouched!)
    console.log("  -> Waiting for ASHA polling to detect SOS and automatically start siren...")
    let onlineSirenPlaying = false
    let onlineSirenBanner = false
    let onlinePatientMatch = false

    for (let i = 0; i < 20; i++) {
      await sleep(500)
      const pollCheck = await ashaPage.evaluate(async () => {
        const mod = await import("/src/lib/emergencySiren.js")
        const text = document.body.innerText
        return {
          isPlaying: mod.isSirenPlaying(),
          audioState: mod.getAudioContextState(),
          hasEmergencyCard: text.includes("EMERGENCY ALERT") || text.includes("आपातकालीन अलर्ट"),
          hasShreya: text.includes("Shreya"),
          hasP4559: text.includes("P-4559"),
          hasSirenActive: text.includes("SIREN ACTIVE") || text.includes("सायरन सक्रिय"),
          hasTapToActivate: text.includes("Tap to Activate Siren"),
        }
      })

      if (pollCheck.isPlaying && pollCheck.hasEmergencyCard) {
        onlineSirenPlaying = true
        onlineSirenBanner = pollCheck.hasSirenActive
        onlinePatientMatch = pollCheck.hasShreya && pollCheck.hasP4559
        console.log(`  -> [Poll #${i+1}] SIREN AUTOMATICALLY ACTIVE!`)
        console.log(`     - isPlaying: ${pollCheck.isPlaying}`)
        console.log(`     - AudioContext state: ${pollCheck.audioState}`)
        console.log(`     - SIREN ACTIVE banner: ${pollCheck.hasSirenActive}`)
        console.log(`     - Patient: Shreya / P-4559: ${onlinePatientMatch}`)
        break
      }
    }

    console.log(`  -> [ONLINE TEST RESULT] Siren Auto-Played: ${onlineSirenPlaying ? "PASS" : "FAIL"}`)
    console.log(`  -> [ONLINE TEST RESULT] SIREN ACTIVE Banner: ${onlineSirenBanner ? "PASS" : "FAIL"}`)
    console.log(`  -> [ONLINE TEST RESULT] Patient Identity: ${onlinePatientMatch ? "PASS" : "FAIL"}`)

    // Click Acknowledge on ASHA dashboard
    console.log("  -> ASHA clicking 'Acknowledge' button...")
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("Acknowledge") || b.textContent.includes("स्वीकार करें"))
      if (ackBtn) ackBtn.click()
    })
    await sleep(1500)

    const postAckState = await ashaPage.evaluate(async () => {
      const mod = await import("/src/lib/emergencySiren.js")
      const text = document.body.innerText
      return {
        isPlaying: mod.isSirenPlaying(),
        hasCard: text.includes("EMERGENCY ALERT") || text.includes("आपातकालीन अलर्ट"),
      }
    })
    console.log(`  -> Siren stopped on acknowledgment: ${!postAckState.isPlaying ? "PASS (stopped)" : "FAIL"}`)
    console.log(`  -> Emergency Card dismissed: ${!postAckState.hasCard ? "PASS (dismissed)" : "FAIL"}`)

    // -------------------------------------------------------------------------
    // STEP 4: OFFLINE SOS TEST
    // -------------------------------------------------------------------------
    console.log("\n[STEP 4] Testing Offline SOS Flow (Sync to Backend -> ASHA Auto Siren)...")
    
    // Simulate IndexedDB sync to backend
    const syncRes = await fetch(`${BACKEND_URL}/api/sync/queue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${patientToken}`,
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
    const syncData = await syncRes.json()
    console.log("  -> Offline SOS Synced to Backend:", syncData)

    // Wait for ASHA background polling to detect synced offline SOS
    console.log("  -> Waiting for ASHA dashboard to detect synchronized offline SOS and start siren...")
    let offlineSirenPlaying = false
    let offlineSirenBanner = false
    let offlinePatientMatch = false

    for (let i = 0; i < 20; i++) {
      await sleep(500)
      const pollCheck = await ashaPage.evaluate(async () => {
        const mod = await import("/src/lib/emergencySiren.js")
        const text = document.body.innerText
        return {
          isPlaying: mod.isSirenPlaying(),
          audioState: mod.getAudioContextState(),
          hasEmergencyCard: text.includes("EMERGENCY ALERT") || text.includes("आपातकालीन अलर्ट"),
          hasShreya: text.includes("Shreya"),
          hasP4559: text.includes("P-4559"),
          hasSirenActive: text.includes("SIREN ACTIVE") || text.includes("सायरन सक्रिय"),
        }
      })

      if (pollCheck.isPlaying && pollCheck.hasEmergencyCard) {
        offlineSirenPlaying = true
        offlineSirenBanner = pollCheck.hasSirenActive
        offlinePatientMatch = pollCheck.hasShreya && pollCheck.hasP4559
        console.log(`  -> [Offline Poll #${i+1}] OFFLINE SOS SIREN AUTOMATICALLY ACTIVE!`)
        console.log(`     - isPlaying: ${pollCheck.isPlaying}`)
        console.log(`     - AudioContext state: ${pollCheck.audioState}`)
        console.log(`     - SIREN ACTIVE banner: ${pollCheck.hasSirenActive}`)
        console.log(`     - Patient: Shreya / P-4559: ${offlinePatientMatch}`)
        break
      }
    }

    console.log(`  -> [OFFLINE TEST RESULT] Siren Auto-Played: ${offlineSirenPlaying ? "PASS" : "FAIL"}`)
    console.log(`  -> [OFFLINE TEST RESULT] SIREN ACTIVE Banner: ${offlineSirenBanner ? "PASS" : "FAIL"}`)
    console.log(`  -> [OFFLINE TEST RESULT] Patient Identity: ${offlinePatientMatch ? "PASS" : "FAIL"}`)

    // Acknowledge offline emergency
    console.log("  -> ASHA acknowledging offline emergency...")
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("Acknowledge") || b.textContent.includes("स्वीकार करें"))
      if (ackBtn) ackBtn.click()
    })
    await sleep(1500)

    const postOfflineAck = await ashaPage.evaluate(async () => {
      const mod = await import("/src/lib/emergencySiren.js")
      return { isPlaying: mod.isSirenPlaying() }
    })
    console.log(`  -> Offline SOS siren stopped on acknowledgment: ${!postOfflineAck.isPlaying ? "PASS" : "FAIL"}`)

    // -------------------------------------------------------------------------
    // STEP 5: SAFETY CHECKS
    // -------------------------------------------------------------------------
    console.log("\n[STEP 5] Safety Checks...")
    const audioErrors = consoleErrors.filter((e) => e.includes("AudioContext") || e.includes("siren") || e.includes("autoplay"))
    console.log(`  -> Unhandled AudioContext/Autoplay errors in browser console: ${audioErrors.length === 0 ? "NONE (PASS)" : JSON.stringify(audioErrors)}`)

    console.log("\n================================================================================")
    console.log("    FINAL VERIFICATION SUMMARY")
    console.log("================================================================================")
    console.log(`1. AudioContext Unlock on user gesture: ${postAudio.state === "running" ? "PASS (running)" : "FAIL"}`)
    console.log(`2. Online SOS Siren Auto-Playback:      ${onlineSirenPlaying ? "PASS" : "FAIL"}`)
    console.log(`3. Online SOS 'SIREN ACTIVE' Banner:   ${onlineSirenBanner ? "PASS" : "FAIL"}`)
    console.log(`4. Offline SOS Siren Auto-Playback:     ${offlineSirenPlaying ? "PASS" : "FAIL"}`)
    console.log(`5. Offline SOS 'SIREN ACTIVE' Banner:  ${offlineSirenBanner ? "PASS" : "FAIL"}`)
    console.log(`6. Siren State Sync on Acknowledge:     ${!postAckState.isPlaying && !postOfflineAck.isPlaying ? "PASS" : "FAIL"}`)
    console.log(`7. Patient Identity (P-4559 = Shreya): ${onlinePatientMatch && offlinePatientMatch ? "PASS" : "FAIL"}`)
    console.log(`8. ASHA Identity (Pooja Sharma):        ${hasPooja ? "PASS" : "FAIL"}`)
    console.log("================================================================================")

  } finally {
    await browser.close()
  }
}

runE2ESirenTest().catch(console.error)
