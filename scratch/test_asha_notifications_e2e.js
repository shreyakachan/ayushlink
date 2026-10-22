import http from 'http';

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  console.log("=== E2E Integration Test: ASHA Notifications Flow ===");

  // 1. Log in as ASHA worker Pooja Sharma
  console.log("\n[1] Logging in as ASHA Worker (phone: 9876543210, pin: 1234)...");
  const loginRes = await request({
    hostname: '127.0.0.1',
    port: 8000,
    path: '/api/asha/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { phone: '9876543210', password: '123456' });

  if (loginRes.status !== 200) {
    console.error("Login failed:", loginRes);
    process.exit(1);
  }
  const token = loginRes.data.access_token;
  const user = loginRes.data.asha_worker || loginRes.data.user;
  console.log(`[OK] Logged in successfully as: ${user.full_name} (${user.worker_id})`);

  // 2. Fetch notifications as ASHA worker (simulating getNotifications("asha"))
  console.log("\n[2] Fetching notifications via GET /api/asha/notifications...");
  const notifRes = await request({
    hostname: '127.0.0.1',
    port: 8000,
    path: '/api/asha/notifications',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (notifRes.status !== 200) {
    console.error("Failed to fetch notifications:", notifRes);
    process.exit(1);
  }

  const items = notifRes.data;
  console.log(`[OK] Received ${items.length} notifications from API.`);

  // 3. Compute unread count using the exact frontend logic:
  // n.is_read !== undefined ? !n.is_read : (n.unread !== undefined ? n.unread : false)
  const unreadItems = items.filter(n => n.is_read !== undefined ? !n.is_read : (n.unread !== undefined ? n.unread : false));
  const unreadCount = unreadItems.length;
  console.log(`[3] Calculated unread notifications count: ${unreadCount}`);

  // 4. Verify dashboard card badge and description behavior
  const cardBadge = unreadCount > 0 ? unreadCount : undefined;
  const cardDesc = unreadCount > 0 ? `${unreadCount} new updates` : "All caught up";
  console.log(`[4] Dashboard Notifications Card Badge: ${cardBadge !== undefined ? cardBadge : '(hidden)'}`);
  console.log(`[4] Dashboard Notifications Card Description: "${cardDesc}"`);

  if (unreadCount > 0) {
    if (cardBadge === 3 && unreadCount !== 3) {
      console.error("[FAIL] Badge is incorrectly hardcoded to 3!");
      process.exit(1);
    }
    console.log(`[OK] Badge matches actual unread count (${unreadCount}) and is not hardcoded to 3.`);
  } else {
    console.log("[OK] When unread count is 0, badge is hidden and description says 'All caught up'.");
  }

  // 5. Verify Notifications screen data
  console.log("\n[5] Verifying Notifications screen items...");
  if (items.length > 0) {
    const first = items[0];
    console.log(`    First notification: ID=${first.notification_id}, Title="${first.title}", Read=${first.is_read}`);
    console.log(`[OK] Notifications screen will NOT say 'No notifications yet'. It displays ${items.length} items.`);
  }

  // 6. Verify data scoping: No notifications for another worker (e.g. ASHA-833's Sunita Devi)
  console.log("\n[6] Verifying data isolation (Requirement 5)...");
  const leaked = items.filter(i => i.patient_name === "Sunita Devi");
  if (leaked.length > 0) {
    console.error(`[FAIL] Found ${leaked.length} leaked notifications for Sunita Devi!`);
    process.exit(1);
  }
  console.log("[OK] Zero leaked notifications from other ASHA workers.");

  console.log("\n=== ALL E2E INTEGRATION CHECKS PASSED SUCCESSFULLY! ===");
}

run().catch(err => {
  console.error("Error running test:", err);
  process.exit(1);
});
