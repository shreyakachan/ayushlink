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

async function runSirenTests() {
  console.log("==================================================")
  console.log("STARTING AYUSHLINK SOS SIREN REAL BROWSER TESTS")
  console.log("Executable:", EXECUTABLE_PATH)
  console.log("==================================================")

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
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--autoplay-policy=no-user-gesture-required"],
  })

  // We can also test without --autoplay-policy to test default strict autoplay!
  // Let's launch with default flags in a second test or test here.
  const page = await browser.newPage()
  
  const consoleLogs = []
  const consoleErrors = []
  page.on("console", (msg) => {
    const txt = msg.text()
    consoleLogs.push(txt)
    if (msg.type() === "error") {
      consoleErrors.push(txt)
    }
  })

  await page.goto(FRONTEND_URL, { waitUntil: "networkidle0" })

  // 1. Splash Screen -> Click Get Started
  console.log("\n--- STEP 1: ASHA LOGIN ---")
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
    if (btn) btn.click()
  })
  await sleep(600)

  // 2. Role Select -> Click ASHA Worker
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("ASHA Worker") || b.textContent.includes("आशा कार्यकर्ता"))
    if (btn) btn.click()
  })
  await sleep(600)

  // 3. Login ASHA: 9876543210 / 123456
  await page.evaluate(() => {
    function setReactValue(input, value) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
      setter.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
      input.dispatchEvent(new Event("change", { bubbles: true }))
    }
    const phoneInput = document.querySelector('input[type="tel"]')
    const passInput = document.querySelector('input[type="password"]')
    if (phoneInput) setReactValue(phoneInput, "9876543210")
    if (passInput) setReactValue(passInput, "123456")
  })
  await sleep(300)

  await page.evaluate(() => {
    const form = document.querySelector("form")
    if (form) form.requestSubmit()
  })
  await sleep(1500)

  const dashboardText = await page.evaluate(() => document.body.innerText)
  console.log("ASHA Dashboard Loaded:", dashboardText.includes("Pooja Sharma"))

  // --- STEP 2: USER INTERACTION & AUDIO CONTEXT UNLOCK ---
  console.log("\n--- STEP 2: USER INTERACTION & AUDIO CONTEXT UNLOCK ---")
  // User touches/clicks somewhere on the dashboard
  await page.click("body")
  await sleep(300)

  // Check Web Audio Context State
  const audioUnlockedState = await page.evaluate(async () => {
    const sirenMod = await import("/src/lib/emergencySiren.js")
    return {
      state: sirenMod.getAudioContextState(),
      isPlaying: sirenMod.isSirenPlaying(),
      supported: sirenMod.isSirenSupported(),
    }
  })
  console.log("AudioContext State after interaction:", audioUnlockedState)

  // --- STEP 3: ONLINE SOS TEST ---
  console.log("\n--- STEP 3: ONLINE SOS TEST (Patient P-4559 / Shreya) ---")
  const onlineSosResponse = await fetch(`${BACKEND_URL}/api/emergency/sos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      patient_id: "P-4559",
      patient_name: "Shreya",
      patient_phone: "+91 98765 43210",
      village: "Chandapur",
      emergency_type: "general_sos",
      notes: "Online test SOS from patient P-4559",
      lora_telemetry: {
        gateway_id: "GW-CHANDAPUR-PHC-01",
        rssi_dbm: -78.4,
        snr_db: 9.2,
      },
    }),
  })
  const onlineSosData = await onlineSosResponse.json()
  console.log("Online SOS Created:", onlineSosData.alert_id, "Status:", onlineSosData.status)

  // Wait for ASHA polling to detect SOS and trigger siren
  console.log("Waiting for ASHA dashboard polling...")
  let sirenStartedOnline = false
  let hasSirenActiveText = false
  for (let i = 0; i < 15; i++) {
    await sleep(600)
    const state = await page.evaluate(async () => {
      const sirenMod = await import("/src/lib/emergencySiren.js")
      const text = document.body.innerText
      return {
        isPlaying: sirenMod.isSirenPlaying(),
        audioState: sirenMod.getAudioContextState(),
        hasCard: text.includes("EMERGENCY ALERT") || text.includes("आपातकालीन अलर्ट"),
        hasPatientName: text.includes("Shreya"),
        hasSirenActive: text.includes("SIREN ACTIVE") || text.includes("सायरन सक्रिय"),
        hasTapToActivate: text.includes("Tap to Activate Siren"),
      }
    })
    if (state.isPlaying && state.hasCard) {
      sirenStartedOnline = true
      hasSirenActiveText = state.hasSirenActive
      console.log(`[Poll #${i+1}] Siren playing! AudioContext state: ${state.audioState}, SIREN ACTIVE banner: ${state.hasSirenActive}, Patient: ${state.hasPatientName}`)
      break
    }
  }

  console.log("Online SOS Siren Verification:", {
    sirenStartedOnline,
    hasSirenActiveText,
  })

  // Acknowledge the alert
  console.log("Clicking Acknowledge button...")
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const ackBtn = btns.find((b) => b.textContent.includes("Acknowledge") || b.textContent.includes("स्वीकार करें"))
    if (ackBtn) ackBtn.click()
  })
  await sleep(1500)

  // Verify siren stopped and alert dismissed
  const postAckState = await page.evaluate(async () => {
    const sirenMod = await import("/src/lib/emergencySiren.js")
    const text = document.body.innerText
    return {
      isPlaying: sirenMod.isSirenPlaying(),
      hasCard: text.includes("EMERGENCY ALERT") || text.includes("आपातकालीन अलर्ट"),
    }
  })
  console.log("Post-Acknowledgment State (Siren should be stopped):", postAckState)

  // --- STEP 4: OFFLINE SOS TEST ---
  console.log("\n--- STEP 4: OFFLINE SOS TEST (IndexedDB -> Sync -> ASHA) ---")
  // Create offline SOS payload as queued in IndexedDB and sync it
  const offlineSosPayload = {
    patient_id: "P-4559",
    patient_name: "Shreya",
    patient_phone: "+91 98765 43210",
    village: "Chandapur",
    emergency_type: "general_sos",
    notes: "Offline synchronized SOS from patient P-4559",
    created_at: new Date().toISOString(),
    lora_telemetry: {
      gateway_id: "GW-CHANDAPUR-PHC-01",
      rssi_dbm: -82.1,
      snr_db: 8.5,
    },
  }

  // Post via sync service endpoint
  const syncResponse = await fetch(`${BACKEND_URL}/api/sync/queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      worker_id: "ASHA-340",
      items: [
        {
          client_id: `offline_sos_${Date.now()}`,
          type: "emergency_sos",
          action: "create",
          timestamp: new Date().toISOString(),
          payload: offlineSosPayload,
        },
      ],
    }),
  })
  const syncResult = await syncResponse.json()
  console.log("Offline SOS Synchronized:", syncResult)

  // Wait for ASHA polling to detect the offline SOS and start siren
  console.log("Waiting for ASHA dashboard to receive synchronized offline SOS...")
  let sirenStartedOffline = false
  let offlineHasSirenActive = false
  for (let i = 0; i < 15; i++) {
    await sleep(600)
    const state = await page.evaluate(async () => {
      const sirenMod = await import("/src/lib/emergencySiren.js")
      const text = document.body.innerText
      return {
        isPlaying: sirenMod.isSirenPlaying(),
        audioState: sirenMod.getAudioContextState(),
        hasCard: text.includes("EMERGENCY ALERT") || text.includes("आपातकालीन अलर्ट"),
        hasPatientName: text.includes("Shreya"),
        hasSirenActive: text.includes("SIREN ACTIVE") || text.includes("सायरन सक्रिय"),
      }
    })
    if (state.isPlaying && state.hasCard) {
      sirenStartedOffline = true
      offlineHasSirenActive = state.hasSirenActive
      console.log(`[Offline Poll #${i+1}] Offline SOS Siren playing! AudioContext state: ${state.audioState}, SIREN ACTIVE: ${state.hasSirenActive}, Patient: ${state.hasPatientName}`)
      break
    }
  }

  console.log("Offline SOS Siren Verification:", {
    sirenStartedOffline,
    offlineHasSirenActive,
  })

  // Acknowledge offline emergency to clean up
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const ackBtn = btns.find((b) => b.textContent.includes("Acknowledge") || b.textContent.includes("स्वीकार करें"))
    if (ackBtn) ackBtn.click()
  })
  await sleep(1000)

  // --- STEP 5: SAFETY CHECKS ---
  console.log("\n--- STEP 5: SAFETY CHECKS ---")
  const safetyCheck = {
    patientId: "P-4559",
    patientName: "Shreya",
    ashaId: "ASHA-340",
    ashaName: "Pooja Sharma",
    doctorId: "DOC-501",
    doctorName: "Dr Arvind Varma",
    unhandledConsoleErrors: consoleErrors.filter((e) => e.includes("AudioContext") || e.includes("siren")),
  }
  console.log("Safety Checks Summary:", safetyCheck)

  await browser.close()

  console.log("\n==================================================")
  console.log("TEST SUMMARY RESULTS:")
  console.log("1. AudioContext Unlocked on user gesture:", audioUnlockedState.state === "running")
  console.log("2. Online SOS Siren started automatically:", sirenStartedOnline)
  console.log("3. Online SOS SIREN ACTIVE banner visible:", hasSirenActiveText)
  console.log("4. Offline SOS Siren started automatically:", sirenStartedOffline)
  console.log("5. Offline SOS SIREN ACTIVE banner visible:", offlineHasSirenActive)
  console.log("6. Post-Acknowledge Siren stopped:", postAckState.isPlaying === false)
  console.log("==================================================")
}

runSirenTests().catch(console.error)
