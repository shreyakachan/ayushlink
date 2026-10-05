"""
Comprehensive E2E Verification of Patient-to-ASHA Workflow, Persistent Symptom Submission,
ASHA Authentication, Real Case Retrieval, and MongoDB State.
"""

import sys
import os
import asyncio
import httpx
from datetime import datetime, timezone

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(__file__))

from main import app
from database import (
    get_database,
    get_collection,
    COLLECTION_PATIENTS,
    COLLECTION_SYMPTOMS,
    COLLECTION_ASHA_WORKERS,
    connect_to_mongo,
    close_mongo_connection,
)

BASE_URL = "http://test"

results = []

def record(name, status, status_code, details=""):
    results.append({
        "test": name,
        "status": status,
        "status_code": status_code,
        "details": details,
    })
    badge = "[PASS]" if status == "PASS" else "[FAIL]"
    print(f"{badge} | [{status_code}] {name} : {details}")


async def run_tests():
    print("=" * 80)
    print("AYUSHLINK PATIENT-TO-ASHA WORKFLOW & PERSISTENCE VERIFICATION")
    print("=" * 80)

    await connect_to_mongo()

    patients_col = get_collection(COLLECTION_PATIENTS)
    symptoms_col = get_collection(COLLECTION_SYMPTOMS)
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)

    phone_patient = "9999900055"
    phone_asha = "9823088881"

    # Clean previous test entries
    if patients_col is not None:
        await patients_col.delete_many({"phone": phone_patient})
    if asha_col is not None:
        await asha_col.delete_many({"phone": phone_asha})

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=BASE_URL) as client:
        # 1. Register a fresh test patient
        patient_reg_payload = {
            "full_name": "Test Workflow Patient",
            "phone": phone_patient,
            "password": "Password123",
            "age": 28,
            "gender": "female",
            "village": "Chandapur",
            "blood_group": "B+",
            "preferred_language": "mr",
        }

        reg_res = await client.post("/api/patient/register", json=patient_reg_payload)
        if reg_res.status_code == 201:
            patient_token = reg_res.json()["access_token"]
            patient_id = reg_res.json()["patient"]["patient_id"]
            record("1. Patient Registration & Auth", "PASS", reg_res.status_code, f"Patient {patient_id} ({patient_reg_payload['full_name']}) registered")
        else:
            record("1. Patient Registration & Auth", "FAIL", reg_res.status_code, reg_res.text)
            return

        patient_headers = {"Authorization": f"Bearer {patient_token}"}

        # 2. Patient submits symptoms while online
        offline_id = f"SYM-OFFLINE-{int(datetime.now(timezone.utc).timestamp())}"
        now_iso = datetime.now(timezone.utc).isoformat()
        symptom_payload = {
            "symptoms": ["Fever", "headache", "weakness"],
            "description": "Fever, headache and weakness for 2 days",
            "severity": "moderate",
            "duration": "2 days",
            "offline_id": offline_id,
            "client_created_at": now_iso,
        }
        sym_res = await client.post("/api/patient/symptoms", json=symptom_payload, headers=patient_headers)
        if sym_res.status_code in [200, 201]:
            sym_data = sym_res.json()
            record("2. Patient Symptom Submission", "PASS", sym_res.status_code, f"Symptom ID: {sym_data.get('symptom_id')}, symptoms: {sym_data.get('symptoms')}")
        else:
            record("2. Patient Symptom Submission", "FAIL", sym_res.status_code, sym_res.text)

        # 3. Direct MongoDB Symptoms Collection Verification
        sym_in_db = await symptoms_col.find_one({"offline_id": offline_id})
        if sym_in_db and sym_in_db.get("description") == "Fever, headache and weakness for 2 days":
            record("3. MongoDB Symptoms Collection Persistence", "PASS", 200, f"Found in MongoDB with patient_id={sym_in_db.get('patient_id')}, offline_id={offline_id}")
        else:
            record("3. MongoDB Symptoms Collection Persistence", "FAIL", 500, "Record not found in DB")

        # 4. Check Patient Condition Summary Updated in MongoDB
        patient_in_db = await patients_col.find_one({"patient_id": patient_id})
        if patient_in_db and "Fever" in (patient_in_db.get("condition") or ""):
            record("4. MongoDB Patients Collection Live Update", "PASS", 200, f"Patient condition: '{patient_in_db.get('condition')}', status: '{patient_in_db.get('status')}'")
        else:
            record("4. MongoDB Patients Collection Live Update", "FAIL", 500, f"Condition: {patient_in_db.get('condition') if patient_in_db else None}")

        # 5. Idempotent Retry of Symptom Submission
        retry_res = await client.post("/api/patient/symptoms", json=symptom_payload, headers=patient_headers)
        if retry_res.status_code in [200, 201]:
            sym_count = await symptoms_col.count_documents({"offline_id": offline_id})
            if sym_count == 1:
                record("5. Idempotency & Deduplication Check", "PASS", retry_res.status_code, f"Exact 1 document in DB after repeated sync attempt")
            else:
                record("5. Idempotency & Deduplication Check", "FAIL", 500, f"Duplicate count = {sym_count}")
        else:
            record("5. Idempotency & Deduplication Check", "FAIL", retry_res.status_code, retry_res.text)

        # 6. ASHA Worker Registration & Auth
        asha_reg_payload = {
            "full_name": "Meena Ingle",
            "phone": phone_asha,
            "password": "AshaPassword123",
            "assigned_villages": ["Chandapur", "Nandgaon"],
            "primary_phc": "Chandapur PHC",
            "preferred_language": "mr",
        }
        asha_reg_res = await client.post("/api/asha/register", json=asha_reg_payload)
        if asha_reg_res.status_code == 201:
            asha_token = asha_reg_res.json()["access_token"]
            worker_id = asha_reg_res.json()["asha_worker"]["worker_id"]
            record("6. ASHA Worker Registration & JWT Auth", "PASS", asha_reg_res.status_code, f"Worker {worker_id} ({asha_reg_payload['full_name']}) registered")
        else:
            record("6. ASHA Worker Registration & JWT Auth", "FAIL", asha_reg_res.status_code, asha_reg_res.text)
            return

        asha_headers = {"Authorization": f"Bearer {asha_token}"}

        # 7. ASHA Worker fetches live cases (GET /api/asha/cases)
        cases_res = await client.get("/api/asha/cases", headers=asha_headers)
        if cases_res.status_code == 200:
            cases = cases_res.json()
            test_case = next((c for c in cases if c.get("patient_id") == patient_id), None)
            if test_case and "Fever" in str(test_case.get("symptoms")):
                record("7. ASHA Dashboard Cases Feed Reflects Submission", "PASS", 200, f"Test case found: symptoms={test_case.get('symptoms')}, village={test_case.get('village')}")
            else:
                record("7. ASHA Dashboard Cases Feed Reflects Submission", "FAIL", 200, f"Case not found in feed: {cases}")
        else:
            record("7. ASHA Dashboard Cases Feed Reflects Submission", "FAIL", cases_res.status_code, cases_res.text)

        # 8. ASHA Worker fetches Patient Medical Record (GET /api/asha/patients/{patient_id}/records)
        record_res = await client.get(f"/api/asha/patients/{patient_id}/records", headers=asha_headers)
        if record_res.status_code == 200:
            rec = record_res.json()
            recent_syms = rec.get("recent_symptoms", [])
            match = next((s for s in recent_syms if s.get("offline_id") == offline_id or "Fever" in str(s.get("symptoms"))), None)
            if match:
                record("8. ASHA Patient Medical Record Matches Live Symptoms", "PASS", 200, f"Found {len(recent_syms)} symptom log(s), severity: {match.get('severity')}")
            else:
                record("8. ASHA Patient Medical Record Matches Live Symptoms", "FAIL", 200, "Symptom not present in patient record")
        else:
            record("8. ASHA Patient Medical Record Matches Live Symptoms", "FAIL", record_res.status_code, record_res.text)

        # 9. Unauthorized Access Rejection
        unauth_cases = await client.get("/api/asha/cases")
        unauth_records = await client.get(f"/api/asha/patients/{patient_id}/records")
        if unauth_cases.status_code in [401, 403] and unauth_records.status_code in [401, 403]:
            record("9. Unauthorized Access Rejection (No JWT)", "PASS", 401, "Protected endpoints correctly reject unauthenticated requests")
        else:
            record("9. Unauthorized Access Rejection (No JWT)", "FAIL", unauth_cases.status_code, "Failed to reject unauthorized request")

        # Cleanup test entries
        if patients_col is not None:
            await patients_col.delete_many({"phone": phone_patient})
        if symptoms_col is not None:
            await symptoms_col.delete_many({"patient_id": patient_id})
        if asha_col is not None:
            await asha_col.delete_many({"phone": phone_asha})

    await close_mongo_connection()

    print("=" * 80)
    print("TEST SUMMARY:")
    passed = sum(1 for r in results if r["status"] == "PASS")
    total = len(results)
    print(f"Total Tests: {total} | Passed: {passed} | Failed: {total - passed}")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(run_tests())
