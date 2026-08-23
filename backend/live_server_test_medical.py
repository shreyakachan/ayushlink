import json
import urllib.request
import urllib.error
import time

BASE_URL = "http://127.0.0.1:8000"


def make_request(method, path, body=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req) as response:
            status_code = response.getcode()
            res_body = json.loads(response.read().decode("utf-8"))
            return status_code, res_body
    except urllib.error.HTTPError as e:
        status_code = e.code
        try:
            res_body = json.loads(e.read().decode("utf-8"))
        except Exception:
            res_body = {"raw": str(e)}
        return status_code, res_body
    except Exception as e:
        return 0, {"error": str(e)}


def run_live_tests():
    results = []

    # 0. Health check to ensure server is live
    status, body = make_request("GET", "/api/health")
    if status != 200:
        print(f"Error: Server not responding at {BASE_URL}. Status: {status}")
        return

    # Setup: Register Patient 1 (Chandapur)
    p1_payload = {
        "full_name": "Kavita Patil",
        "phone": "9823077777",
        "password": "PatientPassword123",
        "age": 27,
        "gender": "female",
        "village": "Chandapur",
        "preferred_language": "mr",
    }
    # Clean register attempt
    status_p1, body_p1 = make_request("POST", "/api/patient/register", p1_payload)
    if status_p1 == 400:  # already exists, login
        status_p1, body_p1 = make_request("POST", "/api/patient/login", {"phone": "9823077777", "password": "PatientPassword123"})
    token_p1 = body_p1.get("access_token")
    pid_p1 = body_p1.get("patient", {}).get("patient_id")

    # Setup: Register Patient 2 (Rampur)
    p2_payload = {
        "full_name": "Arjun Shinde",
        "phone": "9823088888",
        "password": "PatientPassword123",
        "age": 8,
        "gender": "male",
        "village": "Rampur",
        "preferred_language": "en",
    }
    status_p2, body_p2 = make_request("POST", "/api/patient/register", p2_payload)
    if status_p2 == 400:
        status_p2, body_p2 = make_request("POST", "/api/patient/login", {"phone": "9823088888", "password": "PatientPassword123"})
    token_p2 = body_p2.get("access_token")
    pid_p2 = body_p2.get("patient", {}).get("patient_id")

    # Setup: Register ASHA 1 (Assigned to Chandapur)
    asha1_payload = {
        "full_name": "ASHA Anita",
        "phone": "9876533333",
        "password": "AshaPassword123",
        "assigned_villages": ["Chandapur"],
        "primary_phc": "Chandapur PHC",
    }
    status_a1, body_a1 = make_request("POST", "/api/asha/register", asha1_payload)
    if status_a1 == 400:
        status_a1, body_a1 = make_request("POST", "/api/asha/login", {"phone": "9876533333", "password": "AshaPassword123"})
    token_a1 = body_a1.get("access_token")

    # Setup: Register ASHA 2 (Assigned to Kharwadi only)
    asha2_payload = {
        "full_name": "ASHA Sunita",
        "phone": "9876544444",
        "password": "AshaPassword123",
        "assigned_villages": ["Kharwadi"],
        "primary_phc": "Kharwadi PHC",
    }
    status_a2, body_a2 = make_request("POST", "/api/asha/register", asha2_payload)
    if status_a2 == 400:
        status_a2, body_a2 = make_request("POST", "/api/asha/login", {"phone": "9876544444", "password": "AshaPassword123"})
    token_a2 = body_a2.get("access_token")

    # =========================================================================
    # 1. Patient medical information creation/update (PUT /api/patient/medical-record)
    # =========================================================================
    med_update = {
        "blood_group": "AB+",
        "allergies": ["Sulfa drugs", "Peanuts"],
        "chronic_conditions": ["Asthma"],
        "emergency_contacts": [{"name": "Sanjay Patil", "relation": "Brother", "phone": "9823099111"}],
        "medical_history": [{"date": "2026-06-15", "reason": "Seasonal asthma follow-up"}],
    }
    status, body = make_request("PUT", "/api/patient/medical-record", med_update, token=token_p1)
    passed = (status == 200 and body.get("blood_group") == "AB+" and "Asthma" in body.get("chronic_conditions", []))
    results.append({
        "category": "1. Patient Medical Info Update",
        "endpoint": "PUT /api/patient/medical-record",
        "status": status,
        "expected": 200,
        "passed": passed,
        "details": f"BloodGroup={body.get('blood_group')}, Chronic={body.get('chronic_conditions')}",
    })

    # =========================================================================
    # 2. Patient symptom submission (POST /api/patient/symptoms)
    # =========================================================================
    sym_payload = {
        "symptoms": ["Wheezing", "Shortness of breath"],
        "description": "Difficulty breathing in cold morning weather",
        "severity": "moderate",
        "duration": "today",
        "notes": "Used inhaler with partial improvement",
    }
    status, body = make_request("POST", "/api/patient/symptoms", sym_payload, token=token_p1)
    passed = (status == 201 and "symptom_id" in body and body.get("status") == "reported")
    results.append({
        "category": "2. Patient Symptom Submission",
        "endpoint": "POST /api/patient/symptoms",
        "status": status,
        "expected": 201,
        "passed": passed,
        "details": f"SymptomID={body.get('symptom_id')}, Status={body.get('status')}",
    })

    # =========================================================================
    # 3. Retrieving the patient's own records (GET /api/patient/medical-record)
    # =========================================================================
    status, body = make_request("GET", "/api/patient/medical-record", token=token_p1)
    passed = (status == 200 and body.get("patient_id") == pid_p1 and len(body.get("recent_symptoms", [])) >= 1)
    results.append({
        "category": "3. Retrieve Own Medical Record",
        "endpoint": "GET /api/patient/medical-record",
        "status": status,
        "expected": 200,
        "passed": passed,
        "details": f"PatientID={body.get('patient_id')}, RecentSymptomsCount={len(body.get('recent_symptoms', []))}",
    })

    # Also test GET /api/patient/symptoms
    status, body = make_request("GET", "/api/patient/symptoms", token=token_p1)
    passed = (status == 200 and isinstance(body, list) and len(body) >= 1)
    results.append({
        "category": "3b. Retrieve Own Symptoms List",
        "endpoint": "GET /api/patient/symptoms",
        "status": status,
        "expected": 200,
        "passed": passed,
        "details": f"SymptomsCount={len(body) if isinstance(body, list) else 0}",
    })

    # =========================================================================
    # 4. Authorized ASHA access to appropriate patient records (GET & POST)
    # =========================================================================
    # ASHA 1 (Chandapur) accessing Patient 1 (Chandapur)
    status, body = make_request("GET", f"/api/asha/patients/{pid_p1}/records", token=token_a1)
    passed = (status == 200 and body.get("full_name") == "Kavita Patil")
    results.append({
        "category": "4. Authorized ASHA Access (Read)",
        "endpoint": f"GET /api/asha/patients/{pid_p1}/records",
        "status": status,
        "expected": 200,
        "passed": passed,
        "details": f"PatientName={body.get('full_name')}, Village={body.get('village')}",
    })

    # ASHA 1 submitting symptom on behalf of Patient 1
    asha_sym_payload = {
        "symptoms": ["Mild headache"],
        "description": "Headache reported during home visit",
        "severity": "mild",
        "duration": "today",
    }
    status, body = make_request("POST", f"/api/asha/patients/{pid_p1}/symptoms", asha_sym_payload, token=token_a1)
    passed = (status == 201 and body.get("submitted_by") == "asha")
    results.append({
        "category": "4b. Authorized ASHA Symptom Submission",
        "endpoint": f"POST /api/asha/patients/{pid_p1}/symptoms",
        "status": status,
        "expected": 201,
        "passed": passed,
        "details": f"SymptomID={body.get('symptom_id')}, Submitter={body.get('submitted_by')}",
    })

    # =========================================================================
    # 5. Unauthorized access rejection (403 Forbidden)
    # =========================================================================
    # ASHA 2 (Kharwadi) trying to access Patient 1 (Chandapur) -> 403 Forbidden
    status, body = make_request("GET", f"/api/asha/patients/{pid_p1}/records", token=token_a2)
    passed = (status == 403)
    results.append({
        "category": "5. Unauthorized ASHA Access Rejection",
        "endpoint": f"GET /api/asha/patients/{pid_p1}/records (ASHA Kharwadi -> Patient Chandapur)",
        "status": status,
        "expected": 403,
        "passed": passed,
        "details": f"Detail={body.get('detail')}",
    })

    # Patient 2 trying to access Patient 1's records -> 403 Forbidden
    status, body = make_request("GET", f"/api/asha/patients/{pid_p1}/records", token=token_p2)
    passed = (status == 403)
    results.append({
        "category": "5b. Cross-Patient Access Rejection",
        "endpoint": f"GET /api/asha/patients/{pid_p1}/records (Patient 2 token)",
        "status": status,
        "expected": 403,
        "passed": passed,
        "details": f"Detail={body.get('detail')}",
    })

    # =========================================================================
    # 6. JWT authentication on protected endpoints (401 Unauthorized)
    # =========================================================================
    # Missing token on PUT /api/patient/medical-record
    status, body = make_request("PUT", "/api/patient/medical-record", med_update, token=None)
    passed = (status == 401 or status == 403)
    results.append({
        "category": "6. JWT Auth Protection (Missing Token)",
        "endpoint": "PUT /api/patient/medical-record (No Token)",
        "status": status,
        "expected": 401,
        "passed": passed,
        "details": f"Detail={body.get('detail')}",
    })

    # Missing token on POST /api/patient/symptoms
    status, body = make_request("POST", "/api/patient/symptoms", sym_payload, token=None)
    passed = (status == 401 or status == 403)
    results.append({
        "category": "6b. JWT Auth Protection (Missing Token)",
        "endpoint": "POST /api/patient/symptoms (No Token)",
        "status": status,
        "expected": 401,
        "passed": passed,
        "details": f"Detail={body.get('detail')}",
    })

    # Invalid token on GET /api/patient/medical-record
    status, body = make_request("GET", "/api/patient/medical-record", token="invalid.forged.jwt")
    passed = (status == 401)
    results.append({
        "category": "6c. JWT Auth Protection (Invalid Token)",
        "endpoint": "GET /api/patient/medical-record (Invalid Token)",
        "status": status,
        "expected": 401,
        "passed": passed,
        "details": f"Detail={body.get('detail')}",
    })

    # Print summary table
    print("\n" + "=" * 95)
    print(f"{'Category':<32} | {'Endpoint':<40} | {'Status':<6} | {'Result'}")
    print("=" * 95)
    all_passed = True
    for r in results:
        res_str = "[PASS]" if r["passed"] else "[FAIL]"
        if not r["passed"]:
            all_passed = False
        print(f"{r['category']:<32} | {r['endpoint']:<40} | {r['status']:<6} | {res_str}")
        print(f"   -> Details: {r['details']}")
    print("=" * 95)
    print("ALL LIVE SERVER TESTS PASSED!" if all_passed else "SOME TESTS FAILED!")


if __name__ == "__main__":
    run_live_tests()
