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

async function runCompleteSirenSuite() {
  console.log("================================================================================")
  console.log("    AYUSHLINK SOS SIREN FIX PART 2 — COMPLETE REAL BROWSER E2E TEST")
  console.log("    Chrome Executable:", EXECUTABLE_PATH)
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
            notes: "Clean setup for E2E test",
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
    defaultViewport: { width: 1280, height: 800 },
  })

  const results = {
    ashaLoginPoojaSharma: false,
    audioContextUnlocked: false,
    audioContextRunning: false,
    onlineSosReceived: false,
    onlinePatientIdentified: false,
    onlineSirenAutoStarted: false,
    onlineSirenActiveBanner: false,
    onlineSirenStoppedOnAck: false,
    offlineSosReceived: false,
    offlinePatientIdentified: false,
    offlineSirenAutoStarted: false,
    offlineSirenActiveBanner: false,
    offlineSirenStoppedOnAck: false,
    doctorIdentitySafe: false,
    doctorSosRemoved: false,
    noUnhandledAudioErrors: true,
  }

  try {
    // -------------------------------------------------------------------------
    // 1. ASHA LOGIN & AUDIO UNLOCK
    // -------------------------------------------------------------------------
    console.log("\n[1] Launching ASHA Dashboard (Pooja Sharma / ASHA-340)...")
    const ashaPage = await browser.newPage()
    await ashaPage.setViewport({ width: 1280, height: 800 })
    
    const consoleErrors = []
    ashaPage.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text())
        console.error("  [BROWSER CONSOLE ERROR]:", msg.text())
      }
    })

    await ashaPage.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
    await sleep(2800)

    // Click "Get Started" on Splash screen
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
      if (btn) btn.click()
    })
    await sleep(800)

    // Click "ASHA Worker"
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("ASHA Worker") || b.textContent.includes("आशा कार्यकर्ता"))
      if (btn) btn.click()
    })
    await sleep(800)

    // Fill login form: 9876543210 / 123456
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

    const ashaText = await ashaPage.evaluate(() => document.body.innerText)
    results.ashaLoginPoojaSharma = ashaText.includes("Pooja Sharma")
    console.log(`  -> ASHA Dashboard Loaded as Pooja Sharma: ${results.ashaLoginPoojaSharma ? "PASS" : "FAIL"}`)

    // Check AudioContext before user click
    const preAudio = await ashaPage.evaluate(() => {
      const s = window.__ayushlink_emergency_siren
      return s ? { state: s.getAudioContextState(), isPlaying: s.isSirenPlaying() } : null
    })
    console.log("  -> AudioContext BEFORE user gesture:", preAudio)

    // User interaction (click anywhere on dashboard)
    console.log("  -> Performing user gesture (click on dashboard)...")
    await ashaPage.click("header, main")
    await sleep(400)

    const postAudio = await ashaPage.evaluate(() => {
      const s = window.__ayushlink_emergency_siren
      return s ? { state: s.getAudioContextState(), isPlaying: s.isSirenPlaying() } : null
    })
    console.log("  -> AudioContext AFTER user gesture:", postAudio)
    results.audioContextUnlocked = postAudio && postAudio.state === "running"
    results.audioContextRunning = postAudio && postAudio.state === "running"
    console.log(`  -> AudioContext Unlocked into 'running' state: ${results.audioContextRunning ? "PASS" : "FAIL"}`)

    // -------------------------------------------------------------------------
    // 2. ONLINE SOS TEST (Patient Shreya / P-4559)
    // -------------------------------------------------------------------------
    console.log("\n[2] Patient P-4559 (Shreya) sending ONLINE SOS...")
    const patientLoginRes = await fetch(`${BACKEND_URL}/api/patient/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "9324998108", password: "123456" }),
    })
    const patientLogin = await patientLoginRes.json()
    const patientToken = patientLogin.access_token

    const onlineSosRes = await fetch(`${BACKEND_URL}/api/emergency/sos`, {
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
        notes: "Online Emergency SOS test",
        lora_telemetry: {
          gateway_id: "GW-CHANDAPUR-PHC-01",
          rssi_dbm: -76.2,
          snr_db: 9.4,
        },
      }),
    })
    const onlineSos = await onlineSosRes.json()
    console.log(`  -> Online SOS created: ${onlineSos.alert_id} (status: ${onlineSos.status})`)

    // Wait for ASHA background polling (do NOT click anything on ASHA page!)
    console.log("  -> Waiting for ASHA polling to detect SOS and automatically trigger siren...")
    for (let i = 0; i < 20; i++) {
      await sleep(500)
      const poll = await ashaPage.evaluate(() => {
        const s = window.__ayushlink_emergency_siren
        const text = document.body.innerText
        return {
          hasCard: text.includes("EMERGENCY ALERT") || text.includes("आपातकालीन अलर्ट"),
          hasShreya: text.includes("Shreya"),
          hasP4559: text.includes("P-4559"),
          hasSirenActive: text.includes("SIREN ACTIVE") || text.includes("सायरन सक्रिय"),
          isPlaying: s ? s.isSirenPlaying() : false,
          audioState: s ? s.getAudioContextState() : "none",
        }
      })

      if (poll.hasCard && poll.isPlaying) {
        results.onlineSosReceived = true
        results.onlinePatientIdentified = poll.hasShreya && poll.hasP4559
        results.onlineSirenAutoStarted = poll.isPlaying
        results.onlineSirenActiveBanner = poll.hasSirenActive
        console.log(`  -> [Poll #${i+1}] ONLINE SOS SIREN AUTOMATICALLY PLAYING!`)
        console.log(`     - Card visible: ${poll.hasCard}`)
        console.log(`     - Patient: Shreya (P-4559): ${results.onlinePatientIdentified}`)
        console.log(`     - Siren isPlaying: ${poll.isPlaying}`)
        console.log(`     - SIREN ACTIVE banner: ${poll.hasSirenActive}`)
        console.log(`     - AudioContext state: ${poll.audioState}`)
        break
      }
    }

    // Acknowledge the online emergency
    console.log("  -> ASHA clicking 'Acknowledge' button...")
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("Acknowledge") || b.textContent.includes("स्वीकार करें"))
      if (ackBtn) ackBtn.click()
    })
    await sleep(1500)

    const postOnlineAck = await ashaPage.evaluate(() => {
      const s = window.__ayushlink_emergency_siren
      const text = document.body.innerText
      return {
        isPlaying: s ? s.isSirenPlaying() : false,
        hasCard: text.includes("EMERGENCY ALERT") || text.includes("आपातकालीन अलर्ट"),
      }
    })
    results.onlineSirenStoppedOnAck = !postOnlineAck.isPlaying && !postOnlineAck.hasCard
    console.log(`  -> Online Siren stopped & Card cleared: ${results.onlineSirenStoppedOnAck ? "PASS" : "FAIL"}`)

    // -------------------------------------------------------------------------
    // 3. OFFLINE SOS TEST (Queue -> Sync -> ASHA Siren)
    // -------------------------------------------------------------------------
    console.log("\n[3] Testing OFFLINE SOS (Queued locally -> Synced via /api/sync/batch -> ASHA Siren)...")
    const offlineSyncRes = await fetch(`${BACKEND_URL}/api/sync/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${patientToken}`,
      },
      body: JSON.stringify({
        batch_id: `batch_offline_${Date.now()}`,
        items: [
          {
            client_id: `offline_sos_p4559_${Date.now()}`,
            type: "emergency_sos",
            payload: {
              patient_id: "P-4559",
              patient_name: "Shreya",
              patient_phone: "+91 98765 43210",
              village: "Chandapur",
              emergency_type: "general_sos",
              notes: "Offline SOS synchronized from patient Shreya",
              created_at: new Date().toISOString(),
              lora_telemetry: {
                gateway_id: "GW-CHANDAPUR-PHC-01",
                rssi_dbm: -81.0,
                snr_db: 8.8,
              },
            },
          },
        ],
      }),
    })
    const offlineSync = await offlineSyncRes.json()
    console.log("  -> Offline SOS Synced via /api/sync/batch:", offlineSync)

    // Wait for ASHA background polling
    console.log("  -> Waiting for ASHA polling to detect synchronized offline SOS and start siren...")
    for (let i = 0; i < 20; i++) {
      await sleep(500)
      const poll = await ashaPage.evaluate(() => {
        const s = window.__ayushlink_emergency_siren
        const text = document.body.innerText
        return {
          hasCard: text.includes("EMERGENCY ALERT") || text.includes("आपातकालीन अलर्ट"),
          hasShreya: text.includes("Shreya"),
          hasP4559: text.includes("P-4559"),
          hasSirenActive: text.includes("SIREN ACTIVE") || text.includes("सायरन सक्रिय"),
          isPlaying: s ? s.isSirenPlaying() : false,
          audioState: s ? s.getAudioContextState() : "none",
        }
      })

      if (poll.hasCard && poll.isPlaying) {
        results.offlineSosReceived = true
        results.offlinePatientIdentified = poll.hasShreya && poll.hasP4559
        results.offlineSirenAutoStarted = poll.isPlaying
        results.offlineSirenActiveBanner = poll.hasSirenActive
        console.log(`  -> [Offline Poll #${i+1}] OFFLINE SOS SIREN AUTOMATICALLY PLAYING!`)
        console.log(`     - Card visible: ${poll.hasCard}`)
        console.log(`     - Patient: Shreya (P-4559): ${results.offlinePatientIdentified}`)
        console.log(`     - Siren isPlaying: ${poll.isPlaying}`)
        console.log(`     - SIREN ACTIVE banner: ${poll.hasSirenActive}`)
        console.log(`     - AudioContext state: ${poll.audioState}`)
        break
      }
    }

    // Acknowledge offline emergency
    console.log("  -> ASHA acknowledging offline emergency...")
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const ackBtn = btns.find((b) => b.textContent.includes("Acknowledge") || b.textContent.includes("स्वीकार करें"))
      if (ackBtn) ackBtn.click()
    })
    await sleep(1500)

    const postOfflineAck = await ashaPage.evaluate(() => {
      const s = window.__ayushlink_emergency_siren
      const text = document.body.innerText
      return {
        isPlaying: s ? s.isSirenPlaying() : false,
        hasCard: text.includes("EMERGENCY ALERT") || text.includes("आपातकालीन अलर्ट"),
      }
    })
    results.offlineSirenStoppedOnAck = !postOfflineAck.isPlaying && !postOfflineAck.hasCard
    console.log(`  -> Offline Siren stopped & Card cleared: ${results.offlineSirenStoppedOnAck ? "PASS" : "FAIL"}`)

    // -------------------------------------------------------------------------
    // 4. DOCTOR IDENTITY & DOCTOR SOS REMOVAL SAFETY CHECKS
    // -------------------------------------------------------------------------
    console.log("\n[4] Safety Checks (Doctor Identity & Doctor SOS Removal)...")
    const docPage = await browser.newPage()
    await docPage.setViewport({ width: 1280, height: 800 })
    await docPage.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
    await sleep(2800)

    await docPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
      if (btn) btn.click()
    })
    await sleep(800)

    await docPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Doctor") || b.textContent.includes("डॉक्टर"))
      if (btn) btn.click()
    })
    await sleep(800)

    // Doctor Dr Arvind Varma: 9823088882 / 123456
    await docPage.focus('input[type="tel"]')
    await docPage.keyboard.type("9823088882")
    await sleep(100)
    await docPage.focus('input[type="password"]')
    await docPage.keyboard.type("123456")
    await sleep(100)

    await docPage.evaluate(() => {
      const form = document.querySelector("form")
      if (form) form.requestSubmit()
    })
    await sleep(2500)

    const docText = await docPage.evaluate(() => document.body.innerText)
    const docStoredUser = await docPage.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem("ayushlink_user"))
      } catch {
        return null
      }
    })
    results.doctorIdentitySafe = (docText.includes("Dr Arvind") || docText.includes("Dr. Arvind") || docStoredUser?.full_name?.includes("Arvind")) && docStoredUser?.doctor_id === "DOC-501"
    results.doctorSosRemoved = !docText.includes("ACKNOWLEDGE PHC") && !docText.includes("Acknowledge PHC")
    console.log(`  -> Doctor Profile Name (Dr Arvind Varma / DOC-501): ${results.doctorIdentitySafe ? "PASS" : "FAIL"}`)
    console.log(`  -> Doctor SOS Card Removed from Doctor Dashboard: ${results.doctorSosRemoved ? "PASS" : "FAIL"}`)

    const audioCtxErrors = consoleErrors.filter((e) => e.includes("AudioContext") || e.includes("siren") || e.includes("autoplay"))
    results.noUnhandledAudioErrors = audioCtxErrors.length === 0
    console.log(`  -> Zero Unhandled AudioContext/Autoplay Errors: ${results.noUnhandledAudioErrors ? "PASS" : "FAIL"}`)

    console.log("\n================================================================================")
    console.log("    FINAL VERIFICATION TABLE")
    console.log("================================================================================")
    console.table(results)

  } finally {
    await browser.close()
  }
}

runCompleteSirenSuite().catch(console.error)
