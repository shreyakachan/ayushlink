import puppeteer from "puppeteer-core"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function runTest() {
  console.log("================================================================================")
  console.log(" TESTING REAL PATIENT SOS TRIGGERED FROM UI -> ASHA DASHBOARD SIREN")
  console.log("================================================================================")

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--autoplay-policy=no-user-gesture-required"],
  })

  try {
    // 1. Context 1: ASHA Worker Dashboard (Pooja Sharma)
    const ashaContext = await browser.createBrowserContext()
    const ashaPage = await ashaContext.newPage()
    await ashaPage.setViewport({ width: 1280, height: 800 })

    console.log("\n[STEP 1] Navigating to ASHA Dashboard and logging in...")
    await ashaPage.goto("http://localhost:5173", { waitUntil: "networkidle0" })
    await sleep(2800)

    // Click Get Started
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
      if (btn) btn.click()
    })
    await sleep(800)

    // Click ASHA Worker
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("ASHA Worker") || b.textContent.includes("आशा कार्यकर्ता"))
      if (btn) btn.click()
    })
    await sleep(800)

    // Fill login
    await ashaPage.waitForSelector('#phone', { timeout: 10000 })
    await ashaPage.focus('#phone')
    await ashaPage.keyboard.type("9876543210")
    await ashaPage.focus('#password')
    await ashaPage.keyboard.type("123456")
    await ashaPage.evaluate(() => {
      document.querySelector("form")?.requestSubmit()
    })
    await sleep(2500)

    // Unlock audio context on ASHA dashboard
    await ashaPage.click("header, main")
    await sleep(500)

    const ashaDashboardText = await ashaPage.evaluate(() => document.body.innerText)
    console.log("  -> ASHA loaded:", ashaDashboardText.includes("Pooja Sharma") ? "PASS (Pooja Sharma)" : "FAIL")

    // 2. Context 2: Patient Portal (Shreya)
    const patientContext = await browser.createBrowserContext()
    const patientPage = await patientContext.newPage()
    await patientPage.setViewport({ width: 1280, height: 800 })

    console.log("\n[STEP 2] Navigating to Patient Portal and logging in...")
    await patientPage.goto("http://localhost:5173", { waitUntil: "networkidle0" })
    await sleep(2800)

    // Click Get Started
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
      if (btn) btn.click()
    })
    await sleep(800)

    // Click Patient
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Patient") || b.textContent.includes("मरीज़"))
      if (btn) btn.click()
    })
    await sleep(500)

    // Fill patient login (9324998108 / 123456)
    await patientPage.waitForSelector('#patient-phone', { timeout: 10000 })
    await patientPage.focus('#patient-phone')
    await patientPage.keyboard.type("9324998108")
    await patientPage.focus('#patient-password')
    await patientPage.keyboard.type("123456")
    await patientPage.evaluate(() => {
      document.querySelector("form")?.requestSubmit()
    })
    await sleep(2000)

    const patientHomeText = await patientPage.evaluate(() => document.body.innerText)
    console.log("  -> Patient Home loaded:", patientHomeText.includes("Shreya") ? "PASS (Shreya)" : "FAIL")

    // 3. Open Emergency SOS on Patient Home
    console.log("\n[STEP 3] Opening Emergency SOS Screen from Patient Home...")
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const sosBtn = btns.find((b) => b.textContent.includes("EMERGENCY") || b.textContent.includes("SOS"))
      if (sosBtn) sosBtn.click()
    })
    await sleep(1000)

    const sosScreenText = await patientPage.evaluate(() => document.body.innerText)
    console.log("  -> Emergency SOS Screen loaded:", sosScreenText.includes("HOLD FOR 5 SECONDS") || sosScreenText.includes("Hold") ? "PASS" : "FAIL")

    // 4. Trigger 5-second hold on Patient SOS screen
    console.log("\n[STEP 4] Executing 5-second hold on Emergency SOS screen...")
    const holdBtn = await patientPage.waitForSelector('button ::-p-text(HOLD FOR 5 SECONDS)', { timeout: 5000 })
      || await patientPage.waitForSelector('button ::-p-text(SECONDS)', { timeout: 5000 })
    
    const boundingBox = await holdBtn.boundingBox()
    console.log("  -> SOS Button bounding box:", boundingBox)

    await patientPage.mouse.move(boundingBox.x + boundingBox.width / 2, boundingBox.y + boundingBox.height / 2)
    await patientPage.mouse.down()
    console.log("  -> Mouse down started, waiting 5.5 seconds...")
    await sleep(5500)
    await patientPage.mouse.up()
    console.log("  -> Mouse up released")

    // Wait for LoRa simulation / API to complete
    await sleep(4000)
    const afterHoldText = await patientPage.evaluate(() => document.body.innerText)
    console.log("  -> Patient SOS screen status after hold:", afterHoldText.slice(0, 300).replace(/\n+/g, " "))

    // 5. Inspect ASHA Dashboard for Siren and Incoming Emergency
    console.log("\n[STEP 5] Checking ASHA Worker Dashboard in Tab 1...")
    let sirenDetected = false
    let bannerDetected = false

    for (let i = 0; i < 15; i++) {
      await sleep(1000)
      const ashaState = await ashaPage.evaluate(() => {
        const text = document.body.innerText
        const s = window.__ayushlink_emergency_siren
        return {
          hasEmergencyBanner: text.includes("EMERGENCY ALERT") || text.includes("आपातकालीन अलर्ट") || text.includes("SIREN ACTIVE"),
          hasShreya: text.includes("Shreya"),
          isSirenPlaying: s ? s.isSirenPlaying() : false,
          audioContextState: s ? s.getAudioContextState() : "unknown",
        }
      })
      console.log(`  -> Poll #${i + 1}: Banner=${ashaState.hasEmergencyBanner}, Shreya=${ashaState.hasShreya}, SirenPlaying=${ashaState.isSirenPlaying}, Audio=${ashaState.audioContextState}`)
      if (ashaState.isSirenPlaying && ashaState.hasEmergencyBanner) {
        sirenDetected = true
        bannerDetected = true
        break
      }
    }

    console.log("\n================================================================================")
    console.log(` RESULT: Banner Detected: ${bannerDetected ? "PASS" : "FAIL"} | Siren Playing: ${sirenDetected ? "PASS" : "FAIL"}`)
    console.log("================================================================================")
  } catch (err) {
    console.error("Test error:", err)
  } finally {
    await browser.close()
  }
}

runTest()
