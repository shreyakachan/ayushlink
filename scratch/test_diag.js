import puppeteer from 'puppeteer-core';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function test() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });
  const page = await browser.newPage();
  const logs = [];
  page.on('request', (r) => {
    if (r.url().includes('/consultations/active-request')) {
      logs.push({
        type: 'req',
        url: r.url(),
        auth: r.headers()['authorization'],
      });
    }
  });
  page.on('response', (r) => {
    if (r.url().includes('/consultations/active-request')) {
      logs.push({ type: 'res', url: r.url(), status: r.status() });
    }
  });

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await sleep(2800);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(
      (b) =>
        b.textContent.includes('Get Started') ||
        b.textContent.includes('शुरू करें')
    );
    if (btn) btn.click();
  });
  await sleep(800);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(
      (b) => b.textContent.includes('Patient') || b.textContent.includes('मरीज')
    );
    if (btn) btn.click();
  });
  await sleep(800);
  await page.focus('input[type="tel"]');
  await page.keyboard.type('9324998108');
  await page.focus('input[type="password"]');
  await page.keyboard.type('123456');
  await page.evaluate(() => {
    const form = document.querySelector('form');
    if (form) form.requestSubmit();
  });
  await sleep(2000);

  const patientToken = await page.evaluate(() =>
    localStorage.getItem('ayushlink_patient_token')
  );
  console.log(
    'Patient Token:',
    patientToken ? patientToken.slice(0, 20) + '...' : 'NULL'
  );

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(
      (b) =>
        b.textContent.includes('Talk to Doctor') ||
        b.textContent.includes('Video Consultation')
    );
    if (btn) btn.click();
  });
  await sleep(2000);

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find((b) =>
      b.textContent.includes('Request Video Consultation')
    );
    if (btn) btn.click();
  });
  await sleep(2500);

  console.log(
    'Before Doctor Overwrite, logs:',
    logs.map((l) => ({ ...l, auth: l.auth ? l.auth.slice(0, 25) + '...' : undefined }))
  );

  // Now simulate doctor login in same localStorage:
  await page.evaluate(() => {
    localStorage.setItem(
      'ayushlink_token',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummyDoctorToken'
    );
    localStorage.setItem('ayushlink_role', 'doctor');
  });
  await sleep(3000);

  console.log(
    'After Doctor Overwrite, logs:',
    logs.map((l) => ({ ...l, auth: l.auth ? l.auth.slice(0, 25) + '...' : undefined }))
  );

  await browser.close();
}
test();
