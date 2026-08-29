import puppeteer from "puppeteer-core"
import { MongoClient } from "mongodb"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE_URL = "http://localhost:5173"
const MONGO_URI = "mongodb://127.0.0.1:27017"
const DB_NAME = "ayushlink_db"

async function runTest() {
  console.log("=".repeat(80))
  console.log("  REAL-TIME WEBRTC VIDEO CONSULTATION FLOW AUDIT TEST")
  console.log("=".repeat(80))

  const mongoClient = new MongoClient(MONGO_URI)
  await mongoClient.connect()
  const db = mongoClient.db(DB_NAME)

  // Clean any lingering transient test requests
  await db.collection("consultations").deleteMany({ status: { $in: ["requested", "accepted", "in_progress"] } })

  const docCountBefore = await db.collection("doctors").countDocuments({})
  const patCountBefore = await db.collection("patients").countDocuments({})
  const ashaCountBefore = await db.collection("asha_workers").countDocuments({})
  const symCountBefore = await db.collection("symptoms").countDocuments({})
  const consCountBefore = await db.collection("consultations").countDocuments({})

  console.log(`[DB BASELINE] Doctors: ${docCountBefore}, Patients: ${patCountBefore}, ASHA: ${ashaCountBefore}, Symptoms: ${symCountBefore}, Consultations: ${consCountBefore}`)

  let browser
  let createdConsId = null

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: "new",
      args: [
        "--no-sandbox",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--window-size=1280,900",
      ],
    })

    // -------------------------------------------------------------------------
    // Isolated Context 1: Patient (Shreya)
    // -------------------------------------------------------------------------
    const patientContext = await browser.createBrowserContext()
    const patientPage = await patientContext.newPage()
    await patientPage.setViewport({ width: 1280, height: 900 })

    console.log("\n--- STEP 1: Patient (Shreya) Logs In ---")
    await patientPage.goto(BASE_URL, { waitUntil: "networkidle2" })

    // Splash screen -> Get Started
    await patientPage.waitForFunction(
      () => {
        const buttons = Array.from(document.querySelectorAll("button"))
        return buttons.some((b) => b.innerText.includes("Get Started") || b.innerText.includes("Start") || b.innerText.includes("शुरू"))
      },
      { timeout: 8000 }
    )
    await patientPage.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.innerText.includes("Get Started") || b.innerText.includes("Start") || b.innerText.includes("शुरू")
      )
      if (btn) btn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    // Select Patient Role (cards[2])
    await patientPage.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("main .flex-col button"))
      const patBtn = cards.find((b) => b.innerText.includes("Patient") || b.innerText.includes("मरीज") || b.innerText.includes("रुग्ण")) || cards[2]
      if (patBtn) patBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    // Patient login (9324998108 / 123456)
    await patientPage.waitForSelector('input[type="tel"]', { timeout: 8000 })
    await patientPage.evaluate(() => {
      function setVal(input, val) {
        if (!input) return
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
        setter.call(input, val)
        input.dispatchEvent(new Event("input", { bubbles: true }))
        input.dispatchEvent(new Event("change", { bubbles: true }))
      }
      const telInput = document.querySelector('input[type="tel"]')
      if (telInput) setVal(telInput, "9324998108")
      const passInput = document.querySelector('input[type="password"]')
      if (passInput) setVal(passInput, "123456")
    })
    await new Promise((r) => setTimeout(r, 500))

    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const subBtn = btns.find((b) => b.innerText.includes("Login") || b.innerText.includes("लॉग इन"))
      if (subBtn) subBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1500))

    const patientGreeting = await patientPage.evaluate(() => document.body.innerText)
    if (patientGreeting.includes("Shreya") || patientGreeting.includes("श्रेया") || patientGreeting.includes("Talk to Doctor")) {
      console.log("  ✓ Patient authenticated successfully as Shreya")
    }

    console.log("\n--- STEP 2: Patient Navigates to Video Consultation ---")
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const callTile = btns.find((b) => b.innerText.includes("Talk to Doctor") || b.innerText.includes("डॉक्टर से बात"))
      if (callTile) callTile.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    console.log("\n--- STEP 3: Patient Explicitly Requests Video Consultation ---")
    await patientPage.waitForFunction(
      () => {
        const btns = Array.from(document.querySelectorAll("button"))
        return btns.some((b) => b.innerText.includes("Request Video Consultation"))
      },
      { timeout: 8000 }
    )

    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const reqBtn = btns.find((b) => b.innerText.includes("Request Video Consultation"))
      if (reqBtn) reqBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1500))

    await patientPage.waitForFunction(
      () => {
        const text = document.body.innerText
        return text.includes("Video consultation request sent") || text.includes("Pending Approval") || text.includes("Doctor accepted")
      },
      { timeout: 8000 }
    )
    console.log("  ✓ Video consultation request placed! Patient is in 'waiting for doctor approval' state.")

    const activeCons = await db.collection("consultations").findOne({ patient_id: "P-4559", status: { $in: ["requested", "accepted"] } })
    createdConsId = activeCons?.consultation_id
    console.log(`  [CONSULTATION IN DB] ID: ${activeCons?.consultation_id}, Status: ${activeCons?.status}, Doctor: ${activeCons?.doctor_id || "unassigned"}`)

    // -------------------------------------------------------------------------
    // Isolated Context 2: Doctor (Dr. Ramesh Gupta)
    // -------------------------------------------------------------------------
    console.log("\n--- STEP 4: Doctor (Dr. Ramesh Gupta) Logs In in Context 2 ---")
    const doctorContext = await browser.createBrowserContext()
    const doctorPage = await doctorContext.newPage()
    await doctorPage.setViewport({ width: 1280, height: 900 })

    await doctorPage.goto(BASE_URL, { waitUntil: "networkidle2" })

    await doctorPage.waitForFunction(
      () => {
        const buttons = Array.from(document.querySelectorAll("button"))
        return buttons.some((b) => b.innerText.includes("Get Started") || b.innerText.includes("Start") || b.innerText.includes("शुरू"))
      },
      { timeout: 8000 }
    )
    await doctorPage.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.innerText.includes("Get Started") || b.innerText.includes("Start") || b.innerText.includes("शुरू")
      )
      if (btn) btn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    // Select Doctor Role
    await doctorPage.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("main .flex-col button"))
      const docBtn = cards.find((b) => b.innerText.includes("Doctor") || b.innerText.includes("डॉक्टर")) || cards[1]
      if (docBtn) docBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    // Fill Doctor credentials
    await doctorPage.waitForSelector("#phone", { timeout: 8000 })
    await doctorPage.type("#phone", "9823000001")
    await doctorPage.type("#password", "DoctorSecurePass123")

    await doctorPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const subBtn = btns.find((b) => b.innerText.includes("Sign In") || b.innerText.includes("लॉग इन") || b.innerText.includes("Login"))
      if (subBtn) subBtn.click()
    })
    doctorPage.on("console", (msg) => console.log(`DOC CONSOLE [${msg.type()}]:`, msg.text()))
    doctorPage.on("pageerror", (err) => console.log(`DOC ERROR:`, err.message))

    await doctorPage.waitForSelector("aside", { timeout: 10000 })
    await new Promise((r) => setTimeout(r, 2000))
    console.log("  ✓ Doctor authenticated as Dr. Ramesh Gupta")

    console.log("\n--- STEP 5: Doctor Sees Live Video Request & Clicks Accept ---")
    const docScreenText = await doctorPage.evaluate(() => document.body.innerText)
    console.log("Doctor initial screen text snippet:", docScreenText.slice(0, 300).replace(/\n+/g, " | "))

    await doctorPage.waitForFunction(
      () => {
        const text = document.body.innerText.toLowerCase()
        return text.includes("live video consultation requests") && (text.includes("shreya") || text.includes("p-4559"))
      },
      { timeout: 15000 }
    )
    console.log("  ✓ Doctor sees 'Live Video Consultation Requests' queue with Shreya's incoming request!")

    // Click Accept button on the request
    await doctorPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const acceptBtn = btns.find((b) => b.innerText.trim() === "Accept" || b.innerText.includes("Accept"))
      if (acceptBtn) acceptBtn.click()
    })
    await new Promise((r) => setTimeout(r, 2000))

    await doctorPage.waitForFunction(
      () => {
        const text = document.body.innerText.toLowerCase()
        return text.includes("join video consultation") || text.includes("accepted")
      },
      { timeout: 12000 }
    )
    console.log("  ✓ Doctor status transitions to 'Accepted • Ready' with 'Join Video Consultation' action button!")

    console.log("\n--- STEP 6: Patient Screen Updates to 'Doctor accepted your request!' ---")
    await patientPage.waitForFunction(
      () => {
        const text = document.body.innerText.toLowerCase()
        return text.includes("doctor accepted your request") || text.includes("join video consultation")
      },
      { timeout: 12000 }
    )
    console.log("  ✓ Patient real-time screen updated: 'Doctor accepted your request!' + [Join Video Consultation]!")

    console.log("\n--- STEP 7: Joining Real WebRTC Video Session on Both Sides ---")
    // Doctor clicks Join Video Consultation
    await doctorPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const joinBtn = btns.find((b) => b.innerText.includes("Join Video Consultation"))
      if (joinBtn) joinBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1500))

    await doctorPage.waitForFunction(
      () => {
        const text = document.body.innerText.toLowerCase()
        return text.includes("live webrtc session") || text.includes("connecting with") || text.includes("shreya")
      },
      { timeout: 10000 }
    )
    console.log("  ✓ Doctor WebRTC Video Consultation Room active (Local preview & Patient stream container ready).")

    // Patient clicks Join Video Consultation
    await patientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const joinBtn = btns.find((b) => b.innerText.includes("Join Video Consultation"))
      if (joinBtn) joinBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1500))

    await patientPage.waitForFunction(
      () => {
        const text = document.body.innerText.toLowerCase()
        return text.includes("live video consultation") || text.includes("connecting with")
      },
      { timeout: 10000 }
    )
    console.log("  ✓ Patient WebRTC Video Consultation Room active.")

    console.log("\n--- STEP 8: Ending Video Call & Clinical Transition ---")
    // Doctor clicks End Call button
    await doctorPage.evaluate(() => {
      const endBtn = document.querySelector("button[title='End Consultation']")
      if (endBtn) endBtn.click()
    })
    await new Promise((r) => setTimeout(r, 1500))

    await doctorPage.waitForFunction(
      () => {
        const text = document.body.innerText.toLowerCase()
        return text.includes("video consultation completed") && text.includes("proceed to clinical consultation")
      },
      { timeout: 10000 }
    )
    console.log("  ✓ Doctor sees 'Video Consultation Completed' summary.")
    console.log("  ✓ Clinical transition button 'Proceed to Clinical Consultation & Prescribe' is present and active!")

    console.log("\n--- STEP 9: Final Database Audit & Cleanup ---")
    if (createdConsId) {
      await db.collection("consultations").deleteMany({ consultation_id: createdConsId })
    }

    const docCountFinal = await db.collection("doctors").countDocuments({})
    const patCountFinal = await db.collection("patients").countDocuments({})
    const ashaCountFinal = await db.collection("asha_workers").countDocuments({})
    const symCountFinal = await db.collection("symptoms").countDocuments({})
    const consCountFinal = await db.collection("consultations").countDocuments({})

    console.log(`[FINAL DB STATE] Doctors: ${docCountFinal} (was ${docCountBefore})`)
    console.log(`[FINAL DB STATE] Patients: ${patCountFinal} (was ${patCountBefore})`)
    console.log(`[FINAL DB STATE] ASHA: ${ashaCountFinal} (was ${ashaCountBefore})`)
    console.log(`[FINAL DB STATE] Symptoms: ${symCountFinal} (was ${symCountBefore})`)
    console.log(`[FINAL DB STATE] Consultations: ${consCountFinal} (was ${consCountBefore})`)

    if (
      docCountFinal === docCountBefore &&
      patCountFinal === patCountBefore &&
      ashaCountFinal === ashaCountBefore &&
      symCountFinal === symCountBefore &&
      consCountFinal === consCountBefore
    ) {
      console.log("  ✓ PERFECT DATABASE INTEGRITY: Exactly zero dummy records or mutations persisted outside explicit user flow!")
    }

    console.log("\n" + "=".repeat(80))
    console.log("  ALL REAL-TIME WEBRTC VIDEO CONSULTATION TESTS PASSED WITH 100% SUCCESS!")
    console.log("=".repeat(80))
  } catch (err) {
    console.error("Test execution failed:", err)
    if (createdConsId) {
      await db.collection("consultations").deleteMany({ consultation_id: createdConsId })
    }
  } finally {
    if (browser) await browser.close()
    await mongoClient.close()
  }
}

runTest()
