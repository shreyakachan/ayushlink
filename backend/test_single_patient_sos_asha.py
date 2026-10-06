import json
import urllib.request
import urllib.error

BASE_URL = "http://127.0.0.1:8000/api"

def post_json(url, data, token=None):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {token}"} if token else {})
        },
        method="POST"
    )
    with urllib.request.urlopen(req) as response:
        return response.status, json.loads(response.read().decode("utf-8"))

def get_json(url, token=None):
    req = urllib.request.Request(
        url,
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {token}"} if token else {})
        },
        method="GET"
    )
    with urllib.request.urlopen(req) as response:
        return response.status, json.loads(response.read().decode("utf-8"))

def patch_json(url, data, token=None):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {token}"} if token else {})
        },
        method="PATCH"
    )
    with urllib.request.urlopen(req) as response:
        return response.status, json.loads(response.read().decode("utf-8"))

def test_single_patient_sos():
    print("=== Testing Single Patient SOS -> ASHA Flow ===")
    
    # 1. Login as Patient P-4559 (Shreya, phone: 9324998108)
    status, patient_data = post_json(f"{BASE_URL}/patient/login", {"phone": "9324998108", "password": "123456"})
    print(f"Patient Login status: {status}")
    patient_token = patient_data.get("access_token") or patient_data.get("token")
    patient_user = patient_data.get("patient") or patient_data.get("user", {})
    print(f"Logged in patient: {patient_user.get('full_name')} ({patient_user.get('patient_id')})")
    assert patient_user.get("full_name") == "Shreya"
    assert "4559" in str(patient_user.get("patient_id"))
    
    # 2. Trigger SOS for P-4559
    sos_payload = {
        "emergency_type": "general_sos",
        "emergency_notes": "Urgent assistance needed - Shreya in Chandapur",
        "gps_coordinates": {"lat": 19.9975, "lng": 73.7898},
        "simulated_telemetry": {
            "frequency": "865.2 MHz (IN865 Band - SIMULATED)",
            "spreading_factor": "SF10 (SIMULATED)",
            "bandwidth": "125 kHz (SIMULATED)",
            "rssi": -101,
            "snr": -5.5
        }
    }
    
    status, alert = post_json(f"{BASE_URL}/emergency/sos", sos_payload, patient_token)
    print(f"SOS Trigger response status: {status}")
    alert_id = alert.get("alert_id")
    print(f"Created Alert: {alert_id} for {alert.get('patient_name')} ({alert.get('patient_id')}) in {alert.get('village')}")
    assert "4559" in str(alert.get("patient_id")), "Patient ID mismatch"
    assert alert.get("patient_name") == "Shreya", "Patient name mismatch"
    
    # 3. Login as ASHA Worker (Swati Deshmukh, phone: 9837373773)
    status, asha_data = post_json(f"{BASE_URL}/asha/login", {"phone": "9837373773", "password": "123456"})
    print(f"ASHA Login status: {status}")
    asha_token = asha_data.get("access_token") or asha_data.get("token")
    
    # 4. Fetch Active Emergency Alerts for ASHA
    status, active_alerts = get_json(f"{BASE_URL}/emergency/alerts/active", asha_token)
    print(f"ASHA active alerts count: {len(active_alerts)}")
    for a in active_alerts:
        print(f" - Active Alert: {a.get('alert_id')} | Patient: {a.get('patient_name')} ({a.get('patient_id')}) | Status: {a.get('status')}")
    
    assert len(active_alerts) >= 1, "Should have at least 1 active alert"
    latest = active_alerts[0]
    assert latest.get("patient_name") == "Shreya", f"Expected Shreya, got {latest.get('patient_name')}"
    assert "4559" in str(latest.get("patient_id")), f"Expected P-4559, got {latest.get('patient_id')}"
    
    # Verify no old test patients appear in the newest active alert
    assert "Sunita" not in latest.get("patient_name"), "Stale patient Sunita should not be the active alert"
    assert "Kavita" not in latest.get("patient_name"), "Stale patient Kavita should not be the active alert"
    assert "Arjun" not in latest.get("patient_name"), "Stale patient Arjun should not be the active alert"
    
    # 5. ASHA Acknowledge Emergency
    status, ack_data = patch_json(
        f"{BASE_URL}/emergency/alerts/{alert_id}/status",
        {"status": "ASHA_ACKNOWLEDGED", "asha_status": "ACKNOWLEDGED", "notes": "Acknowledged by ASHA worker via dashboard"},
        asha_token
    )
    print(f"ASHA Acknowledge status: {status}")
    assert ack_data.get("status") == "ASHA_ACKNOWLEDGED"
    assert ack_data.get("asha_status") == "ACKNOWLEDGED"
    print("ASHA Acknowledgment SUCCESSFUL!")
    
    print("=== All Single Patient SOS tests PASSED! ===")

if __name__ == "__main__":
    test_single_patient_sos()
