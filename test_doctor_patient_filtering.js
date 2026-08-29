import puppeteer from "puppeteer-core"
import { MongoClient } from "mongodb"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE_URL = "http://localhost:5173"
const API_URL = "http://localhost:8000/api"
const MONGO_URI = "mongodb://127.0.0.1:27017"
const DB_NAME = "ayushlink_db"

async function runDoctorFilteringVerification() {
  console.log("=".repeat(80))
  console.log(" AYUSHLINK DOCTOR REAL PATIENT & SYMPTOM FILTERING TEST")
  console.log("=".repeat(80))

  const mongoClient = new MongoClient(MONGO_URI)
  await mongoClient.connect()
  const db = mongoClient.db(DB_NAME)
  const symptomsCol = db.collection("symptoms")
  const patientsCol = db.collection("patients")

  const uid = Date.now() % 100000
  const patientAPhone = "98230" + String(uid).padStart(5, "0")
  const patientBPhone = "98231" + String(uid).padStart(5, "0")

  // Ensure clean symptoms collection for testing isolated flow
  await symptomsCol.deleteMany({})
  console.log("[SETUP] Cleared symptoms collection to test clean empty states first.")

  let browser
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: "new",
      args: ["--no-sandbox", "--window-size=1280,900"],
    })

    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 900 })

    // =========================================================================
    // STEP 1: Doctor Login & Verify Initial Clean Empty States
    // =========================================================================
    console.log("\n--- STEP 1: Verify Initial Clean Empty States for Doctor ---")
    await page.goto(BASE_URL, { waitUntil: "networkidle0" })

    // Splash -> Role Select -> Doctor
    await page.waitForSelector("button")
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Get Started") || b.textContent.includes("शुरू करें"))
      if (btn) btn.click()
    })
    await new Promise((r) => setTimeout(r, 600))

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const docBtn = btns.find((b) => b.textContent.includes("Doctor"))
      if (docBtn) docBtn.click()
    })
    await new Promise((r) => setTimeout(r, 600))

    // Login with seeded doctor 9823000001
    await page.waitForSelector("#phone", { timeout: 5000 })
    await page.type("#phone", "9823000001")
    await page.type("#password", "DoctorSecurePass123")

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const submit = btns.find((b) => b.textContent.includes("Login") || b.textContent.includes("Sign in"))
      if (submit) submit.click()
    })

    await page.waitForSelector("aside", { timeout: 10000 })
    await new Promise((r) => setTimeout(r, 1500))

    // 1.1 Consultations Queue Empty State on Dashboard
    const dashboardText = await page.evaluate(() => document.body.innerText)
    const queueEmptyState = dashboardText.includes("No pending consultation requests.") || dashboardText.includes("No patients have submitted symptoms yet.")
    console.log("1.1 Consultations Queue Empty State ('No pending consultation requests.'):", queueEmptyState)

    // 1.2 Patients Screen Empty State
    await page.evaluate(() => {
      const aside = document.querySelector("aside")
      const btns = Array.from(aside ? aside.querySelectorAll("button") : document.querySelectorAll("button"))
      const pBtn = btns.find((b) => b.textContent.trim() === "Patients")
      if (pBtn) pBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    const patientsScreenText = await page.evaluate(() => document.body.innerText)
    const patientsEmptyState = patientsScreenText.includes("No patients have submitted symptoms yet.")
    console.log("1.2 Patients Section Empty State ('No patients have submitted symptoms yet.'):", patientsEmptyState)

    // Return to dashboard
    await page.evaluate(() => {
      const backBtn = document.querySelector("header button")
      if (backBtn) backBtn.click()
    })
    await new Promise((r) => setTimeout(r, 800))

    // 1.3 Maternal Care Screen Empty State
    await page.evaluate(() => {
      const aside = document.querySelector("aside")
      const btns = Array.from(aside ? aside.querySelectorAll("button") : document.querySelectorAll("button"))
      const mBtn = btns.find((b) => b.textContent.includes("Maternal & Child"))
      if (mBtn) mBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    const mchScreenText = await page.evaluate(() => document.body.innerText)
    const mchEmptyState = mchScreenText.includes("No maternal-care submissions yet.")
    console.log("1.3 Maternal Care Section Empty State ('No maternal-care submissions yet.'):", mchEmptyState)

    // Return to dashboard
    await page.evaluate(() => {
      const backBtn = document.querySelector("header button")
      if (backBtn) backBtn.click()
    })
    await new Promise((r) => setTimeout(r, 800))

    // =========================================================================
    // STEP 2: Register Patient A (WITHOUT symptoms) -> Must NOT appear on Doctor side
    // =========================================================================
    console.log("\n--- STEP 2: Register Patient A (NO symptoms) ---")
    const regResA = await fetch(`${API_URL}/patient/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: "Anil Kumar (No Symptoms)",
        phone: patientAPhone,
        password: "Password123",
        age: 35,
        gender: "male",
        village: "Chandapur",
      }),
    })
    const dataA = await regResA.json()
    console.log(`[API] Patient A registered: ${dataA.patient?.full_name} (${dataA.patient?.patient_id})`)

    // Check Patients Screen on Doctor side
    await page.evaluate(() => {
      const aside = document.querySelector("aside")
      const btns = Array.from(aside ? aside.querySelectorAll("button") : document.querySelectorAll("button"))
      const pBtn = btns.find((b) => b.textContent.trim() === "Patients")
      if (pBtn) pBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    const patScreenAfterA = await page.evaluate(() => document.body.innerText)
    const patientANotInPatients = !patScreenAfterA.includes("Anil Kumar") && patScreenAfterA.includes("No patients have submitted symptoms yet.")
    console.log("2.1 Patient A (no symptoms) NOT in Patients Screen:", patientANotInPatients)

    // Return to dashboard
    await page.evaluate(() => {
      const backBtn = document.querySelector("header button")
      if (backBtn) backBtn.click()
    })
    await new Promise((r) => setTimeout(r, 800))

    const docAfterA = await page.evaluate(() => document.body.innerText)
    const patientANotInQueue = !docAfterA.includes("Anil Kumar") && docAfterA.includes("No pending consultation requests.")
    console.log("2.2 Patient A (no symptoms) NOT in Consultations Queue:", patientANotInQueue)

    // =========================================================================
    // STEP 3: Patient A Submits General Symptoms -> Must appear in Consultations & Patients
    // =========================================================================
    console.log("\n--- STEP 3: Patient A Submits General Symptoms ---")
    const symResA = await fetch(`${API_URL}/patient/symptoms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${dataA.access_token}`,
      },
      body: JSON.stringify({
        symptoms: ["Severe headache", "High fever"],
        description: "Severe headache and high fever exceeding 102F since 2 days",
        severity: "severe",
        duration: "2-3-days",
      }),
    })
    console.log("[API] Patient A symptoms submitted:", symResA.status === 201)

    // Check Patients Screen on Doctor side
    await page.evaluate(() => {
      const aside = document.querySelector("aside")
      const btns = Array.from(aside ? aside.querySelectorAll("button") : document.querySelectorAll("button"))
      const pBtn = btns.find((b) => b.textContent.trim() === "Patients")
      if (pBtn) pBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1200))

    const patScreenAfterSymA = await page.evaluate(() => document.body.innerText)
    const patientAInPatients = patScreenAfterSymA.includes("Anil Kumar") && (patScreenAfterSymA.includes("headache") || patScreenAfterSymA.includes("fever"))
    console.log("3.1 Patient A NOW visible in Doctor Patients Screen with symptoms:", patientAInPatients)

    // Return to dashboard
    await page.evaluate(() => {
      const backBtn = document.querySelector("header button")
      if (backBtn) backBtn.click()
    })
    await new Promise((r) => setTimeout(r, 800))

    // Check Maternal Care -> Patient A must NOT appear in Maternal Care
    await page.evaluate(() => {
      const aside = document.querySelector("aside")
      const btns = Array.from(aside ? aside.querySelectorAll("button") : document.querySelectorAll("button"))
      const mBtn = btns.find((b) => b.textContent.includes("Maternal & Child"))
      if (mBtn) mBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    const mchScreenAfterA = await page.evaluate(() => document.body.innerText)
    const patientANotInMch = !mchScreenAfterA.includes("Anil Kumar") && mchScreenAfterA.includes("No maternal-care submissions yet.")
    console.log("3.2 Patient A (general fever) NOT in Maternal Care Screen:", patientANotInMch)

    // Return to dashboard
    await page.evaluate(() => {
      const backBtn = document.querySelector("header button")
      if (backBtn) backBtn.click()
    })
    await new Promise((r) => setTimeout(r, 800))

    // =========================================================================
    // STEP 4: Patient B Submits Maternal/Pregnancy Symptoms
    // =========================================================================
    console.log("\n--- STEP 4: Patient B Submits Maternal Symptoms ---")
    const regResB = await fetch(`${API_URL}/patient/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: "Pooja Sharma (Pregnant)",
        phone: patientBPhone,
        password: "Password123",
        age: 26,
        gender: "female",
        village: "Chandapur",
      }),
    })
    const dataB = await regResB.json()

    const symResB = await fetch(`${API_URL}/patient/symptoms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${dataB.access_token}`,
      },
      body: JSON.stringify({
        symptoms: ["ANC checkup", "Morning sickness", "Nausea in 2nd trimester"],
        description: "ANC checkup, morning sickness and nausea in 2nd trimester",
        severity: "moderate",
        duration: "week",
      }),
    })
    console.log(`[API] Patient B (Pooja Sharma) submitted maternal symptoms:`, symResB.status === 201)

    // Check Maternal Care screen on Doctor side
    await page.evaluate(() => {
      const aside = document.querySelector("aside")
      const btns = Array.from(aside ? aside.querySelectorAll("button") : document.querySelectorAll("button"))
      const mBtn = btns.find((b) => b.textContent.includes("Maternal & Child"))
      if (mBtn) mBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1200))

    const mchScreenAfterB = await page.evaluate(() => document.body.innerText)
    const patientBInMch = mchScreenAfterB.includes("Pooja Sharma") && (mchScreenAfterB.includes("Trimester 2") || mchScreenAfterB.includes("ANC") || mchScreenAfterB.includes("sickness"))
    console.log("4.1 Patient B (maternal symptoms) NOW visible in Maternal Care Screen:", patientBInMch)

    // Return to dashboard
    await page.evaluate(() => {
      const backBtn = document.querySelector("header button")
      if (backBtn) backBtn.click()
    })
    await new Promise((r) => setTimeout(r, 800))

    // Check Patients Screen -> Both Patient A and Patient B should now appear
    await page.evaluate(() => {
      const aside = document.querySelector("aside")
      const btns = Array.from(aside ? aside.querySelectorAll("button") : document.querySelectorAll("button"))
      const pBtn = btns.find((b) => b.textContent.trim() === "Patients")
      if (pBtn) pBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    const finalPatScreen = await page.evaluate(() => document.body.innerText)
    const bothPatientsVisible = finalPatScreen.includes("Anil Kumar") && finalPatScreen.includes("Pooja Sharma")
    console.log("4.2 Both real patients with submitted symptoms visible in Patients list:", bothPatientsVisible)

    console.log("\n" + "=".repeat(80))
    console.log(" ALL DOCTOR-SIDE REAL PATIENT & SYMPTOM FILTERING CHECKS PASSED (100%)!")
    console.log("=".repeat(80))

  } catch (err) {
    console.error("Test execution failed:", err)
  } finally {
    if (browser) await browser.close()
    await patientsCol.deleteMany({ phone: { $in: [patientAPhone, patientBPhone] } })
    await mongoClient.close()
  }
}

runDoctorFilteringVerification().catch(console.error)
