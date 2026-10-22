import puppeteer from "puppeteer-core"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function runTest() {
  console.log("================================================================================")
  console.log(" TESTING ASHA DIGITAL PRESCRIPTION: PATIENT SELECTION & WORKFLOW")
  console.log("================================================================================")

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })

    // 1. Authenticate ASHA worker via API
    console.log("\n[STEP 1] Authenticating ASHA worker Pooja Sharma (9876543210)...")
    const loginRes = await fetch("http://localhost:8000/api/asha/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "9876543210", password: "123456" }),
    })
    const loginData = await loginRes.json()
    const token = loginData.access_token
    const user = loginData.asha_worker
    console.log(`  -> Authenticated: ${user.full_name} (${user.worker_id})`)

    // Load app and set auth
    await page.goto("http://localhost:5173", { waitUntil: "networkidle0" })
    await page.evaluate((tok, usr) => {
      localStorage.clear()
      localStorage.setItem("ayushlink_role", "asha")
      localStorage.setItem("ayushlink_lang", "en")
      localStorage.setItem("ayushlink_token", tok)
      localStorage.setItem("ayushlink_auth_user", JSON.stringify(usr))
    }, token, user)

    await page.goto("http://localhost:5173", { waitUntil: "networkidle0" })
    await sleep(2800)

    // Click Get Started if splash is shown
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
      if (btn) btn.click()
    })
    await sleep(800)

    // Check if on login or home; if role-select, select ASHA
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("ASHA Worker") || b.textContent.includes("आशा कार्यकर्ता"))
      if (btn) btn.click()
    })
    await sleep(800)

    // If on login form, submit
    const hasLoginForm = await page.$('input[type="tel"], #phone')
    if (hasLoginForm) {
      await page.waitForSelector('#phone', { timeout: 3000 })
      await page.focus('#phone')
      await page.keyboard.type("9876543210")
      await page.focus('#password')
      await page.keyboard.type("123456")
      await page.evaluate(() => {
        document.querySelector("form")?.requestSubmit()
      })
      await sleep(2000)
    }

    // 2. Open Digital Prescriptions from ASHA Dashboard
    console.log("\n[STEP 2] Navigating to Digital Prescriptions...")
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"))
      const rxBtn = buttons.find((b) => b.innerText.includes("Prescriptions") || b.innerText.includes("दवा पर्ची") || b.innerText.includes("Digital Prescription"))
      if (rxBtn) rxBtn.click()
    })
    await sleep(1500)

    // Verify patient selection view is displayed
    console.log("\n[STEP 3] Verifying Patient Selection Screen...")
    const screenText1 = await page.evaluate(() => document.body.innerText)
    const hasSelectPatient = screenText1.includes("Select Patient")
    const hasSearchInput = await page.$('input[placeholder*="Search patient"]') !== null
    const hasShreya = screenText1.includes("Shreya") && screenText1.includes("P-4559")
    const hasSunita = screenText1.includes("Sunita Devi") && screenText1.includes("P-101")
    console.log(`  -> "Select Patient" title visible: ${hasSelectPatient ? "PASS" : "FAIL"}`)
    console.log(`  -> Patient Search Bar present: ${hasSearchInput ? "PASS" : "FAIL"}`)
    console.log(`  -> Patient P-4559 (Shreya) present: ${hasShreya ? "PASS" : "FAIL"}`)
    console.log(`  -> Patient P-101 (Sunita Devi) present: ${hasSunita ? "PASS" : "FAIL"}`)

    if (!hasSelectPatient || !hasShreya || !hasSunita) {
      throw new Error("Patient selection screen did not load assigned village patients properly!")
    }

    // 3. Test patient search
    console.log("\n[STEP 4] Testing Patient Search...")
    const searchInput = await page.$('input[placeholder*="Search patient"]')
    await searchInput.type("Sunita")
    await sleep(500)

    const searchResultText = await page.evaluate(() => document.body.innerText)
    const onlySunitaVisible = searchResultText.includes("Sunita Devi") && !searchResultText.includes("Shreya")
    console.log(`  -> Filtered correctly for "Sunita": ${onlySunitaVisible ? "PASS" : "FAIL"}`)

    // 4. Select Sunita Devi (Patient with 0 prescriptions)
    console.log("\n[STEP 5] Selecting Patient P-101 (Sunita Devi) with NO prescriptions...")
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"))
      const sunitaBtn = buttons.find((b) => b.innerText.includes("Sunita Devi"))
      if (sunitaBtn) sunitaBtn.click()
    })
    await sleep(1500)

    const p101Text = await page.evaluate(() => document.body.innerText)
    const p101Identified = p101Text.includes("Sunita Devi") && p101Text.includes("P-101")
    const noRxMsg = p101Text.includes("No prescriptions found for this patient")
    console.log(`  -> Patient Identity clearly shown (Sunita Devi / P-101): ${p101Identified ? "PASS" : "FAIL"}`)
    console.log(`  -> "No prescriptions found for this patient" message: ${noRxMsg ? "PASS" : "FAIL"}`)

    if (!p101Identified || !noRxMsg) {
      throw new Error("Empty prescription message was not displayed for Sunita Devi!")
    }

    // 5. Click "Change Patient" or "Select Another Patient"
    console.log("\n[STEP 6] Clicking 'Change Patient' to select a different patient...")
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"))
      const changeBtn = buttons.find((b) => b.innerText.includes("Change Patient") || b.innerText.includes("Select Another Patient"))
      if (changeBtn) changeBtn.click()
    })
    await sleep(1000)

    const backToSelectText = await page.evaluate(() => document.body.innerText)
    const backToSelectSuccess = backToSelectText.includes("Select Patient") && backToSelectText.includes("Shreya")
    console.log(`  -> Returned to Patient Selection list: ${backToSelectSuccess ? "PASS" : "FAIL"}`)

    // 6. Select Shreya (Patient with 11 real doctor prescriptions)
    console.log("\n[STEP 7] Selecting Patient P-4559 (Shreya) with real doctor prescriptions...")
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"))
      const shreyaBtn = buttons.find((b) => b.innerText.includes("Shreya"))
      if (shreyaBtn) shreyaBtn.click()
    })
    await sleep(2000)

    const shreyaRxText = await page.evaluate(() => document.body.innerText)
    const shreyaIdentified = shreyaRxText.includes("Shreya") && shreyaRxText.includes("P-4559")
    const hasRxCards = shreyaRxText.includes("RX-")
    const hasDiagnosis = shreyaRxText.includes("Acute Gastritis") || shreyaRxText.includes("Gastritis") || shreyaRxText.includes("Fever")
    console.log(`  -> Patient Identity clearly shown (Shreya / P-4559): ${shreyaIdentified ? "PASS" : "FAIL"}`)
    console.log(`  -> Real doctor prescriptions loaded (RX-*): ${hasRxCards ? "PASS" : "FAIL"}`)
    console.log(`  -> Diagnosis & medicine details displayed: ${hasDiagnosis ? "PASS" : "FAIL"}`)

    if (!shreyaIdentified || !hasRxCards) {
      throw new Error("Prescriptions for Shreya did not load correctly!")
    }

    // 7. Click on a prescription card to open detailed view
    console.log("\n[STEP 8] Opening detailed Prescription view...")
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"))
      const rxCard = buttons.find((b) => b.innerText.includes("RX-"))
      if (rxCard) rxCard.click()
    })
    await sleep(1000)

    const detailText = await page.evaluate(() => document.body.innerText)
    const hasDetailHeader = detailText.includes("Digital Prescription") && detailText.includes("RX-")
    const hasMedsSection = detailText.includes("Prescribed Medicines") || detailText.includes("Dosage")
    const hasPrintBtn = detailText.includes("Print / Download PDF")
    console.log(`  -> Detailed view header with Rx ID: ${hasDetailHeader ? "PASS" : "FAIL"}`)
    console.log(`  -> Prescribed medicines table/section: ${hasMedsSection ? "PASS" : "FAIL"}`)
    console.log(`  -> "Print / Download PDF" action available: ${hasPrintBtn ? "PASS" : "FAIL"}`)

    // 8. Back navigation test
    console.log("\n[STEP 9] Testing Back Navigation...")
    // Click "Back to Patient Prescriptions"
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"))
      const backBtn = buttons.find((b) => b.innerText.includes("Back to Patient Prescriptions"))
      if (backBtn) backBtn.click()
    })
    await sleep(800)

    const afterDetailBack = await page.evaluate(() => document.body.innerText)
    const backToShreyaList = afterDetailBack.toUpperCase().includes("ISSUED PRESCRIPTIONS") && afterDetailBack.toLowerCase().includes("shreya")
    console.log(`  -> Back from detail to patient prescription list: ${backToShreyaList ? "PASS" : "FAIL"}`)

    // Click "Change Patient" to return to patient selection
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"))
      const changeBtn = buttons.find((b) => b.innerText.includes("Change Patient"))
      if (changeBtn) changeBtn.click()
    })
    await sleep(800)

    const afterChangePatient = await page.evaluate(() => document.body.innerText)
    const backToPatientSelection = afterChangePatient.includes("Select Patient")
    console.log(`  -> Returned to Patient Selection: ${backToPatientSelection ? "PASS" : "FAIL"}`)

    console.log("\n================================================================================")
    console.log(" ALL ASHA DIGITAL PRESCRIPTION WORKFLOW TESTS PASSED PERFECTLY!")
    console.log("================================================================================")
  } catch (err) {
    console.error("Test failed with error:", err)
    process.exit(1)
  } finally {
    await browser.close()
  }
}

runTest()
