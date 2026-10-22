import puppeteer from "puppeteer-core"
import { execSync } from "child_process"

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

async function run() {
  console.log("Cleaning database first...")
  execSync("python backend/scratch/clean_all_consultations.py", { stdio: "inherit" })

  console.log("\n=== TESTING SHARED TAB ENVIRONMENT (SAME BROWSER / SHARED LOCALSTORAGE) ===")
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"],
  })

  try {
    const patPage = await browser.newPage()

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
        console.log(`[PATIENT RES]: ${res.status()} ${res.url()} -> ${body.slice(0, 120)}`)
      }
    })

    console.log("\n[1] Patient login...")
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

    console.log("\n[2] Patient clicks 'Talk to Doctor'...")
    await patPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Talk to Doctor") || b.textContent.includes("Video Consultation"))
      if (btn) btn.click()
    })
    await sleep(2000)

    console.log("\n[3] Patient submits request...")
    const reqClicked = await patPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const reqBtn = btns.find((b) => b.textContent.includes("Request Video Consultation"))
      if (reqBtn) {
        reqBtn.click()
        return true
      }
      return false
    })
    console.log("  -> Request button clicked:", reqClicked)
    await sleep(2500)

    const patWaitingText = await patPage.evaluate(() => document.body.innerText)
    console.log("  -> Patient is waiting:", patWaitingText.includes("Video consultation request sent") || patWaitingText.includes("Waiting for"))

    console.log("\n[4] Opening Doctor in Tab 2 (shares localStorage)...")
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

    console.log("\n[5] Doctor accepting video request...")
    const docAcceptClicked = await docPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const acceptBtn = btns.find((b) => b.textContent.trim() === "Accept")
      if (acceptBtn) {
        acceptBtn.click()
        return true
      }
      return false
    })
    console.log("  -> Doctor clicked Accept:", docAcceptClicked)
    await sleep(2000)

    console.log("\n[6] Now observe Patient Tab 1 for 10 seconds WITHOUT refreshing...")
    for (let i = 1; i <= 5; i++) {
      await sleep(2000)
      const text = await patPage.evaluate(() => document.body.innerText)
      const hasAccepted = text.includes("Doctor accepted your request") || text.includes("Join Video Consultation")
      const stillWaiting = text.includes("Waiting for")
      console.log(`  [Time +${i * 2}s] hasAccepted=${hasAccepted}, stillWaiting=${stillWaiting}`)
    }

  } catch (err) {
    console.error("Test error:", err)
  } finally {
    await browser.close()
  }
}

run()
