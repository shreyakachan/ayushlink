import puppeteer from "puppeteer-core"
import fs from "fs"

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"

async function run() {
  console.log("=== STARTING DIAGNOSTIC REPRODUCTION OF ACKNOWLEDGE BUTTON ===")
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })

  // Listen to ALL console logs and network events
  page.on("console", (msg) => {
    console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`)
  })

  page.on("request", (req) => {
    if (req.url().includes("/emergency/alerts")) {
      console.log(`[BROWSER NETWORK REQ] ${req.method()} ${req.url()}`)
      console.log(`  Headers:`, JSON.stringify(req.headers()))
      console.log(`  PostData:`, req.postData())
    }
  })

  page.on("response", async (res) => {
    if (res.url().includes("/emergency/alerts")) {
      let bodyText = ""
      try {
        bodyText = await res.text()
      } catch (e) {
        bodyText = `<could not read body: ${e.message}>`
      }
      console.log(`[BROWSER NETWORK RES] ${res.status()} ${res.url()}`)
      console.log(`  Body:`, bodyText)
    }
  })

  // 1. Patient Login and Trigger SOS
  console.log("\n[1] Patient Login as Shreya (9324998108)...")
  await page.goto("http://localhost:5173", { waitUntil: "networkidle0" })

  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: "networkidle0" })

  // Click Patient Role Card
  const patientCard = await page.waitForSelector('button ::-p-text(Patient)', { timeout: 5000 })
  await patientCard.click()
  await page.waitForNetworkIdle({ timeout: 3000 }).catch(() => {})

  // Enter phone & password
  const phoneInputs = await page.$$("input")
  if (phoneInputs.length >= 2) {
    await phoneInputs[0].type("9324998108")
    await phoneInputs[1].type("123456")
  }

  // Click Sign In
  const signInBtn = await page.waitForSelector('button ::-p-text(Sign in)', { timeout: 5000 })
  await signInBtn.click()
  await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {})

  // Navigate to SOS Screen
  const sosNavBtn = await page.waitForSelector('button ::-p-text(SOS)', { timeout: 5000 })
  await sosNavBtn.click()
  await page.waitForNetworkIdle({ timeout: 3000 }).catch(() => {})

  // Hold SOS Button for 5.2s
  console.log("[2] Holding SOS button for 5.2s...")
  const holdBtn = await page.waitForSelector('button ::-p-text(5 SECONDS)', { timeout: 5000 })
  const box = await holdBtn.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await new Promise((r) => setTimeout(r, 5300))
  await page.mouse.up()
  await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {})

  const sentBadge = await page.waitForSelector('::-p-text(✓ SOS SENT)', { timeout: 5000 })
  console.log("  -> Patient SOS triggered successfully.")

  // 2. ASHA Login as Pooja Sharma
  console.log("\n[3] Logging in as ASHA Pooja Sharma (9876543210)...")
  await page.goto("http://localhost:5173", { waitUntil: "networkidle0" })

  // Role select: ASHA
  const ashaCard = await page.waitForSelector('button ::-p-text(ASHA Worker)', { timeout: 5000 })
  await ashaCard.click()
  await page.waitForNetworkIdle({ timeout: 3000 }).catch(() => {})

  const ashaInputs = await page.$$("input")
  if (ashaInputs.length >= 2) {
    await ashaInputs[0].type("9876543210")
    await ashaInputs[1].type("AshaPassword123")
  }

  const ashaSignInBtn = await page.waitForSelector('button ::-p-text(Sign in)', { timeout: 5000 })
  await ashaSignInBtn.click()
  await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {})

  // Wait for Emergency Alert Card
  console.log("[4] Waiting for Emergency Alert Card in ASHA UI...")
  await page.waitForSelector('::-p-text(EMERGENCY ALERT)', { timeout: 8000 })
  console.log("  -> Emergency Alert Card is visible!")

  // Check the Acknowledge Button
  const ackBtn = await page.waitForSelector('button ::-p-text(ACKNOWLEDGE EMERGENCY)', { timeout: 5000 })
  console.log("  -> Found ACKNOWLEDGE EMERGENCY button. Preparing to click...")

  // Inspect DOM element properties before click
  const btnInfo = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const b = btns.find((el) => el.textContent.includes("ACKNOWLEDGE EMERGENCY"))
    if (!b) return null
    return {
      text: b.textContent,
      disabled: b.disabled,
      tagName: b.tagName,
      classes: b.className,
      hasOnClick: !!b.onclick,
    }
  })
  console.log("  -> Button info before click:", btnInfo)

  // Click the button!
  console.log("[5] CLICKING 'ACKNOWLEDGE EMERGENCY' BUTTON NOW...")
  await ackBtn.click()
  
  // Wait 3 seconds to observe network, console, and UI changes
  await new Promise((r) => setTimeout(r, 3000))

  // Inspect state after click
  const afterClickInfo = await page.evaluate(() => {
    const alertCard = document.querySelector('::-p-text(EMERGENCY ALERT)') || Array.from(document.querySelectorAll("h2, p, div")).find(el => el.textContent === "EMERGENCY ALERT")
    const btns = Array.from(document.querySelectorAll("button"))
    const b = btns.find((el) => el.textContent.includes("ACKNOWLEDGE EMERGENCY") || el.textContent.includes("Acknowledging..."))
    const acknowledgedBadge = Array.from(document.querySelectorAll("span, div")).find(el => el.textContent.includes("Emergency Acknowledged") || el.textContent.includes("Status: ASHA_ACKNOWLEDGED"))
    return {
      hasAlertCard: !!alertCard,
      hasAckButton: !!b,
      buttonText: b ? b.textContent : null,
      hasAcknowledgedBadge: !!acknowledgedBadge,
    }
  })
  console.log("  -> UI State after click:", afterClickInfo)

  await browser.close()
}

run().catch((err) => {
  console.error("DIAGNOSTIC TEST ERROR:", err)
  process.exit(1)
})
