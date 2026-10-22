import puppeteer from "puppeteer-core"
import fs from "fs"

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const FRONTEND_URL = "http://localhost:5173"
const BACKEND_URL = "http://127.0.0.1:8000"

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

async function runAuthFixVerification() {
  console.log("================================================================================")
  console.log("   TESTING PATIENT-TO-DOCTOR VIDEO CONSULTATION AUTHORIZATION FIX")
  console.log("================================================================================")

  // Step 0: Fetch genuine tokens for patient and doctor directly from backend
  const pLoginRes = await fetch(`${BACKEND_URL}/api/patient/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "9324998108", password: "123456" }),
  })
  const pAuthData = await pLoginRes.json()
  const patientToken = pAuthData.access_token

  const dLoginRes = await fetch(`${BACKEND_URL}/api/doctor/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "9823000001", password: "DoctorSecurePass123" }),
  })
  const dAuthData = await dLoginRes.json()
  const doctorToken = dAuthData.access_token

  console.log("  -> Patient Token (phone: 9324998108):", patientToken.slice(0, 25) + "...")
  console.log("  -> Doctor Token (phone: 9823000001):", doctorToken.slice(0, 25) + "...")

  // Clean any active consultations for this patient
  const existingActive = await fetch(`${BACKEND_URL}/api/consultations/active-request`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  if (existingActive?.consultation_id) {
    await fetch(`${BACKEND_URL}/api/consultations/${existingActive.consultation_id}/end-call`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patientToken}` },
    }).catch(() => null)
  }

  // ---------------------------------------------------------------------------
  // TEST 1: Backend Authorization Security — Reject Unauthorized Roles (Doctor)
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 1] Verifying backend rejects doctor token creating patient consultation...")
  const docReqRes = await fetch(`${BACKEND_URL}/api/consultations/request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${doctorToken}`,
    },
    body: JSON.stringify({
      doctor_id: "DOC-101",
      reason: "Unauthorized doctor creation test",
      urgency: "routine",
      symptoms: ["Fever"],
    }),
  })
  const docReqJson = await docReqRes.json()
  console.log(`  -> Status code: ${docReqRes.status}`)
  console.log(`  -> Error detail: "${docReqJson.detail}"`)
  if (docReqRes.status !== 403 || docReqJson.detail !== "Only patients and ASHA workers can create consultation requests.") {
    throw new Error("Backend did not properly reject doctor creating consultation request with 403 Forbidden!")
  }
  console.log("  -> PASS: Unauthorized doctor role correctly rejected by backend.")

  // ---------------------------------------------------------------------------
  // TEST 2: Real Browser E2E — Patient Requests Doctor Video Call With Shared Token Overwrite
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 2] Verifying Patient consultation form in real browser...")
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
    const page = await browser.newPage()

    let capturedPostAuthHeader = null
    let capturedPostStatus = null
    let capturedResponseBody = null

    page.on("request", (req) => {
      if (req.url().includes("/consultations/request") && req.method() === "POST") {
        capturedPostAuthHeader = req.headers()["authorization"] || ""
      }
    })

    page.on("response", async (res) => {
      if (res.url().includes("/consultations/request") && res.request().method() === "POST") {
        capturedPostStatus = res.status()
        try {
          capturedResponseBody = await res.json()
        } catch {}
      }
    })

    // Step A: Login Patient
    console.log("  -> Logging in as Patient Shreya...")
    await passSplashAndChooseRole(page, "patient")

    await page.focus('input[type="tel"]')
    await page.keyboard.type("9324998108")
    await page.focus('input[type="password"]')
    await page.keyboard.type("123456")
    await page.evaluate(() => {
      const form = document.querySelector("form")
      if (form) form.requestSubmit()
    })
    await sleep(2500)

    // Intentionally inject doctor token into generic ayushlink_token to SIMULATE multi-role browser leak
    console.log("  -> Simulating shared browser state (setting ayushlink_token to Doctor token)...")
    await page.evaluate((dTok) => {
      localStorage.setItem("ayushlink_token", dTok)
    }, doctorToken)

    // Step B: Navigate to "Talk to Doctor" (PatientCallScreen)
    console.log("  -> Navigating to Talk to Doctor (PatientCallScreen)...")
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Talk to Doctor") || b.textContent.includes("Video Consultation"))
      if (btn) btn.click()
    })
    await sleep(2000)

    // Step C: Patient submits consultation request
    console.log("  -> Patient submitting Request Video Consultation...")
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const reqBtn = btns.find((b) => b.textContent.includes("Request Video Consultation"))
      if (reqBtn) reqBtn.click()
    })
    await sleep(3000)

    console.log("  -> Captured Authorization Header on POST /consultations/request:")
    console.log("     ", capturedPostAuthHeader ? capturedPostAuthHeader.slice(0, 35) + "..." : "NONE")
    console.log(`  -> Response status: ${capturedPostStatus}`)

    // Read patient token stored in browser localStorage
    const browserPatientToken = await page.evaluate(() => localStorage.getItem("ayushlink_patient_token"))
    const tokenPart = (capturedPostAuthHeader || "").replace(/^Bearer\s+/i, "")
    let tokenPayload = null
    try {
      tokenPayload = JSON.parse(Buffer.from(tokenPart.split(".")[1], "base64").toString("utf-8"))
    } catch {}

    const usedPatientToken = (tokenPart === browserPatientToken) || (tokenPayload?.role === "patient")
    const usedDoctorToken = capturedPostAuthHeader && capturedPostAuthHeader.includes(doctorToken)
    console.log("  -> Captured Token Role:", tokenPayload?.role)
    console.log("  -> Used Patient Token:", usedPatientToken)
    console.log("  -> Avoided Doctor Token:", !usedDoctorToken)

    if (usedDoctorToken) {
      throw new Error("FAIL: Request erroneously used doctor token!")
    }
    if (!usedPatientToken) {
      throw new Error("FAIL: Request did not use patient bearer token!")
    }
    if (capturedPostStatus !== 201) {
      throw new Error(`FAIL: Expected 201 Created, got ${capturedPostStatus}: ${JSON.stringify(capturedResponseBody)}`)
    }

    const createdConsultationId = capturedResponseBody?.consultation_id
    console.log("  -> Created Consultation ID:", createdConsultationId)

    // Verify patient screen is in waiting stage
    const screenText = await page.evaluate(() => document.body.innerText)
    const isWaiting = screenText.includes("Video consultation request sent") || screenText.includes("Waiting for")
    console.log("  -> Patient screen transitioned to waiting stage:", isWaiting)
    if (!isWaiting) {
      throw new Error("Patient screen did not transition to waiting stage!")
    }

    // -------------------------------------------------------------------------
    // TEST 3: Doctor receives and accepts request
    // -------------------------------------------------------------------------
    console.log("\n[TEST 3] Verifying Doctor receives and accepts request...")
    const triageRes = await fetch(`${BACKEND_URL}/api/doctor/video-requests`, {
      headers: { Authorization: `Bearer ${doctorToken}` },
    })
    const triageList = await triageRes.json()
    const foundInTriage = triageList.some((c) => c.consultation_id === createdConsultationId)
    console.log(`  -> Consultation ${createdConsultationId} found in Doctor triage queue:`, foundInTriage)
    if (!foundInTriage) {
      throw new Error(`Consultation ${createdConsultationId} not in doctor triage queue!`)
    }

    // Doctor accepts
    console.log("  -> Doctor accepting consultation...")
    const acceptRes = await fetch(`${BACKEND_URL}/api/consultations/${createdConsultationId}/decision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${doctorToken}`,
      },
      body: JSON.stringify({ action: "accept", notes: "Doctor accepting for verification" }),
    })
    const acceptJson = await acceptRes.json()
    console.log("  -> Doctor accept status:", acceptJson.status)
    if (acceptJson.status !== "accepted") {
      throw new Error("Doctor acceptance failed!")
    }

    // Wait for patient screen polling to detect acceptance
    console.log("  -> Waiting for Patient screen to detect doctor acceptance automatically...")
    let patientDetectedAcceptance = false
    for (let i = 0; i < 8; i++) {
      const pText = await page.evaluate(() => document.body.innerText)
      if (pText.includes("Ready to Join") || pText.includes("Join Video Call") || pText.includes("Doctor Accepted") || pText.includes("accepted")) {
        patientDetectedAcceptance = true
        break
      }
      await sleep(1000)
    }
    console.log("  -> Patient screen updated to accepted stage:", patientDetectedAcceptance)
    if (!patientDetectedAcceptance) {
      throw new Error("Patient screen failed to detect doctor acceptance!")
    }

    // Teardown consultation
    await fetch(`${BACKEND_URL}/api/consultations/${createdConsultationId}/end-call`, {
      method: "POST",
      headers: { Authorization: `Bearer ${doctorToken}` },
    }).catch(() => null)

    console.log("\n================================================================================")
    console.log("   ALL AUTHORIZATION FIX VERIFICATION TESTS PASSED SUCCESSFULLY! (3/3)")
    console.log("================================================================================")
  } finally {
    await browser.close()
  }
}

runAuthFixVerification().catch((err) => {
  console.error("\n❌ TEST FAILED:", err)
  process.exit(1)
})
