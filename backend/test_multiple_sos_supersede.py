import json
import urllib.request

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

def test_multiple_sos_supersede():
    print("=== Testing Repeated SOS & History Retention ===")
    
    # Login as Patient Shreya P-4559
    status, p_data = post_json(f"{BASE_URL}/patient/login", {"phone": "9324998108", "password": "123456"})
    token = p_data.get("access_token")
    
    # 1. Trigger SOS 1
    status, alert1 = post_json(f"{BASE_URL}/emergency/sos", {"emergency_type": "general_sos"}, token)
    print(f"Triggered SOS 1: {alert1.get('alert_id')} for {alert1.get('patient_name')} ({alert1.get('patient_id')})")
    
    # 2. Trigger SOS 2 for the same patient (e.g. test retry)
    status, alert2 = post_json(f"{BASE_URL}/emergency/sos", {"emergency_type": "general_sos"}, token)
    print(f"Triggered SOS 2: {alert2.get('alert_id')} for {alert2.get('patient_name')} ({alert2.get('patient_id')})")
    
    # 3. Check ASHA view
    status, asha_data = post_json(f"{BASE_URL}/asha/login", {"phone": "9837373773", "password": "123456"})
    asha_token = asha_data.get("access_token")
    
    status, active_alerts = get_json(f"{BASE_URL}/emergency/alerts/active", asha_token)
    print(f"Active alerts count for ASHA: {len(active_alerts)}")
    
    # Exactly alert2 should be the active one for this patient
    assert len(active_alerts) == 1, f"Expected 1 active alert, got {len(active_alerts)}"
    assert active_alerts[0].get("alert_id") == alert2.get("alert_id")
    assert active_alerts[0].get("patient_name") == "Shreya"
    assert "4559" in str(active_alerts[0].get("patient_id"))
    
    print("=== Supersede & Single Active Alert Test PASSED! ===")

if __name__ == "__main__":
    test_multiple_sos_supersede()
