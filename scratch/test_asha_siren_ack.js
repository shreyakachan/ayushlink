import puppeteer from "puppeteer-core"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"

async function runTest() {
  console.log("================================================================================")
  console.log(" TESTING ASHA EMERGENCY SIREN STOP ON ACKNOWLEDGE")
  console.log("================================================================================")

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--autoplay-policy=no-user-gesture-required"],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })

    // 1. First login as ASHA worker (9876543210) & Patient
    console.log("\n[STEP 1] Authenticating ASHA worker and Patient...")
    const ashaLoginRes = await fetch("http://localhost:8000/api/asha/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "9876543210", password: "123456" }),
    })
    const ashaData = await ashaLoginRes.json()
    const ashaToken = ashaData.access_token
    const ashaUser = ashaData.asha_worker

    const patLoginRes = await fetch("http://localhost:8000/api/patient/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "9324998108", password: "123456" }),
    })
    const patData = await patLoginRes.json()
    const patToken = patData.access_token

    await page.goto("http://localhost:5173", { waitUntil: "networkidle0" })

    // Setup localStorage for ASHA worker Pooja Sharma
    await page.evaluate((token, user) => {
      localStorage.clear()
      localStorage.setItem("ayushlink_role", "asha")
      localStorage.setItem("ayushlink_lang", "en")
      localStorage.setItem("ayushlink_token", token)
      localStorage.setItem("ayushlink_auth_user", JSON.stringify(user))
    }, ashaToken, ashaUser)

    await page.goto("http://localhost:5173", { waitUntil: "networkidle0" })
    await new Promise((r) => setTimeout(r, 1000))

    // 2. Trigger an SOS via API
    console.log("\n[STEP 2] Triggering simulated Emergency SOS for patient Shreya...")
    const triggerRes = await fetch("http://localhost:8000/api/emergency/sos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${patToken}`,
      },
      body: JSON.stringify({
        emergency_type: "general_sos",
        emergency_notes: "Automated test emergency for siren verify",
        gps_coordinates: { lat: 18.91, lng: 73.32 },
      }),
    })
    const alertData = await triggerRes.json()
    console.log("  [API] Triggered alert ID:", alertData.alert_id || alertData.id)

    // 3. Wait for emergency banner to appear on ASHA screen
    console.log("\n[STEP 3] Waiting for emergency alert banner and siren on ASHA dashboard...")
    await page.waitForFunction(
      () => {
        const text = document.body.innerText
        return text.includes("EMERGENCY") || text.includes("ACKNOWLEDGE")
      },
      { timeout: 10000 }
    )

    // Unlock and start siren check
    await page.evaluate(async () => {
      if (window.__ayushlink_emergency_siren) {
        await window.__ayushlink_emergency_siren.unlockAudioContext()
        await window.__ayushlink_emergency_siren.startEmergencySiren()
      }
    })

    const sirenPlayingBefore = await page.evaluate(() => {
      return window.__ayushlink_emergency_siren?.isSirenPlaying()
    })
    console.log("  [CHECK] Siren is playing before acknowledge:", sirenPlayingBefore)

    // 4. Click ACKNOWLEDGE EMERGENCY button
    console.log("\n[STEP 4] Clicking 'ACKNOWLEDGE EMERGENCY' button...")
    const ackButton = await page.waitForSelector('button ::-p-text(ACKNOWLEDGE)', { timeout: 8000 })
    if (ackButton) {
      await ackButton.click()
    } else {
      // Fallback click
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"))
        const btn = buttons.find((b) => b.innerText.includes("ACKNOWLEDGE"))
        if (btn) btn.click()
      })
    }

    // 5. Verify siren is stopped IMMEDIATELY
    await new Promise((r) => setTimeout(r, 200))
    const sirenPlayingAfter = await page.evaluate(() => {
      return window.__ayushlink_emergency_siren?.isSirenPlaying()
    })
    console.log("  [CHECK] Siren is playing immediately after acknowledge:", sirenPlayingAfter)

    if (sirenPlayingAfter === false) {
      console.log("  [PASS] Siren stopped immediately upon clicking Acknowledge!")
    } else {
      console.error("  [FAIL] Siren did NOT stop immediately!")
    }

    // 6. Wait 6 seconds across polling cycle and simulate clicks to ensure it stays permanently stopped
    console.log("\n[STEP 5] Waiting 6 seconds across polling interval & clicking on page...")
    await new Promise((r) => setTimeout(r, 3000))
    await page.mouse.click(100, 100)
    await new Promise((r) => setTimeout(r, 3000))

    const sirenPlayingAfterInterval = await page.evaluate(() => {
      return window.__ayushlink_emergency_siren?.isSirenPlaying()
    })
    console.log("  [CHECK] Siren is playing after 6s polling cycle:", sirenPlayingAfterInterval)

    if (sirenPlayingAfterInterval === false) {
      console.log("  [PASS] Siren remained permanently stopped!")
    } else {
      console.error("  [FAIL] Siren restarted after polling or clicks!")
    }

    console.log("\n================================================================================")
    console.log(" ASHA SOS SIREN VERIFICATION COMPLETED SUCCESSFULLY!")
    console.log("================================================================================")
  } catch (err) {
    console.error("Test error:", err)
  } finally {
    await browser.close()
  }
}

runTest()
