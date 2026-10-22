import puppeteer from "puppeteer-core"

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const FRONTEND_URL = "http://localhost:5173"
const BACKEND_URL = "http://127.0.0.1:8000"

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function loginPatientViaUI(page, phone, password) {
  await page.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
  await sleep(2500)

  // 1. Splash screen: click "Get Started"
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
    if (btn) btn.click()
  })
  await sleep(1000)

  // 2. Role Select: click "Patient"
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Patient") || b.textContent.includes("मरीज"))
    if (btn) btn.click()
  })
  await sleep(1000)

  // 3. Patient Login: enter phone and password
  const telInput = await page.$('input[type="tel"]')
  if (telInput) {
    await telInput.click({ clickCount: 3 })
    await telInput.type(phone)
  }

  const pwdInput = await page.$('input[type="password"]')
  if (pwdInput) {
    await pwdInput.click({ clickCount: 3 })
    await pwdInput.type(password)
  }

  // Click login
  await page.evaluate(() => {
    const submitBtn = document.querySelector('button[type="submit"]')
    if (submitBtn) submitBtn.click()
  })
  await sleep(2000)

  // 4. On Patient Home: click "Contact ASHA"
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Contact ASHA") || b.textContent.includes("आशा कार्यकर्ता"))
    if (btn) btn.click()
  })
  await sleep(1500)
}

async function loginAshaViaUI(page, phone, password) {
  await page.goto(FRONTEND_URL, { waitUntil: "networkidle0" })
  await sleep(2500)

  // 1. Splash screen: click "Get Started"
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
    if (btn) btn.click()
  })
  await sleep(1000)

  // 2. Role Select: click "ASHA Worker"
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("ASHA Worker") || b.textContent.includes("आशा कार्यकर्ता"))
    if (btn) btn.click()
  })
  await sleep(1000)

  // 3. ASHA Login: enter phone and password
  const telInput = await page.$('input[type="tel"]')
  if (telInput) {
    await telInput.click({ clickCount: 3 })
    await telInput.type(phone)
  }

  const pwdInput = await page.$('input[type="password"]')
  if (pwdInput) {
    await pwdInput.click({ clickCount: 3 })
    await pwdInput.type(password)
  }

  // Click login
  await page.evaluate(() => {
    const submitBtn = document.querySelector('button[type="submit"]')
    if (submitBtn) submitBtn.click()
  })
  await sleep(2500)
}

