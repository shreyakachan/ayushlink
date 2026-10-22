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
    const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
    if (btn) btn.click()
  })
  await sleep(800)

  // Choose Role
  await page.evaluate((target) => {
    const btns = Array.from(document.querySelectorAll("button"))
    let roleBtn = null
    if (target === "doctor") {
      roleBtn = btns.find((b) => b.textContent.includes("Doctor") || b.textContent.includes("डॉक्टर"))
    } else if (target === "patient") {
      roleBtn = btns.find((b) => b.textContent.includes("Patient") || b.textContent.includes("मरीज"))
    }
    if (roleBtn) roleBtn.click()
  }, roleTarget)
  await sleep(800)
}

async function runInvestigationSameContext() {
  console.log("=== STARTING VIDEO CALL INVESTIGATION (SHARED SAME CONTEXT / TABS) ===")

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"],
  })

  try {
    // Both tabs share the default browser context (shared localStorage!)
    const patPage = await browser.newPage()

    patPage.on("console", (msg) => console.log(`[PATIENT CONSOLE ${msg.type()}]:`, msg.text()))
    patPage.on("request", (req) => {
      if (req.url().includes("/consultations/")) {
        console.log(`[PATIENT REQ]: ${req.method()} ${req.url()} (Auth: ${req.headers()["authorization"] ? req.headers()["authorization"].slice(0, 20) + "..." : "none"})`)
      }
    })
    patPage.on("response", async (res) => {
      if (res.url().includes("/consultations/")) {
        let body = ""
        try { body = await res.text() } catch {}
        console.log(`[PATIENT RES]: ${res.status()} ${res.url()} -> ${body.slice(0, 100)}`)
      }
    })

    console.log("\n--- [Step 1] Patient logging in in Tab 1 ---")
    await passSplashAndChooseRole(patPage, "patient")

    await patPage.focus('input[type="tel"]')
    await patPage.keyboard.type("9324998108")
    await patPage.focus('input[type="password"]')
    await patPage.keyboard.type("123456")
    await patPage.evaluate(() => {
      const form = document.querySelector("form")
      if (form) form.requestSubmit()
    })
    await sleep(2000)

    console.log("\n--- [Step 2] Patient clicking 'Talk to Doctor' ---")
    await patPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Talk to Doctor") || b.textContent.includes("Video Consultation"))
      if (btn) btn.click()
    })
    await sleep(1500)

    console.log("\n--- [Step 3] Patient clicks 'Request Video Consultation' ---")
    await patPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const reqBtn = btns.find((b) => b.textContent.includes("Request Video Consultation"))
      if (reqBtn) reqBtn.click()
    })
    await sleep(3000)

    const patScreenWaiting = await patPage.evaluate(() => document.body.innerText)
    const isWaiting = patScreenWaiting.includes("Video consultation request sent") || patScreenWaiting.includes("Waiting for")
    console.log("Patient is in waiting stage:", isWaiting)

    // Doctor logs in in Tab 2 (SHARED BROWSER CONTEXT!)
    console.log("\n--- [Step 4] Doctor logging in in Tab 2 (Shared localStorage) ---")
    const docPage = await browser.newPage()
    await passSplashAndChooseRole(docPage, "doctor")

    await docPage.focus('input[type="tel"]')
    await docPage.keyboard.type("9823000001")
    await docPage.focus('input[type="password"]')
    await docPage.keyboard.type("DoctorSecurePass123")
    await docPage.evaluate(() => {
      const form = document.querySelector("form")
      if (form) form.requestSubmit()
    })
    await sleep(3000)

    console.log("\n--- [Step 5] Doctor accepting request in Tab 2 ---")
    const acceptClicked = await docPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const acceptBtn = btns.find((b) => b.textContent.trim() === "Accept")
      if (acceptBtn) {
        acceptBtn.click()
        return true
      }
      return false
    })
    console.log("Doctor clicked Accept:", acceptClicked)
    await sleep(2000)

    console.log("\n--- [Step 6] Monitoring Patient Tab 1 for 10s WITHOUT refresh ---")
    for (let i = 1; i <= 5; i++) {
      await sleep(2000)
      const currentPatScreen = await patPage.evaluate(() => document.body.innerText)
      const hasAccepted = currentPatScreen.includes("Doctor accepted your request") || currentPatScreen.includes("Join Video Consultation")
      const stillWaiting = currentPatScreen.includes("Waiting for")
      console.log(`  [Time +${i * 2}s] hasAccepted=${hasAccepted}, stillWaiting=${stillWaiting}`)
    }

    // Now test what happens if user refreshes the patient page:
    console.log("\n--- [Step 7] User manually refreshes Tab 1 ---")
    await patPage.reload({ waitUntil: "networkidle0" })
    await sleep(3000)
    const afterReloadScreen = await patPage.evaluate(() => document.body.innerText)
    console.log("After reload screen text preview:\n", afterReloadScreen.slice(0, 300))

  } catch (err) {
    console.error("Investigation error:", err)
  } finally {
    await browser.close()
  }
}

runInvestigationSameContext()
