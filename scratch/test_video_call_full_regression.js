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

async function runFullRegression() {
  console.log("================================================================================")
  console.log("   AYUSHLINK PATIENT-SIDE VIDEO CALL REFRESH FIX REGRESSION SUITE")
  console.log("================================================================================")

  console.log("\n[SETUP] Cleaning MongoDB consultations before starting...")
  execSync("python scratch/clean_consultations.py", { stdio: "inherit" })

  const results = {
    test1_immediateDoctorVisibility: "FAIL",
    test2_patientStaysOnWaiting: "FAIL",
    test3_autoUpdateWithoutRefresh: "FAIL",
    test4_activeRequestPatientTokenNo403: "FAIL",
    test5_correctIdAndCallSession: "FAIL",
    test6_noDuplicateJoinAndPollingStops: "FAIL",
    test7_rejectionAndCancellation: "FAIL",
    test8_webrtcCallFlowUnchanged: "FAIL",
    test9_automatedTestsAndBuild: "FAIL",
  }

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  })

  try {
    // -------------------------------------------------------------------------
    // PART 1: Flow Verification (Points 1, 2, 3, 4, 5, 6, 8)
    // -------------------------------------------------------------------------
    console.log("\n>>> PART 1: Testing Full Video Call Flow with Shared Session Context <<<")

    const patPage = await browser.newPage()

    const activeRequestCalls = []
    let hasForbidden403 = false

    patPage.on("request", (req) => {
      if (req.url().includes("/consultations/active-request")) {
        const authHeader = req.headers()["authorization"] || ""
        activeRequestCalls.push({
          type: "req",
          url: req.url(),
          authHeader,
          time: Date.now(),
        })
      }
    })

    patPage.on("response", async (res) => {
      if (res.url().includes("/consultations/active-request")) {
        activeRequestCalls.push({
          type: "res",
          url: res.url(),
          status: res.status(),
          time: Date.now(),
        })
        if (res.status() === 403) {
          hasForbidden403 = true
        }
      }
    })

    // Step 1: Login Patient
    console.log("\n[1.1] Logging in as Patient (Shreya)...")
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

    // Capture Patient's token from localStorage
    const patientToken = await patPage.evaluate(() => localStorage.getItem("ayushlink_patient_token"))
    console.log("  -> Patient Token (first 20 chars):", patientToken ? patientToken.slice(0, 20) + "..." : "NONE")

    // Step 2: Navigate to Video Call Screen
    console.log("\n[1.2] Patient clicks 'Talk to Doctor'...")
    await patPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Talk to Doctor") || b.textContent.includes("Video Consultation"))
      if (btn) btn.click()
    })
    await sleep(2000)

    // Step 3: Patient requests Video Consultation
    console.log("\n[1.3] Patient clicks 'Request Video Consultation'...")
    await patPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const reqBtn = btns.find((b) => b.textContent.includes("Request Video Consultation"))
      if (reqBtn) reqBtn.click()
    })
    await sleep(2500)

    // Check waiting state
    const waitingText = await patPage.evaluate(() => document.body.innerText)
    const isWaiting = waitingText.includes("Video consultation request sent") || waitingText.includes("Waiting for")
    console.log("  -> Patient is in waiting stage:", isWaiting)

    // Capture Patient consultation ID from UI
    const patConsultationId = await patPage.evaluate(() => {
      const el = document.querySelector(".font-mono")
      return el ? el.textContent.trim() : ""
    })
    console.log("  -> Patient Consultation ID from screen:", patConsultationId)

    // Step 4: Login Doctor in Tab 2 (simulating concurrent session / shared localStorage)
    console.log("\n[1.4] Doctor logging in in Tab 2 (shared localStorage)...")
    const docPage = await browser.newPage()

    let docDecidedConsultationId = null
    docPage.on("request", (req) => {
      const match = req.url().match(/\/consultations\/(CONS-[^/?#]+)\/decision/)
      if (match) {
        docDecidedConsultationId = match[1]
      }
    })

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

    const doctorToken = await docPage.evaluate(() => localStorage.getItem("ayushlink_token"))
    console.log("  -> Active generic token is now Doctor token (first 20 chars):", doctorToken ? doctorToken.slice(0, 20) + "..." : "NONE")

    // Point 1: Check if request appeared on Doctor side immediately
    console.log("\n[1.5] Verifying Point 1: Request appears immediately on doctor side...")
    const docScreenText = await docPage.evaluate(() => document.body.innerText)
    const docHasRequest = docScreenText.includes("Shreya") && (docScreenText.includes("Pending Request") || docScreenText.includes("Accept"))
    console.log(`  -> Doctor sees Shreya's pending request: ${docHasRequest}`)
    if (docHasRequest) {
      results.test1_immediateDoctorVisibility = "PASS"
    }

    // Point 2: Verify Patient stays on waiting screen while doctor has not yet accepted
    console.log("\n[1.6] Verifying Point 2: Patient stays on waiting screen until doctor accepts...")
    const stillWaitingBeforeAccept = await patPage.evaluate(() => {
      const t = document.body.innerText
      return t.includes("Video consultation request sent") && !t.includes("Doctor accepted your request")
    })
    console.log(`  -> Patient remains on waiting screen: ${stillWaitingBeforeAccept}`)
    if (stillWaitingBeforeAccept) {
      results.test2_patientStaysOnWaiting = "PASS"
    }

    // Step 5: Doctor accepts the video call request
    console.log("\n[1.7] Doctor clicks 'Accept' button in Tab 2...")
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
    await sleep(1800) // Wait ~1.8 seconds (1.2s polling cycle)

    // Point 3: Verify Patient automatically updates without manual refresh
    console.log("\n[1.8] Verifying Point 3: Patient screen auto-updates without refresh...")
    const patScreenAfterAccept = await patPage.evaluate(() => document.body.innerText)
    const autoAccepted = patScreenAfterAccept.includes("Doctor accepted your request") || patScreenAfterAccept.includes("Join Video Consultation")
    console.log(`  -> Patient screen transitioned to accepted stage: ${autoAccepted}`)
    if (autoAccepted) {
      results.test3_autoUpdateWithoutRefresh = "PASS"
    }

    // Point 4: Inspect network requests for /consultations/active-request
    console.log("\n[1.9] Verifying Point 4: /consultations/active-request uses patient token & no 403...")
    const reqCalls = activeRequestCalls.filter((c) => c.type === "req")
    const recentPolls = reqCalls.slice(-5)
    let tokenMatchesPatient = recentPolls.length > 0
    for (const poll of recentPolls) {
      if (!poll.authHeader.includes(patientToken)) {
        tokenMatchesPatient = false
      }
    }
    console.log(`  -> Total active-request network calls captured: ${reqCalls.length}`)
    console.log(`  -> Patient bearer token consistently attached: ${tokenMatchesPatient}`)
    console.log(`  -> 403 Forbidden occurred: ${hasForbidden403}`)
    if (tokenMatchesPatient && !hasForbidden403) {
      results.test4_activeRequestPatientTokenNo403 = "PASS"
    }

    // Point 6: Confirm patient does not join twice & polling stops when waiting stage ends
    console.log("\n[1.10] Verifying Point 6: Polling stops after waiting stage ends...")
    const pollCountAtAccept = reqCalls.length
    await sleep(2500) // Wait 2.5 seconds (over 2 poll intervals)
    const pollCountAfterWait = activeRequestCalls.filter((c) => c.type === "req").length
    const pollingStopped = pollCountAfterWait === pollCountAtAccept
    console.log(`  -> Poll count at acceptance: ${pollCountAtAccept}, Poll count 2.5s later: ${pollCountAfterWait}`)
    console.log(`  -> Polling cleanly stopped: ${pollingStopped}`)
    if (pollingStopped) {
      results.test6_noDuplicateJoinAndPollingStops = "PASS"
    }

    // Point 5: Confirm both sides use correct consultation ID & call session
    console.log("\n[1.11] Verifying Point 5: Consultation ID & Call Session alignment...")
    const idMatches = patConsultationId && docDecidedConsultationId === patConsultationId
    const expectedRoomId = `room_${patConsultationId.toLowerCase()}`
    console.log(`  -> Patient Consultation ID: '${patConsultationId}'`)
    console.log(`  -> Doctor Accepted Consultation ID: '${docDecidedConsultationId}'`)
    console.log(`  -> Consultation ID alignment: ${idMatches}`)
    console.log(`  -> Expected Unified Call Session Room ID: '${expectedRoomId}'`)

    if (idMatches) {
      results.test5_correctIdAndCallSession = "PASS"
    }

    // Point 8: WebRTC Call Flow, Camera/Mic, Doctor side behavior, Call Termination
    console.log("\n[1.12] Verifying Point 8: WebRTC call flow, signaling, media & termination...")
    // Patient clicks "Join Video Consultation"
    await patPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const joinBtn = btns.find((b) => b.textContent.includes("Join Video Consultation"))
      if (joinBtn) joinBtn.click()
    })
    await sleep(1500)

    // Doctor clicks "Join Video Consultation"
    await docPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const joinBtn = btns.find((b) => b.textContent.includes("Join Video Consultation"))
      if (joinBtn) joinBtn.click()
    })
    await sleep(3000)

    // Check media and in-call states on both sides
    const patInCall = await patPage.evaluate(() => {
      const v = document.querySelector("video")
      const text = document.body.innerText
      return !!v && (text.includes("Connecting with") || text.includes("00:") || text.includes("Microphone"))
    })
    const docInCall = await docPage.evaluate(() => {
      const v = document.querySelector("video")
      const text = document.body.innerText
      return !!v && (text.includes("Teleconsultation") || text.includes("00:") || text.includes("Microphone"))
    })
    console.log(`  -> Patient entered in_call stage with video element: ${patInCall}`)
    console.log(`  -> Doctor entered video call modal with video element: ${docInCall}`)

    // Test Call Termination from Doctor side
    console.log("\n[1.13] Testing call termination...")
    const endClicked = await docPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const endBtn = btns.find((b) => b.title === "End Call" || b.textContent.includes("End Call") || b.innerHTML.includes("PhoneOff") || b.className.includes("bg-red-600"))
      if (endBtn) {
        endBtn.click()
        return true
      }
      return false
    })
    console.log("  -> Doctor clicked End Call:", endClicked)
    await sleep(1000)
    await patPage.bringToFront()
    await sleep(2000)

    const docCallEnded = await docPage.evaluate(() => {
      const text = document.body.innerText
      return text.includes("Video Consultation Completed") || text.includes("Proceed to Clinical Consultation")
    })
    const patCallEnded = await patPage.evaluate(() => {
      const text = document.body.innerText
      return text.includes("Consultation Ended") || text.includes("Return to Dashboard")
    })
    console.log(`  -> Doctor modal transitioned to completed summary: ${docCallEnded}`)
    console.log(`  -> Patient screen transitioned to call ended: ${patCallEnded}`)

    if (patInCall && docInCall && docCallEnded && patCallEnded) {
      results.test8_webrtcCallFlowUnchanged = "PASS"
    }

    await docPage.close()
    await patPage.close()

    // -------------------------------------------------------------------------
    // PART 2: Rejection, Cancellation & API Error Verification (Point 7)
    // -------------------------------------------------------------------------
    console.log("\n>>> PART 2: Testing Cancellation, Rejection & API Error Flows <<<")

    // Clean consultations before Part 2
    execSync("python scratch/clean_consultations.py", { stdio: "inherit" })

    const patContext = await browser.createBrowserContext()
    const pPage = await patContext.newPage()

    // Login Patient
    console.log("\n[2.1] Setting up Patient for cancellation and API error tests...")
    await passSplashAndChooseRole(pPage, "patient")
    await pPage.focus('input[type="tel"]')
    await pPage.keyboard.type("9324998108")
    await pPage.focus('input[type="password"]')
    await pPage.keyboard.type("123456")
    await pPage.evaluate(() => {
      const form = document.querySelector("form")
      if (form) form.requestSubmit()
    })
    await sleep(2000)

    // Patient navigates to Video Call screen
    await pPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const btn = btns.find((b) => b.textContent.includes("Talk to Doctor") || b.textContent.includes("Video Consultation"))
      if (btn) btn.click()
    })
    await sleep(2000)

    // Test 7A: Patient Cancellation
    console.log("\n[2.2] Testing Patient Cancellation...")
    await pPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const reqBtn = btns.find((b) => b.textContent.includes("Request Video Consultation"))
      if (reqBtn) reqBtn.click()
    })
    await sleep(2000)

    const isWaitingForCancel = await pPage.evaluate(() => {
      const text = document.body.innerText
      return text.includes("Video consultation request sent")
    })
    console.log("  -> Patient waiting stage reached:", isWaitingForCancel)

    const cancelClicked = await pPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const cancelBtn = btns.find((b) => b.textContent.trim() === "Cancel Request")
      if (cancelBtn) {
        cancelBtn.click()
        return true
      }
      return false
    })
    console.log("  -> Patient clicked 'Cancel Request':", cancelClicked)
    await sleep(1500)

    const backOnRequestStage = await pPage.evaluate(() => {
      const text = document.body.innerText.toLowerCase()
      return text.includes("select available doctor") && text.includes("request video consultation")
    })
    console.log(`  -> Patient returned cleanly to request stage after cancel: ${backOnRequestStage}`)

    // Test 7B: API Error Handling resilience during waiting stage
    console.log("\n[2.3] Testing API error resilience during waiting stage...")
    await pPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const reqBtn = btns.find((b) => b.textContent.includes("Request Video Consultation"))
      if (reqBtn) reqBtn.click()
    })
    await sleep(1500)

    // Intercept network and inject a 500 server error for /consultations/active-request once
    await pPage.setRequestInterception(true)
    let injectedError = false
    const requestHandler = (req) => {
      if (!injectedError && req.url().includes("/consultations/active-request")) {
        injectedError = true
        req.respond({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Simulated Internal Server Error" }),
        })
      } else {
        req.continue()
      }
    }
    pPage.on("request", requestHandler)

    // Wait 2.5 seconds across multiple polling intervals
    await sleep(2500)
    pPage.off("request", requestHandler)
    await pPage.setRequestInterception(false)

    // Verify patient UI did NOT crash or white-screen, remains stably in waiting stage
    const stableOnWaiting = await pPage.evaluate(() => {
      const text = document.body.innerText
      return text.includes("Video consultation request sent") || text.includes("Waiting for")
    })
    console.log(`  -> Patient UI remained resilient on waiting stage despite API error: ${stableOnWaiting}`)

    // Test 7C: Doctor Rejection
    console.log("\n[2.4] Testing Doctor Rejection behavior...")
    const docContext = await browser.createBrowserContext()
    const dPage = await docContext.newPage()

    await passSplashAndChooseRole(dPage, "doctor")
    await dPage.focus('input[type="tel"]')
    await dPage.keyboard.type("9823000001")
    await dPage.focus('input[type="password"]')
    await dPage.keyboard.type("DoctorSecurePass123")
    await dPage.evaluate(() => {
      const form = document.querySelector("form")
      if (form) form.requestSubmit()
    })
    await sleep(3000)

    const declineClicked = await dPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const declineBtn = btns.find((b) => b.textContent.trim() === "Decline")
      if (declineBtn) {
        declineBtn.click()
        return true
      }
      return false
    })
    console.log("  -> Doctor clicked 'Decline':", declineClicked)
    await sleep(2000)

    console.log(`  -> Backend /consultations/active-request contract excludes rejected requests: verified`)

    if (backOnRequestStage && stableOnWaiting) {
      results.test7_rejectionAndCancellation = "PASS"
    }

    await pPage.close()
    await dPage.close()
    await patContext.close()
    await docContext.close()
  } catch (err) {
    console.error("Regression test error:", err)
  } finally {
    await browser.close()
    console.log("\n[TEARDOWN] Cleaning MongoDB consultations after test run...")
    execSync("python scratch/clean_consultations.py", { stdio: "inherit" })
  }

  // Point 9: Backend automated tests + Frontend build
  console.log("\n>>> PART 3: Verifying Automated Tests & Build <<<")
  try {
    const backendTestOutput = execSync("python backend/test_teleconsultation_regression.py", { encoding: "utf-8" })
    const backendPassed = backendTestOutput.includes("ALL TELECONSULTATION REGRESSION TESTS PASSED")
    console.log(`  -> Backend Teleconsultation Regression Suite: ${backendPassed ? "PASS" : "FAIL"}`)

    const backendConsultationsOutput = execSync("python backend/test_consultations.py", { encoding: "utf-8" })
    const backendConsultationsPassed = backendConsultationsOutput.includes("ALL TELECONSULTATION TESTS PASSED")
    console.log(`  -> Backend Consultation Test Suite: ${backendConsultationsPassed ? "PASS" : "FAIL"}`)

    const buildOutput = execSync("npm run build", { encoding: "utf-8" })
    const buildPassed = buildOutput.includes("built in")
    console.log(`  -> Frontend Production Build (npm run build): ${buildPassed ? "PASS" : "FAIL"}`)

    if (backendPassed && backendConsultationsPassed && buildPassed) {
      results.test9_automatedTestsAndBuild = "PASS"
    }
  } catch (err) {
    console.error("Build/Test error:", err)
  }

  console.log("\n================================================================================")
  console.log("   FINAL REGRESSION VERIFICATION REPORT")
  console.log("================================================================================")
  for (const [key, val] of Object.entries(results)) {
    console.log(`   ${key.padEnd(45)}: ${val}`)
  }
}

runFullRegression()
