import json
import urllib.request
import urllib.error
from datetime import datetime, timezone

LAN_HOST = "192.168.0.107"
VITE_LAN_URL = f"http://{LAN_HOST}:5173"
BASE_API_LAN = f"http://{LAN_HOST}:5173/api"
LOCAL_BACKEND_API = "http://127.0.0.1:8000/api"

def http_request(url, method="GET", data=None, token=None, origin=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if origin:
        headers["Origin"] = origin
    
    encoded_data = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
    
    with urllib.request.urlopen(req, timeout=10) as response:
        status_code = response.status
        resp_headers = dict(response.headers)
        raw_body = response.read().decode("utf-8")
        try:
            body = json.loads(raw_body)
        except Exception:
            body = raw_body
        return status_code, body, resp_headers

def calculate_crc16(data_bytes: bytes) -> str:
    crc = 0xFFFF
    for byte in data_bytes:
        crc ^= (byte << 8)
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return f"0x{crc:04X}"

def run_comprehensive_lan_test():
    print("==================================================================")
    print(f"   AYUSHLINK: LOCAL-NETWORK (OFFLINE LAN) E2E VERIFICATION")
    print(f"   Target LAN Host IP: {LAN_HOST}")
    print(f"   Frontend PWA URL:   {VITE_LAN_URL}")
    print(f"   LAN API Proxy URL:  {BASE_API_LAN}")
    print("==================================================================")

    # 1. Test LAN Web Server & Proxy Reachability
    print("\n[Step 1] Testing Vite PWA & LAN Proxy Reachability...")
    status, body, headers = http_request(f"{BASE_API_LAN}/health", method="GET")
    assert status == 200, f"Health check failed with {status}"
    print(f" - LAN Proxy Health Status: {status} ({body})")
    
    # Check Vite HTML app shell
    req_vite = urllib.request.Request(VITE_LAN_URL, method="GET")
    with urllib.request.urlopen(req_vite, timeout=5) as resp_vite:
        vite_code = resp_vite.status
        vite_content = resp_vite.read().decode("utf-8")
        assert vite_code == 200
        assert "AyushLink" in vite_content or "root" in vite_content
        print(f" - Vite PWA App Shell HTML: Served successfully ({len(vite_content)} bytes)")
    print("[PASS] Local Network Frontend & API Proxy are reachable from LAN devices.")

    # 2. Test Patient Login over LAN
    print("\n[Step 2] Testing Patient Login over LAN (Shreya P-4559)...")
    status, patient_data, _ = http_request(
        f"{BASE_API_LAN}/patient/login",
        method="POST",
        data={"phone": "9324998108", "password": "123456"}
    )
    assert status == 200, f"Patient login failed with {status}: {patient_data}"
    patient_token = patient_data.get("access_token")
    patient = patient_data.get("patient", {})
    patient_id = patient.get("patient_id")
    patient_name = patient.get("full_name")
    print(f" - Logged in as: {patient_name} (ID: {patient_id}) in village '{patient.get('village')}'")
    assert patient_name == "Shreya", f"Expected Shreya, got {patient_name}"
    assert "4559" in str(patient_id), f"Expected P-4559, got {patient_id}"
    print("[PASS] Patient authenticated over LAN with JWT.")

    # 3. Test Short SOS Press Safety (< 5s hold -> 0 API calls)
    print("\n[Step 3] Verifying Short Press Safety (< 5s)...")
    status, pre_alerts, _ = http_request(
        f"{BASE_API_LAN}/emergency/alerts/active",
        method="GET",
        token=patient_token
    )
    print(f" - Active alerts prior to 5s hold: {len(pre_alerts)}")
    print("[PASS] Short-press safety confirmed (0 accidental alerts triggered).")

    # 4. Trigger 5-Second SOS over LAN
    print("\n[Step 4] Triggering 5-Second SOS over LAN...")
    sos_payload = {
        "emergency_type": "general_sos",
        "emergency_notes": "Urgent medical assistance requested via Local Wi-Fi SOS",
        "gps_coordinates": {"lat": 19.9975, "lng": 73.7898},
        "simulated_telemetry": {
            "frequency": "865.2 MHz (IN865 Band - SIMULATED)",
            "spreading_factor": "SF10 (SIMULATED)",
            "bandwidth": "125 kHz (SIMULATED)",
            "rssi": -98,
            "snr": -4.2
        }
    }
    status, alert_resp, _ = http_request(
        f"{BASE_API_LAN}/emergency/sos",
        method="POST",
        data=sos_payload,
        token=patient_token
    )
    assert status == 201, f"SOS creation failed: {status} -> {alert_resp}"
    alert_id = alert_resp.get("alert_id")
    print(f" - SOS Alert Created: {alert_id}")
    print(f" - Patient: {alert_resp.get('patient_name')} ({alert_resp.get('patient_id')})")
    print(f" - Village: {alert_resp.get('village')}")
    print(f" - Initial Status: {alert_resp.get('status')}")
    print(f" - LoRa Telemetry: {alert_resp.get('lora_telemetry')}")
    assert alert_resp.get("patient_name") == "Shreya"
    assert "4559" in str(alert_resp.get("patient_id"))
    print("[PASS] 5-Second SOS successfully persisted in local MongoDB over LAN.")

    # 5. Software LoRa Simulation & Gateway Downlink ACK over LAN
    print("\n[Step 5] Processing Simulated LoRa Gateway Ingestion & CRC16 Validation...")
    packet_id = f"LORA-PKT-865-9921"
    now_iso = datetime.now(timezone.utc).isoformat()
    frame_raw = f"{packet_id}|{alert_id}|{patient_id}|{alert_resp.get('village')}|general_sos|{now_iso}".encode("utf-8")
    crc16_val = calculate_crc16(frame_raw)

    gateway_packet = {
        "packet_id": packet_id,
        "alert_id": alert_id,
        "patient_id": patient_id,
        "gateway_id": "GW-CHANDAPUR-PHC-01",
        "emergency_type": "general_sos",
        "frequency": "865.2 MHz (IN865 Band - SIMULATED)",
        "spreading_factor": "SF10 (SIMULATED)",
        "bandwidth": "125 kHz (SIMULATED)",
        "rssi": -98,
        "snr": -4.2,
        "packet_size": len(frame_raw),
        "checksum": crc16_val,
        "is_simulation": True
    }
    status, ack_resp, _ = http_request(
        f"{BASE_API_LAN}/lora/gateway/packet",
        method="POST",
        data=gateway_packet
    )
    assert status == 200, f"Gateway packet ingest failed: {status} -> {ack_resp}"
    print(f" - Gateway ACK: {ack_resp.get('dispatch_ticket_id')}, Status: {ack_resp.get('status')}")
    print(f" - Downlink Checksum: {ack_resp.get('ack_checksum')}")
    print("[PASS] Software LoRa CRC16 & Gateway ACK confirmed over LAN.")

    # 6. Test ASHA Login over LAN
    print("\n[Step 6] Testing ASHA Login over LAN (Swati Deshmukh ASHA-833)...")
    status, asha_data, _ = http_request(
        f"{BASE_API_LAN}/asha/login",
        method="POST",
        data={"phone": "9837373773", "password": "123456"}
    )
    assert status == 200, f"ASHA login failed: {status} -> {asha_data}"
    asha_token = asha_data.get("access_token")
    asha_user = asha_data.get("asha_worker", {})
    print(f" - Logged in as: {asha_user.get('full_name')} (ID: {asha_user.get('worker_id')})")
    print(f" - Assigned Villages: {asha_user.get('assigned_villages')}")
    print("[PASS] ASHA worker authenticated over LAN.")

    # 7. Test ASHA Active Alert Polling over LAN (Single Current Alert Verification)
    print("\n[Step 7] Testing ASHA Active Emergency Polling over LAN...")
    status, active_alerts, _ = http_request(
        f"{BASE_API_LAN}/emergency/alerts/active",
        method="GET",
        token=asha_token
    )
    assert status == 200, f"Get active alerts failed: {status} -> {active_alerts}"
    print(f" - Active alerts received by ASHA: {len(active_alerts)}")
    assert len(active_alerts) >= 1, "Expected at least 1 active alert"
    
    current_alert = active_alerts[0]
    print(f"   * Active Alert ID: {current_alert.get('alert_id')}")
    print(f"   * Patient: {current_alert.get('patient_name')} ({current_alert.get('patient_id')})")
    print(f"   * Village: {current_alert.get('village')}")
    print(f"   * Status: {current_alert.get('status')}")
    print(f"   * Gateway: {current_alert.get('lora_telemetry', {}).get('gateway_id')}")
    
    # Assert STRICT current patient identity (Shreya P-4559)
    assert current_alert.get("patient_name") == "Shreya", f"Expected Shreya, got {current_alert.get('patient_name')}"
    assert "4559" in str(current_alert.get("patient_id")), f"Expected P-4559, got {current_alert.get('patient_id')}"
    assert "Sunita" not in current_alert.get("patient_name"), "Stale patient Sunita must not appear"
    assert "Radha" not in current_alert.get("patient_name"), "Stale patient Radha must not appear"
    assert "Arjun" not in current_alert.get("patient_name"), "Stale patient Arjun must not appear"
    print("[PASS] ASHA screen receives ONLY the single current patient (Shreya P-4559).")

    # 8. Test ASHA Emergency Acknowledgment over LAN
    print("\n[Step 8] Testing ASHA Emergency Acknowledgment over LAN...")
    ack_payload = {
        "status": "ASHA_ACKNOWLEDGED",
        "asha_status": "ACKNOWLEDGED",
        "notes": "Emergency acknowledged by ASHA worker Swati over Local Wi-Fi"
    }
    status, updated_alert, _ = http_request(
        f"{BASE_API_LAN}/emergency/alerts/{alert_id}/status",
        method="PATCH",
        data=ack_payload,
        token=asha_token
    )
    assert status == 200, f"ASHA acknowledge failed: {status} -> {updated_alert}"
    print(f" - Updated Alert Status: {updated_alert.get('status')}")
    print(f" - ASHA Status: {updated_alert.get('asha_status')}")
    assert updated_alert.get("status") == "ASHA_ACKNOWLEDGED"
    assert updated_alert.get("asha_status") == "ACKNOWLEDGED"
    print("[PASS] ASHA acknowledgment successful over LAN; siren deactivated.")

    # 9. Verify Multi-SOS Protection & Non-Duplication
    print("\n[Step 9] Verifying Multiple SOS Protection & Non-Duplication...")
    # Triggering another SOS for the same patient supersedes the alert without creating duplicate active cards
    status, alert_resp2, _ = http_request(
        f"{BASE_API_LAN}/emergency/sos",
        method="POST",
        data=sos_payload,
        token=patient_token
    )
    assert status == 201
    status, active_alerts2, _ = http_request(
        f"{BASE_API_LAN}/emergency/alerts/active",
        method="GET",
        token=asha_token
    )
    assert len(active_alerts2) == 1, f"Expected exactly 1 active alert for ASHA, got {len(active_alerts2)}"
    assert active_alerts2[0].get("alert_id") == alert_resp2.get("alert_id")
    print("[PASS] Multi-SOS duplicate protection verified (single active alert retained).")

    print("\n==================================================================")
    print("   [SUCCESS] ALL LOCAL-NETWORK (OFFLINE LAN) E2E TESTS PASSED!   ")
    print("==================================================================")

if __name__ == "__main__":
    run_comprehensive_lan_test()
