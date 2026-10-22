import puppeteer from "puppeteer-core"

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const FRONTEND_URL = "http://localhost:5173"

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function passSplashAndChooseRole(page, roleTarget) {
  await page.bringToFront()
  await page.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
  await sleep(2800)

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
    } else if (target === "patient") {
      roleBtn = btns.find((b) => b.textContent.includes("Patient") || b.textContent.includes("मरीज") || b.textContent.includes("रुग्ण"))
    }
    if (roleBtn) roleBtn.click()
  }, roleTarget)
  await sleep(800)
}

async function runTest() {
  console.log("================================================================================")
  console.log("   TESTING AYUSHLINK ASHA 5-SECOND CONTINUOUS HOLD & SOS DISPATCH")
  console.log("================================================================================")

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 420, height: 900 })

    // Track all emergency/sos requests
    const sosRequests = []
    page.on("request", (req) => {
      if (req.url().includes("/emergency/sos") && req.method() === "POST") {
        sosRequests.push({
          url: req.url(),
          postData: req.postData(),
          headers: req.headers(),
          timestamp: Date.now(),
        })
      }
    })

    // 1. Login as ASHA
    console.log("\n[Step 1] Logging into ASHA Worker portal...")
    await passSplashAndChooseRole(page, "asha")

    await page.focus('input[type="tel"]')
    await page.keyboard.type("9876543210")
    await sleep(100)
    await page.focus('input[type="password"]')
    await page.keyboard.type("123456")
    await sleep(100)

    await page.evaluate(() => {
      const form = document.querySelector("form")
      if (form) form.requestSubmit()
    })
    await sleep(2500)
    console.log("[OK] Successfully logged into ASHA dashboard.")

    // 2. Open Emergency SOS from ASHA dashboard
    console.log("\n[Step 2] Navigating to ASHA Emergency SOS screen...")
    const openedSos = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const sosCard = btns.find((b) => b.textContent.includes("Emergency SOS") || b.textContent.includes("आपातकालीन एसओएस"))
      if (sosCard) {
        sosCard.click()
        return true
      }
      return false
    })
    if (!openedSos) {
      throw new Error("Could not find Emergency SOS card on ASHA home screen")
    }
    await sleep(1000)

    // 3. Verify SOS Button is initially disabled when no patient is selected
    console.log("\n[Step 3] Verifying SOS button is disabled before patient selection...")
    const buttonStateInitial = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label*="SOS Disabled"], button[aria-label*="Emergency SOS"]')
      if (!btn) return { exists: false }
      return {
        exists: true,
        disabled: btn.disabled,
        text: btn.innerText.replace(/\s+/g, " ").trim(),
        hasDisabledAria: btn.getAttribute("aria-label")?.includes("Disabled"),
      }
    })
    console.log("Initial SOS button state:", buttonStateInitial)
    if (!buttonStateInitial.disabled) {
      throw new Error("SOS button should be disabled when no patient is selected!")
    }
    console.log("[PASS] SOS button is strictly disabled with 0 patients selected.")

    // Wait for patients to finish loading
    await page.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      return btns.some((b) => b.textContent.includes("Sunita Devi") || b.textContent.includes("P-101"))
    }, { timeout: 8000 })

    // 4. Select a specific patient from the registry (Sunita Devi, P-101)
    console.log("\n[Step 4] Selecting patient Sunita Devi (P-101) from assigned village registry...")
    const selectedPatientInfo = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const sunitaBtn = btns.find((b) => b.textContent.includes("Sunita Devi") || b.textContent.includes("P-101"))
      if (!sunitaBtn) return null
      sunitaBtn.click()
      return { text: sunitaBtn.innerText.replace(/\s+/g, " ").trim() }
    })
    console.log("Selected patient info:", selectedPatientInfo)
    if (!selectedPatientInfo) {
      throw new Error("No patient found in registry to select")
    }
    await sleep(600)

    // Verify selected card appears and button becomes enabled
    const buttonStateAfterSelection = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label*="Emergency SOS"], button[aria-label*="5 seconds"]')
      if (!btn) return { exists: false }
      return {
        exists: true,
        disabled: btn.disabled,
        text: btn.innerText.replace(/\s+/g, " ").trim(),
      }
    })
    console.log("Button state after selecting patient:", buttonStateAfterSelection)
    if (buttonStateAfterSelection.disabled) {
      throw new Error("SOS button should be enabled after patient is selected!")
    }
    console.log("[PASS] SOS button is enabled after patient selection.")

    // 5. TEST: Premature release (< 5s) cancels and does NOT send request
    console.log("\n[Step 5] Testing premature hold release (holding for ~2.0 seconds)...")
    const sosBtnHandle = await page.$('button[aria-label*="5 seconds"], button[aria-label*="Emergency SOS"]')
    const box = await sosBtnHandle.boundingBox()

    // Move mouse and press down
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await sleep(2000) // Hold for 2s

    // Check that button shows holding state
    const holdingState = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label*="seconds remaining"], button[aria-label*="Holding"]')
      return btn ? btn.getAttribute("aria-label") : "not found"
    })
    console.log("Progress at ~2.0s hold:", holdingState)

    // Release before 5 seconds
    await page.mouse.up()
    await sleep(800)

    // Verify 0 requests were sent
    console.log(`SOS requests sent after premature release: ${sosRequests.length}`)
    if (sosRequests.length !== 0) {
      throw new Error(`Premature release sent ${sosRequests.length} requests! Expected 0.`)
    }
    console.log("[PASS] Premature release canceled hold immediately; 0 requests sent.")

    // 6. TEST: Full 5-second hold triggers exactly ONE request
    console.log("\n[Step 6] Testing full 5-second continuous hold...")
    await page.mouse.down()
    
    // Hold continuously for 5.3 seconds
    console.log("Holding pointer down for 5.3 seconds...")
    await sleep(5300)
    await page.mouse.up()
    await sleep(1500) // Wait for API response

    console.log(`Total SOS requests captured: ${sosRequests.length}`)
    if (sosRequests.length !== 1) {
      throw new Error(`Expected exactly 1 SOS request after full hold, but got ${sosRequests.length}`)
    }

    const payloadSent = JSON.parse(sosRequests[0].postData)
    console.log("[OK] SOS Request Payload sent by ASHA screen:", payloadSent)

    if (!payloadSent.patient_id) {
      throw new Error("Request did not contain a valid patient_id!")
    }
    console.log(`[PASS] Full 5-second hold triggered exactly 1 request for patient ${payloadSent.patient_id} (${payloadSent.patient_name})`)

    // Verify success UI on screen
    const successResult = await page.evaluate(() => {
      const heading = document.querySelector("h3")
      const text = document.body.innerText
      const btns = Array.from(document.querySelectorAll("button")).map((b) => b.innerText.trim())
      return {
        heading: heading ? heading.innerText : null,
        hasAlertId: text.includes("Alert ID:"),
        hasStatus: text.includes("REGISTERED") || text.includes("Status:"),
        hasAmbulanceComing: text.includes("Ambulance is coming"),
        hasPhcInformed: text.includes("PHC has been informed"),
        hasPatientName: text.includes("Sunita Devi"),
        hasReturnBtn: btns.some((b) => b.includes("Return to Dashboard")),
        buttons: btns,
      }
    })
    console.log("Screen confirmation result:", successResult)
    if (!successResult.heading || !successResult.heading.includes("Emergency Alert Sent")) {
      throw new Error(`Heading expected 'Emergency Alert Sent', got '${successResult.heading}'`)
    }
    if (!successResult.hasAmbulanceComing) {
      throw new Error("Confirmation screen missing 'Ambulance is coming'")
    }
    if (!successResult.hasPhcInformed) {
      throw new Error("Confirmation screen missing 'PHC has been informed'")
    }
    if (!successResult.hasAlertId) {
      throw new Error("Screen did not display backend Alert ID confirmation")
    }
    if (!successResult.hasReturnBtn) {
      throw new Error("Screen missing 'Return to Dashboard' button")
    }
    console.log("[PASS] Actual backend response and confirmation requirements verified on screen.")

    // Test clicking 'Return to Dashboard'
    console.log("\n[Step 7] Testing Return to Dashboard button...")
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const returnBtn = btns.find((b) => b.innerText.includes("Return to Dashboard"))
      if (returnBtn) returnBtn.click()
    })
    await sleep(800)

    const returnedToDashboard = await page.evaluate(() => {
      const text = document.body.innerText
      return text.includes("Emergency SOS") || text.includes("Maternal & Child Health") || text.includes("ASHA")
    })
    if (!returnedToDashboard) {
      throw new Error("Failed to return to ASHA dashboard after clicking Return to Dashboard")
    }
    console.log("[PASS] Successfully returned to ASHA dashboard.")

    // Step 8: Re-open Emergency SOS and test 'New Emergency' button
    console.log("\n[Step 8] Testing 'New Emergency' reset workflow...")
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const sosCard = btns.find((b) => b.textContent.includes("Emergency SOS") || b.textContent.includes("आपातकालीन एसओएस"))
      if (sosCard) sosCard.click()
    })
    await sleep(800)

    // Select Sunita Devi again
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const sunitaBtn = btns.find((b) => b.textContent.includes("Sunita Devi") || b.textContent.includes("P-101"))
      if (sunitaBtn) sunitaBtn.click()
    })
    await sleep(500)

    // Perform 5-second hold
    await page.mouse.down()
    await sleep(5300)
    await page.mouse.up()
    await sleep(1500)

    // Click 'New Emergency'
    const clickedNewEmergency = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const newEmergencyBtn = btns.find((b) => b.innerText.includes("New Emergency"))
      if (newEmergencyBtn) {
        newEmergencyBtn.click()
        return true
      }
      return false
    })
    if (!clickedNewEmergency) {
      throw new Error("Could not find 'New Emergency' button on success screen")
    }
    await sleep(600)

    // Verify screen is reset: SOS button is disabled, patient selection is reset
    const resetState = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label*="SOS Disabled"]')
      const text = document.body.innerText
      return {
        hasDisabledButton: !!btn,
        showsRegistry: text.includes("Assigned Village Patients") || text.includes("Patient Selection Required"),
      }
    })
    console.log("State after clicking New Emergency:", resetState)
    if (!resetState.hasDisabledButton || !resetState.showsRegistry) {
      throw new Error("New Emergency did not properly reset selection and disable SOS button")
    }
    console.log("[PASS] 'New Emergency' successfully reset the emergency screen to initial safe state.")

    console.log("\n================================================================================")
    console.log("   [ALL ASHA 5-SECOND SOS TESTS PASSED SUCCESSFULLY]   ")
    console.log("================================================================================")
  } finally {
    await browser.close()
  }
}

runTest().catch((err) => {
  console.error("Test failed with error:", err)
  process.exit(1)
})
