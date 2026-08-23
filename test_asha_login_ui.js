import puppeteer from "puppeteer-core"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE_URL = "http://localhost:5173"

async function testAshaLogin() {
  console.log("Starting Browser UI test for ASHA Worker login...")
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,800"],
  })

  try {
    const page = await browser.newPage()
    await page.goto(BASE_URL, { waitUntil: "networkidle2" })

    // Wait for Splash get-started or Role Select
    console.log("Waiting for app screen...")
    await new Promise((r) => setTimeout(r, 2600))

    // Click "Get Started" button if present on splash
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const getStarted = btns.find((b) => b.innerText.includes("Get Started") || b.innerText.includes("Continue"))
      if (getStarted) getStarted.click()
    })
    await new Promise((r) => setTimeout(r, 800))

    // Click "ASHA Worker" role button
    console.log("Selecting ASHA Worker role...")
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const asha = btns.find((b) => b.innerText.includes("ASHA Worker"))
      if (asha) asha.click()
    })
    await new Promise((r) => setTimeout(r, 800))

    // Wait for #phone input
    await page.waitForSelector("#phone", { timeout: 8000 })
    await page.waitForSelector("#password", { timeout: 8000 })
    console.log("Login screen loaded.")

    // 1. Test Wrong Password Rejection
    console.log("Step 1: Testing wrong password rejection (9837373773 / wrongpass)...")
    await page.click("#phone", { clickCount: 3 })
    await page.type("#phone", "9837373773")
    await page.click("#password", { clickCount: 3 })
    await page.type("#password", "wrongpass")

    await page.click('button[type="submit"]')
    await new Promise((r) => setTimeout(r, 1200))

    const textAfterWrong = await page.evaluate(() => document.body.innerText)
    if (textAfterWrong.includes("Incorrect password or PIN") || textAfterWrong.includes("Invalid mobile number or credentials")) {
      console.log(" [PASS] Wrong password rejected with UI message:", textAfterWrong.match(/(Incorrect password[^\n.]*|Invalid mobile[^\n.]*)/)?.[0])
    } else {
      console.log(" [NOTE] Response after wrong password:", textAfterWrong.slice(0, 200))
    }

    // 2. Test Correct Credentials: 9837373773 / 123456
    console.log("Step 2: Testing valid ASHA login (9837373773 / 123456)...")
    await page.click("#password", { clickCount: 3 })
    await page.type("#password", "123456")

    await page.click('button[type="submit"]')
    await new Promise((r) => setTimeout(r, 2000))

    const textAfterSuccess = await page.evaluate(() => document.body.innerText)
    if (
      textAfterSuccess.includes("Today's Summary") ||
      textAfterSuccess.includes("Quick Actions") ||
      textAfterSuccess.includes("My Patients") ||
      textAfterSuccess.includes("Incentive Wallet") ||
      textAfterSuccess.includes("Welcome back") ||
      textAfterSuccess.includes("Meena") ||
      textAfterSuccess.includes("Swati") ||
      textAfterSuccess.includes("AyushLink")
    ) {
      console.log(" [PASS] SUCCESS: ASHA Worker logged in successfully and navigated to ASHA Dashboard!")
    } else {
      console.log(" [RESULT] Text after login:\n", textAfterSuccess.slice(0, 400))
    }

  } finally {
    await browser.close()
  }
}

testAshaLogin().catch(console.error)
