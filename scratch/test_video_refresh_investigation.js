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

async function runInvestigation() {
  console.log("=== STARTING VIDEO CALL REFRESH INVESTIGATION ===")

  // Test with TWO SEPARATE BROWSER CONTEXTS (Incognito/Isolated)
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"],
  })

  try {
    // 1. Patient Context
    const patContext = await browser.createBrowserContext()
    const patPage = await patContext.newPage()

    // Log all network requests and console messages on patient page
    patPage.on("console", (msg) => console.log(`[PATIENT CONSOLE ${msg.type()}]:`, msg.text()))
    patPage.on("request", (req) => {
      if (req.url().includes("/consultations/")) {
        console.log(`[PATIENT REQ]: ${req.method()} ${req.url()}`)
      }
    })
    patPage.on("response", async (res) => {
      if (res.url().includes("/consultations/")) {
        let body = ""
        try { body = await res.text() } catch {}
        console.log(`[PATIENT RES]: ${res.status()} ${res.url()} -> ${body.slice(0, 100)}`)
      }
    })

    console.log("\n--- [Step 1] Patient logging in ---")
    await passSplashAndChooseRole(patPage, "patient")

    // Fill login form
    await patPage.focus('input[type="tel"]')
    await patPage.keyboard.type("9324998108")
    await patPage.focus('input[type="password"]')
    await patPage.keyboard.type("123456")
    await patPage.evaluate(() => {
      const form = document.querySelector("form")
      if (form) form.requestSubmit()
    })
    await sleep(2000)

    // Patient clicks "Talk to Doctor"
    console.log("\n--- [Step 2] Patient clicking 'Talk to Doctor' ---")
    await patPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Talk to Doctor") || b.textContent.includes("Video Consultation"))
      if (btn) btn.click()
    })
    await sleep(1500)

    // Check if on request screen or waiting
    const patScreen1 = await patPage.evaluate(() => document.body.innerText)
    console.log("Patient screen text preview:\n", patScreen1.slice(0, 300))

    // Click "Request Video Consultation"
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

    // 2. Doctor Context (separate context)
    console.log("\n--- [Step 4] Doctor logging in from separate context ---")
    const docContext = await browser.createBrowserContext()
    const docPage = await docContext.newPage()
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

    // Doctor sees request and clicks "Accept"
    console.log("\n--- [Step 5] Doctor accepting request ---")
    const docScreenText = await docPage.evaluate(() => document.body.innerText)
    console.log("Doctor dashboard has video request:", docScreenText.includes("Live Video Consultation") || docScreenText.includes("Accept"))

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

    // 3. Monitor Patient Page for 10 seconds WITHOUT refreshing!
    console.log("\n--- [Step 6] Monitoring Patient screen without refresh for 10s ---")
    for (let i = 1; i <= 5; i++) {
      await sleep(2000)
      const currentPatScreen = await patPage.evaluate(() => document.body.innerText)
      const hasAccepted = currentPatScreen.includes("Doctor accepted your request") || currentPatScreen.includes("Join Video Consultation")
      const stillWaiting = currentPatScreen.includes("Waiting for")
      console.log(`  [Time +${i * 2}s] hasAccepted=${hasAccepted}, stillWaiting=${stillWaiting}`)
    }

  } catch (err) {
    console.error("Investigation error:", err)
  } finally {
    await browser.close()
  }
}

runInvestigation()
