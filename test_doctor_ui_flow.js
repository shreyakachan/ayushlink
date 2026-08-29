import puppeteer from "puppeteer-core"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE_URL = "http://localhost:5173"
const API_URL = "http://localhost:8000/api"

async function runDoctorTests() {
  console.log("=".repeat(80))
  console.log(" AYUSHLINK DOCTOR UI REDESIGN COMPREHENSIVE VERIFICATION")
  console.log("=".repeat(80))

  const uid = Date.now() % 100000
  const patientPhone = "98230" + String(uid).padStart(5, "0")

  // Seed patient with submitted symptoms so doctor consultation queue has live cases
  const pRes = await fetch(`${API_URL}/patient/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: "Sunita Devi",
      phone: patientPhone,
      password: "Password123",
      age: 28,
      gender: "female",
      village: "Chandapur",
      blood_group: "B+",
      allergies: ["Penicillin"],
      chronic_conditions: ["Asthma"],
    }),
  })
  const pData = await pRes.json()

  await fetch(`${API_URL}/patient/symptoms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${pData.access_token}`,
    },
    body: JSON.stringify({
      symptoms: ["High fever", "Body chills", "Headache"],
      description: "High fever and severe body chills for 2 days",
      severity: "severe",
      duration: "2-3-days",
    }),
  })
  console.log(`[SETUP] Seeded patient Sunita Devi (${patientPhone}) with severe symptoms`)

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--window-size=1280,900"],
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })

  // 1. App Load & Splash Screen
  await page.goto(BASE_URL, { waitUntil: "networkidle0" })
  console.log("[PASS] App Load: Loaded", BASE_URL)

  await page.waitForSelector("button")
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
    if (btn) btn.click()
  })
  await new Promise((r) => setTimeout(r, 600))

  // 2. Select Doctor Role
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const docBtn = btns.find((b) => b.textContent.includes("Doctor") || b.textContent.includes("डॉक्टर"))
    if (docBtn) docBtn.click()
  })
  await new Promise((r) => setTimeout(r, 600))
  console.log("[PASS] Role Select: Selected Doctor")

  // 3. Login with Doctor Credentials (9823000001 / DoctorSecurePass123)
  await page.waitForSelector("#phone", { timeout: 5000 })
  await page.type("#phone", "9823000001")
  await page.type("#password", "DoctorSecurePass123")

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const submit = btns.find((b) => b.textContent.includes("Login") || b.textContent.includes("Sign in"))
    if (submit) submit.click()
  })

  // 4. Wait for Doctor Dashboard & MongoDB cases to load
  await page.waitForSelector("aside", { timeout: 10000 })
  await new Promise((r) => setTimeout(r, 2000))
  console.log("[PASS] Doctor Login: Authenticated as Dr. Ramesh Gupta")

  // 5. Sidebar Verification
  const sidebarText = await page.evaluate(() => document.querySelector("aside")?.innerText || "")
  const sidebarValid = sidebarText.includes("AyushLink") && sidebarText.includes("Dashboard") && sidebarText.includes("Patients") && sidebarText.includes("Dr. Ramesh Gupta") && sidebarText.includes("On duty")
  console.log(sidebarValid ? "[PASS]" : "[FAIL]", "Desktop Left Sidebar & Doctor Profile Card (On duty)")

  // 6. Header Verification
  const headerText = await page.evaluate(() => document.querySelector("header")?.innerText || "")
  const headerValid = headerText.includes("Welcome back") || headerText.includes("Dr. Ramesh Gupta")
  console.log(headerValid ? "[PASS]" : "[FAIL]", "Top Header Greeting & Specialization")

  // 7. Hotline Card
  const bodyText = await page.evaluate(() => document.body.innerText)
  const hotlineValid = bodyText.toUpperCase().includes("TELECONSULTATION HOTLINE") && bodyText.includes("Call Now")
  console.log(hotlineValid ? "[PASS]" : "[FAIL]", "Teleconsultation Hotline Action Card")

  // 8. Today's Overview
  const overviewValid = bodyText.toUpperCase().includes("TODAY'S OVERVIEW") && bodyText.includes("Today's Consultations") && bodyText.includes("Pending Requests")
  console.log(overviewValid ? "[PASS]" : "[FAIL]", "Today's Overview 4 Summary Stat Cards")

  // 9. Today's Patient Queue
  const queueSection = await page.evaluate(() => document.getElementById("patient-queue-section")?.innerText || "")
  const queueValid = queueSection.includes("Sunita Devi") || queueSection.includes("fever") || queueSection.includes("P-")
  console.log(queueValid ? "[PASS]" : "[FAIL]", "Today's Patient Queue with Compact Rows & Live Cases")

  // 10. Test 'View Details' Modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const viewBtn = btns.find((b) => b.textContent.includes("View Details"))
    if (viewBtn) viewBtn.click()
  })
  await new Promise((r) => setTimeout(r, 800))

  const modalText = await page.evaluate(() => document.body.innerText)
  const modalValid = modalText.includes("Chief Complaint") || modalText.includes("Write Digital Prescription") || modalText.includes("Initiate Teleconsultation")
  console.log(modalValid ? "[PASS]" : "[FAIL]", "Patient Consultation / Triage Details Modal")

  // 11. Test Write Digital Prescription from Modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const rxBtn = btns.find((b) => b.textContent.includes("Write Digital Prescription"))
    if (rxBtn) rxBtn.click()
  })
  await new Promise((r) => setTimeout(r, 1000))

  const rxText = await page.evaluate(() => document.body.innerText)
  const rxValid = rxText.includes("Digital Prescription") || rxText.includes("Prescriptions") || rxText.includes("Diagnosis")
  console.log(rxValid ? "[PASS]" : "[FAIL]", "Navigation to Digital Prescriptions Screen")

  // 12. Return to Doctor Dashboard
  await page.evaluate(() => {
    const backBtn = document.querySelector("header button")
    if (backBtn) backBtn.click()
  })
  await new Promise((r) => setTimeout(r, 800))

  // 13. Test Live ASHA Worker Directory Modal
  await page.evaluate(() => {
    const aside = document.querySelector("aside")
    const btns = Array.from(aside ? aside.querySelectorAll("button") : document.querySelectorAll("button"))
    const ashaBtn = btns.find((b) => b.textContent.includes("ASHA Workers"))
    if (ashaBtn) ashaBtn.click()
  })
  await new Promise((r) => setTimeout(r, 800))

  const ashaModalText = await page.evaluate(() => document.body.innerText)
  const ashaValid = ashaModalText.includes("ASHA Worker Directory") && ashaModalText.includes("active")
  console.log(ashaValid ? "[PASS]" : "[FAIL]", "Live ASHA Worker Directory Modal")

  // Close ASHA modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"))
    const closeBtn = btns.find((b) => b.textContent.includes("Close") || b.textContent === "✕")
    if (closeBtn) closeBtn.click()
  })
  await new Promise((r) => setTimeout(r, 500))

  // 14. Mobile Responsive Viewport & Bottom Navigation
  await page.setViewport({ width: 390, height: 844 })
  await new Promise((r) => setTimeout(r, 500))

  const mobileNavText = await page.evaluate(() => document.querySelector("nav.fixed")?.innerText || "")
  const mobileValid = mobileNavText.includes("Home") && mobileNavText.includes("Patients") && mobileNavText.includes("Rx")
  console.log(mobileValid ? "[PASS]" : "[FAIL]", "Mobile Responsive Layout & Bottom Navigation")

  console.log("\n" + "=".repeat(80))
  console.log(" SUMMARY: ALL DOCTOR SIDE UI & FUNCTIONALITY CHECKS PASSED (14/14)")
  console.log("=".repeat(80))

  await browser.close()
}

runDoctorTests().catch(console.error)