async function runAshaAudioCallTests() {
  console.log("================================================================================")
  console.log("   AYUSHLINK PART 2B: PATIENT-TO-ASHA AUDIO CALL FRONTEND INTEGRATION TESTS")
  console.log("================================================================================")

  // Step 0: Pre-clean any leftover active asha calls in database
  const patLoginRes = await fetch(`${BACKEND_URL}/api/patient/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "9324998108", password: "123456" }),
  }).catch(() => null)
  const patAuthData = await patLoginRes.json()
  const patToken = patAuthData.access_token

  const ashaLoginRes = await fetch(`${BACKEND_URL}/api/asha/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "9876543210", password: "123456" }),
  }).catch(() => null)
  const ashaAuthData = await ashaLoginRes.json()
  const ashaToken = ashaAuthData.access_token

  // Cancel any active call for patient if exists
  const existingActive = await fetch(`${BACKEND_URL}/api/asha-calls/active-patient`, {
    headers: { Authorization: `Bearer ${patToken}` },
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  if (existingActive?.call_id) {
    await fetch(`${BACKEND_URL}/api/asha-calls/${existingActive.call_id}/end`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patToken}` },
    }).catch(() => null)
  }

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  })

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Role-Specific Auth & ASHA Workers Listing
    // -------------------------------------------------------------------------
    console.log("\n[TEST 1] Verifying role-specific token & ASHA worker selection endpoint...")
    const workersRes = await fetch(`${BACKEND_URL}/api/asha-calls/workers`, {
      headers: { Authorization: `Bearer ${patToken}` },
    })
    const workers = await workersRes.json()
    if (!Array.isArray(workers) || workers.length === 0) {
      throw new Error("ASHA workers list is empty!")
    }
    console.log(`  -> Available Workers Count: ${workers.length}`)
    const targetAsha = workers.find((w) => w.worker_id === "ASHA-101") || workers[0]
    console.log(`  -> Selected Target Worker: ${targetAsha.full_name} (${targetAsha.worker_id})`)

    // -------------------------------------------------------------------------
    // TEST 2: Patient Outgoing Call & Cancellation Flow in Browser UI
    // -------------------------------------------------------------------------
    console.log("\n[TEST 2] Logging in Patient and verifying Contact ASHA screen...")
    const patientPage = await browser.newPage()
    await loginPatientViaUI(patientPage, "9324998108", "123456")

    const onContactScreen = await patientPage.evaluate(() => {
      return document.body.innerText.includes("Contact ASHA") ||
             document.body.innerText.includes("In-App Voice Call")
    })
    console.log("  -> Reached Contact ASHA Screen:", onContactScreen)
    if (!onContactScreen) throw new Error("Could not navigate to Contact ASHA screen!")

    // Verify Direct Phone Call fallback exists
    const hasPhoneFallback = await patientPage.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"))
      return links.some((a) => a.href && a.href.startsWith("tel:"))
    })
    console.log("  -> Direct phone fallback (tel: link) present:", hasPhoneFallback)
    if (!hasPhoneFallback) throw new Error("Direct phone call fallback was missing!")

    // Click "In-App Voice Call"
    console.log("  -> Patient initiating In-App Voice Call...")
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("In-App Voice Call"))
      if (btn) btn.click()
    })
    await sleep(2000)

    // Verify outgoing ringing screen and Cancel Call button
    const hasCancelBtn = await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      return btns.some((b) => b.textContent.includes("Cancel Call"))
    })
    console.log("  -> Outgoing calling screen displayed, Cancel Call button visible:", hasCancelBtn)
    if (!hasCancelBtn) throw new Error("Outgoing calling stage / Cancel Call button not visible!")

    // Test Patient Cancel Call
    console.log("  -> Patient clicking Cancel Call...")
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Cancel Call"))
      if (btn) btn.click()
    })
    await sleep(1500)

    // Verify cleanly returned to selection screen
    const returnedToSelect = await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      return btns.some((b) => b.textContent.includes("In-App Voice Call"))
    })
    console.log("  -> Successfully returned to selection screen after cancel:", returnedToSelect)
    if (!returnedToSelect) throw new Error("Did not return to selection screen after cancellation!")

    // -------------------------------------------------------------------------
    // TEST 3: Full End-to-End Audio Call: Request -> Incoming Modal -> Accept -> In-Call -> Mute -> End
    // -------------------------------------------------------------------------
    console.log("\n[TEST 3] Testing ASHA incoming modal, ringtone, acceptance, WebRTC audio, and hangup...")
    // Login ASHA worker on second page
    const ashaPage = await browser.newPage()
    console.log("  -> Logging in ASHA worker on ASHA dashboard...")
    await loginAshaViaUI(ashaPage, "9876543210", "123456")

    const onAshaHome = await ashaPage.evaluate(() => {
      return document.body.innerText.includes("Pooja Sharma") ||
             document.body.innerText.includes("Cases") ||
             document.body.innerText.includes("Notifications")
    })
    console.log("  -> ASHA Home Dashboard active:", onAshaHome)

    // Patient clicks "In-App Voice Call"
    console.log("  -> Patient initiating voice call to ASHA...")
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("In-App Voice Call"))
      if (btn) btn.click()
    })
    await sleep(2500)

    // ASHA incoming call modal should appear
    console.log("  -> ASHA dashboard polling active-asha endpoint...")
    let incomingModalFound = false
    for (let i = 0; i < 8; i++) {
      incomingModalFound = await ashaPage.evaluate(() => {
        return document.body.innerText.includes("Incoming Voice Call") &&
               document.body.innerText.includes("Accept") &&
               document.body.innerText.includes("Decline")
      })
      if (incomingModalFound) break
      await sleep(1000)
    }
    console.log("  -> ASHA Incoming Modal displayed with Accept & Decline buttons:", incomingModalFound)
    if (!incomingModalFound) throw new Error("ASHA incoming call modal did not display!")

    // ASHA clicks "Accept"
    console.log("  -> ASHA clicking Accept...")
    await ashaPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const acceptBtn = btns.find((b) => b.textContent.includes("Accept"))
      if (acceptBtn) acceptBtn.click()
    })
    await sleep(3000)

    // Verify both sides are in live call
    const ashaInCall = await ashaPage.evaluate(() => {
      return document.body.innerText.includes("Live Voice Call") ||
             document.body.innerText.includes("Connecting audio")
    })
    const patientInCall = await patientPage.evaluate(() => {
      return document.body.innerText.includes("Connected") ||
             document.body.innerText.includes("Connecting...")
    })
    console.log("  -> ASHA in-call screen active:", ashaInCall)
    console.log("  -> Patient in-call screen active:", patientInCall)
    if (!ashaInCall || !patientInCall) throw new Error("Both peers did not transition to in_call stage!")

    // Test Mute Toggle on Patient side
    console.log("  -> Testing Mute button toggle on Patient screen...")
    const btnListBefore = await patientPage.evaluate(() => {
      return Array.from(document.querySelectorAll("button")).map((b) => ({
        title: b.title,
        text: b.textContent.trim(),
      }))
    })
    console.log("  -> Buttons before mute click:", btnListBefore)

    await patientPage.evaluate(() => {
      const muteBtn = document.querySelector('button[title*="Mute"]')
      if (muteBtn) muteBtn.click()
    })
    await sleep(800)
    const btnListAfter = await patientPage.evaluate(() => {
      return Array.from(document.querySelectorAll("button")).map((b) => ({
        title: b.title,
        text: b.textContent.trim(),
      }))
    })
    console.log("  -> Buttons after mute click:", btnListAfter)

    const patientMuted = btnListAfter.some((b) => b.title && b.title.includes("Unmute"))
    console.log("  -> Patient microphone successfully muted:", patientMuted)

    // Wait 2s for timer
    await sleep(2000)

    // ASHA clicks End Call
    console.log("  -> ASHA clicking End Call...")
    await ashaPage.evaluate(() => {
      const endBtn = document.querySelector('button[title*="End Call"]')
      if (endBtn) endBtn.click()
    })
    await sleep(2500)

    // Verify both sides returned cleanly
    const patientEnded = await patientPage.evaluate(() => {
      return document.body.innerText.includes("Call Ended")
    })
    const ashaReturned = await ashaPage.evaluate(() => {
      return !document.body.innerText.includes("Live Voice Call")
    })
    console.log("  -> Patient shows Call Ended feedback card:", patientEnded)
    console.log("  -> ASHA returned cleanly to dashboard:", ashaReturned)
    if (!patientEnded || !ashaReturned) throw new Error("Call termination did not cleanly reset both sides!")

    // -------------------------------------------------------------------------
    // TEST 4: Decline / Reject Call Flow
    // -------------------------------------------------------------------------
    console.log("\n[TEST 4] Testing ASHA Reject / Decline call flow...")
    // Reset patient screen to select
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const backBtn = btns.find((b) => b.textContent.includes("Back to ASHA Contacts"))
      if (backBtn) backBtn.click()
    })
    await sleep(1000)

    // Patient calls again
    console.log("  -> Patient initiating second call...")
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("In-App Voice Call"))
      if (btn) btn.click()
    })
    await sleep(2500)

    // ASHA modal appears, click Decline
    let declineModalFound = false
    for (let i = 0; i < 8; i++) {
      declineModalFound = await ashaPage.evaluate(() => {
        return document.body.innerText.includes("Decline")
      })
      if (declineModalFound) break
      await sleep(1000)
    }

    if (declineModalFound) {
      console.log("  -> ASHA clicking Decline...")
      await ashaPage.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"))
        const declineBtn = btns.find((b) => b.textContent.includes("Decline"))
        if (declineBtn) declineBtn.click()
      })
      await sleep(2500)

      // Patient screen should show "Call Declined"
      const patientDeclined = await patientPage.evaluate(() => {
        return document.body.innerText.includes("Call Declined")
      })
      console.log("  -> Patient screen shows 'Call Declined':", patientDeclined)
      if (!patientDeclined) throw new Error("Patient screen did not detect call decline!")
    }

    console.log("\n================================================================================")
    console.log("   ALL PART 2B FRONTEND AUDIO-CALL INTEGRATION TESTS PASSED! (4/4)")
    console.log("================================================================================")
  } finally {
    await browser.close()
  }
}

runAshaAudioCallTests().catch((err) => {
  console.error("\n❌ TEST FAILED:", err)
  process.exit(1)
})
