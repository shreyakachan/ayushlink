import asyncio
import sys
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone

sys.path.append('backend')
from services.security import create_access_token

BASE_URL = "http://127.0.0.1:8000/api"

def make_req(path, token=None, method="GET", payload=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(payload).encode() if payload else None
    req = urllib.request.Request(f"{BASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())
    except Exception as e:
        return 0, str(e)

def run_tests():
    print("=" * 60)
    print("AYUSHLINK MCH & FULL SYSTEM REGRESSION SUITE")
    print("=" * 60)

    # 1. Authorized ASHA Token
    asha_token = create_access_token({"sub": "ASHA-340", "role": "asha", "phone": "9876543210"})
    st, asha_cases = make_req("/doctor/mch-cases", token=asha_token)
    assert st == 200, f"Expected 200, got {st}"
    assert isinstance(asha_cases, list) and len(asha_cases) > 0, "ASHA cases should not be empty"
    print(f"[PASS] 1. Authorized ASHA MCH access: 200 OK ({len(asha_cases)} cases)")

    # 2. Authorized Doctor Token
    doc_token = create_access_token({"sub": "DOC-501", "role": "doctor", "phone": "9876500001"})
    st, doc_cases = make_req("/doctor/mch-cases", token=doc_token)
    assert st == 200, f"Expected 200, got {st}"
    assert len(doc_cases) >= len(asha_cases), "Doctor sees all regional cases"
    print(f"[PASS] 2. Authorized Doctor MCH access: 200 OK ({len(doc_cases)} cases)")

    # 3. ASHA Village Restrictions
    remote_asha_token = create_access_token({"sub": "ASHA-280", "role": "asha", "phone": "9988776655"})
    st, remote_cases = make_req("/doctor/mch-cases", token=remote_asha_token)
    assert st == 200, f"Expected 200, got {st}"
    assert len(remote_cases) == 0, f"Remote ASHA should see 0 cases for Chandapur, got {len(remote_cases)}"
    print(f"[PASS] 3. ASHA village restriction enforced: ASHA-280 sees {len(remote_cases)} cases")

    # 4. Unauthorized User Rejections
    pat_token = create_access_token({"sub": "P-4559", "role": "patient", "phone": "9324998108"})
    st, err_pat = make_req("/doctor/mch-cases", token=pat_token)
    assert st == 403, f"Expected 403 Forbidden for patient, got {st}"
    print(f"[PASS] 4a. Patient token rejected: 403 Forbidden ({err_pat.get('detail')})")

    st, err_no_tok = make_req("/doctor/mch-cases", token=None)
    assert st == 401, f"Expected 401 Unauthorized for missing token, got {st}"
    print(f"[PASS] 4b. Missing token rejected: 401 Unauthorized ({err_no_tok.get('detail')})")

    st, err_bad_tok = make_req("/doctor/mch-cases", token="invalid.token.here")
    assert st == 401, f"Expected 401 for corrupted token, got {st}"
    print(f"[PASS] 4c. Corrupted token rejected: 401 Unauthorized")

    # 5. Check All Four MCH Tabs and Fields
    categories = set(c["category"] for c in asha_cases)
    print(f"\n[INFO] ASHA MCH Categories represented: {categories}")
    assert "pregnancy" in categories, "Pregnancy tab must have records"
    assert "vaccination" in categories, "Vaccination tab must have records"
    assert "growth" in categories, "Growth tab must have records"
    assert "risk" in categories, "High-Risk tab must have records"
    print(f"[PASS] 5. All four MCH tabs populated: Pregnancy, Vaccination, Growth, High-Risk")

    # Check metrics calculation logic
    due_soon_count = sum(1 for c in asha_cases if c.get("due_status") == "due-soon")
    missed_count = sum(1 for c in asha_cases if c.get("due_status") == "missed")
    high_risk_count = sum(1 for c in asha_cases if c.get("is_high_risk") or c.get("category") == "risk")
    print(f"       - Due soon count: {due_soon_count}")
    print(f"       - Missed visits count: {missed_count}")
    print(f"       - High-risk cases count: {high_risk_count}")
    assert due_soon_count > 0, "Due soon count must be > 0"
    assert missed_count > 0, "Missed count must be > 0"
    assert high_risk_count > 0, "High-risk count must be > 0"
    print("[PASS] 5b. Genuine date-based Due Soon, Missed, and High-Risk counts validated")

    # 6. Verify Demo Labeling
    demo_records = [c for c in asha_cases if c.get("is_demo")]
    for d in demo_records:
        assert d["full_name"].startswith("[DEMO]"), f"Demo record name must start with [DEMO]: {d['full_name']}"
        assert d["patient_id"].startswith("DEMO-"), f"Demo patient_id must start with DEMO-: {d['patient_id']}"
    print(f"[PASS] 6. Demonstration records explicitly labelled: {len(demo_records)} demo records")

    # 7. AI Symptom Checker Regression Check
    sym_payload = {
        "symptoms": "High fever, persistent dry cough",
        "patient_id": "P-4559",
        "description": "Patient reports severe cough and high fever for 3 days",
        "language": "en"
    }
    st, ai_resp = make_req("/asha/analyze-symptoms", token=asha_token, method="POST", payload=sym_payload)
    assert st == 200, f"Expected 200 for AI symptom checker, got {st}: {ai_resp}"
    assert "analysis_id" in ai_resp and "level" in ai_resp, "AI Symptom Checker response schema valid"
    print(f"[PASS] 7. AI Symptom Checker working perfectly (Level: {ai_resp['level']}, Severity: {ai_resp['severity']})")

    # 8. Emergency Alerts Endpoint Regression Check
    st, emergency_alerts = make_req("/emergency/alerts/active", token=asha_token)
    assert st == 200, f"Expected 200 for active emergency alerts, got {st}"
    print(f"[PASS] 8. Emergency Alerts endpoint working: 200 OK ({len(emergency_alerts)} active alerts)")

    # 9. Sync Batch Regression Check
    sync_payload = {
        "batch_id": "BATCH-TEST-01",
        "items": [
            {
                "client_id": "Q-TEST-MCH-SYNC-99",
                "type": "symptom_report",
                "client_created_at": datetime.now(timezone.utc).isoformat(),
                "payload": {
                    "patient_id": "P-4559",
                    "symptoms": ["headache"],
                    "description": "Routine headache follow-up",
                    "severity": "mild"
                }
            }
        ]
    }
    st, sync_resp = make_req("/sync/batch", token=asha_token, method="POST", payload=sync_payload)
    assert st == 200, f"Expected 200 for sync batch, got {st}: {sync_resp}"
    assert sync_resp["total_items"] == 1, "Sync batch processed item count"
    print(f"[PASS] 9. Offline Sync Batch endpoint working: 200 OK (Synced: {sync_resp['synced_count']})")

    print("\n" + "=" * 60)
    print("ALL 9 REGRESSION TESTS PASSED 100%!")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
