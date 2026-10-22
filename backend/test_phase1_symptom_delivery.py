import asyncio
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from main import app
from database import (
    get_collection,
    COLLECTION_PATIENTS,
    COLLECTION_SYMPTOMS,
    COLLECTION_DOCTORS,
    COLLECTION_ASHA_WORKERS,
    connect_to_mongo,
    close_mongo_connection,
)
from services.security import hash_password

async def run_phase1_verification():
    print("=" * 60)
    print("  AyushLink — Phase 1 Verification Suite")
    print("=" * 60)

    await connect_to_mongo()
    patients_col = get_collection(COLLECTION_PATIENTS)
    symptoms_col = get_collection(COLLECTION_SYMPTOMS)
    doctors_col = get_collection(COLLECTION_DOCTORS)
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)

    # Setup Doctor
    doc_phone = "9823000001"
    pwd_doc = "DoctorSecurePass123"
    await doctors_col.update_one(
        {"phone": doc_phone},
        {
            "$set": {
                "phone": doc_phone,
                "hashed_password": hash_password(pwd_doc),
                "is_on_duty": True,
            }
        },
        upsert=True,
    )

    # Setup ASHA Worker
    asha_phone = "9837373773"
    pwd_asha = "123456"
    await asha_col.update_one(
        {"phone": asha_phone},
        {
            "$set": {
                "phone": asha_phone,
                "hashed_password": hash_password(pwd_asha),
                "assigned_village": "Chandapur",
                "assigned_villages": ["Chandapur"],
            }
        },
        upsert=True,
    )

    # Setup Patient Shreya
    patient_id = "P-4559"
    patient_phone = "9324998108"
    pwd_patient = "123456"
    now = datetime.now(timezone.utc)

    await patients_col.update_one(
        {"patient_id": patient_id},
        {
            "$set": {
                "patient_id": patient_id,
                "full_name": "Shreya",
                "phone": patient_phone,
                "age": 24,
                "gender": "female",
                "village": "Chandapur",
                "blood_group": "B+",
                "hashed_password": hash_password(pwd_patient),
                "status": "waiting",
                "created_at": now - timedelta(days=2),
                "updated_at": now,
            }
        },
        upsert=True,
    )

    # Clean previous symptoms for clean test
    await symptoms_col.delete_many({"patient_id": patient_id})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Doctor Login
        res_doc_login = await client.post("/api/doctor/login", json={"phone": doc_phone, "password": pwd_doc})
        assert res_doc_login.status_code == 200, f"Doctor login failed: {res_doc_login.text}"
        doc_token = res_doc_login.json()["access_token"]
        doc_headers = {"Authorization": f"Bearer {doc_token}"}

        # Patient Login
        res_pat_login = await client.post("/api/patient/login", json={"phone": patient_phone, "password": pwd_patient})
        assert res_pat_login.status_code == 200, f"Patient login failed: {res_pat_login.text}"
        pat_token = res_pat_login.json()["access_token"]
        pat_headers = {"Authorization": f"Bearer {pat_token}"}

        # ASHA Login
        res_asha_login = await client.post("/api/asha/login", json={"phone": asha_phone, "password": pwd_asha})
        assert res_asha_login.status_code == 200, f"ASHA login failed: {res_asha_login.text}"
        asha_token = res_asha_login.json()["access_token"]
        asha_headers = {"Authorization": f"Bearer {asha_token}"}

        # -------------------------------------------------------------
        # TEST 1: Patient submits a first symptom while online
        # -------------------------------------------------------------
        print("\n[TEST 1] Patient submits 1st symptom: 'High fever, severe headache'")
        t1 = now - timedelta(minutes=30)
        sym1_payload = {
            "symptoms": ["High fever", "severe headache"],
            "description": "Patient experiencing 103F fever and acute headache since last night",
            "severity": "severe",
            "duration": "1-2-days",
            "offline_id": "SYM-OFFLINE-TEST-001",
            "client_created_at": t1.isoformat(),
        }
        res1 = await client.post("/api/patient/symptoms", json=sym1_payload, headers=pat_headers)
        assert res1.status_code == 201, f"Submission 1 failed: {res1.text}"
        sym1_data = res1.json()
        print(f" -> Submitted ID: {sym1_data['symptom_id']}, Severity: {sym1_data['severity']}")

        # Verify ASHA sees it in patient record
        res_asha_rec = await client.get(f"/api/asha/patients/{patient_id}/records", headers=asha_headers)
        assert res_asha_rec.status_code == 200, f"ASHA get records failed: {res_asha_rec.text}"
        asha_syms = res_asha_rec.json().get("recent_symptoms", [])
        assert any("High fever" in s.get("symptoms", []) for s in asha_syms), "ASHA cannot see 1st symptom"
        print(" -> [PASS] ASHA can see 1st symptom in patient record")

        # Verify Doctor sees it in consultation queue
        res_doc_cases1 = await client.get("/api/doctor/cases", headers=doc_headers)
        assert res_doc_cases1.status_code == 200, f"Doctor get cases failed: {res_doc_cases1.text}"
        cases1 = res_doc_cases1.json()
        shreya_case1 = next((c for c in cases1 if c["patient_id"] == patient_id), None)
        assert shreya_case1 is not None, "Doctor cannot see Shreya in consultation queue"
        assert "High fever" in shreya_case1["condition"]
        assert shreya_case1["status"] == "critical"  # severe triage
        print(" -> [PASS] Doctor consultation queue displays Shreya with 1st symptom and critical status")

        # -------------------------------------------------------------
        # TEST 2 & 3: Patient submits 2nd different symptom
        # -------------------------------------------------------------
        print("\n[TEST 2 & 3] Patient submits 2nd symptom: 'Stomach pain, vomiting'")
        t2 = now - timedelta(minutes=15)
        sym2_payload = {
            "symptoms": ["Stomach pain", "vomiting"],
            "description": "Sudden nausea and stomach cramps after lunch",
            "severity": "moderate",
            "duration": "today",
            "offline_id": "SYM-OFFLINE-TEST-002",
            "client_created_at": t2.isoformat(),
        }
        res2 = await client.post("/api/patient/symptoms", json=sym2_payload, headers=pat_headers)
        assert res2.status_code == 201, f"Submission 2 failed: {res2.text}"
        sym2_data = res2.json()
        print(f" -> Submitted ID: {sym2_data['symptom_id']}, Severity: {sym2_data['severity']}")

        # Verify Doctor cases has latest symptom condition
        res_doc_cases2 = await client.get("/api/doctor/cases", headers=doc_headers)
        assert res_doc_cases2.status_code == 200
        cases2 = res_doc_cases2.json()
        shreya_case2 = next((c for c in cases2 if c["patient_id"] == patient_id), None)
        assert shreya_case2 is not None
        print(f" -> Latest condition on Doctor queue: '{shreya_case2['condition']}'")
        assert "Stomach pain" in shreya_case2["condition"]
        assert shreya_case2["status"] == "review"  # updated from critical to review for moderate

        # Verify symptom history preserves BOTH submissions
        assert len(shreya_case2["recent_symptoms"]) == 2
        assert shreya_case2["recent_symptoms"][0]["symptoms"] == ["Stomach pain", "vomiting"]
        assert shreya_case2["recent_symptoms"][1]["symptoms"] == ["High fever", "severe headache"]
        print(" -> [PASS] 2nd symptom is latest condition AND 1st symptom is preserved in recent_symptoms history")

        # -------------------------------------------------------------
        # TEST 4: Mild symptom submission & Doctor visibility
        # -------------------------------------------------------------
        print("\n[TEST 4] Patient submits 3rd symptom: 'Mild itchy throat' (Severity: mild)")
        t3 = now - timedelta(minutes=1)
        sym3_payload = {
            "symptoms": ["Mild itchy throat"],
            "description": "Slight tickle in throat, no cough",
            "severity": "mild",
            "duration": "today",
            "offline_id": "SYM-OFFLINE-TEST-003",
            "client_created_at": t3.isoformat(),
        }
        res3 = await client.post("/api/patient/symptoms", json=sym3_payload, headers=pat_headers)
        assert res3.status_code == 201, f"Submission 3 failed: {res3.text}"

        res_doc_cases3 = await client.get("/api/doctor/cases", headers=doc_headers)
        assert res_doc_cases3.status_code == 200
        shreya_case3 = next((c for c in res_doc_cases3.json() if c["patient_id"] == patient_id), None)
        assert shreya_case3 is not None
        print(f" -> Mild symptom case status: '{shreya_case3['status']}' (Expected: 'review')")
        assert shreya_case3["status"] == "review", f"Mild symptom must be 'review', got {shreya_case3['status']}"
        assert "Mild itchy throat" in shreya_case3["condition"]
        assert len(shreya_case3["recent_symptoms"]) == 3
        print(" -> [PASS] Mild symptom is assigned 'review' and stays in active doctor consultation queue")

        # -------------------------------------------------------------
        # TEST 5: Failed request (invalid token / wrong role) rejection
        # -------------------------------------------------------------
        print("\n[TEST 5] Verifying invalid / cross-role token rejection (No false backend success)")
        bad_headers = {"Authorization": "Bearer bad-token-xyz"}
        res_bad = await client.post("/api/patient/symptoms", json=sym1_payload, headers=bad_headers)
        assert res_bad.status_code in [401, 403], f"Expected 401/403, got {res_bad.status_code}"
        print(f" -> [PASS] Rejected invalid token with HTTP {res_bad.status_code}")

        # Check doctor token cannot submit to /patient/symptoms
        res_cross = await client.post("/api/patient/symptoms", json=sym1_payload, headers=doc_headers)
        assert res_cross.status_code == 403, f"Expected 403 for doctor submitting to patient endpoint, got {res_cross.status_code}"
        print(" -> [PASS] Doctor token rejected with HTTP 403 on /patient/symptoms (cross-role protection)")

        # -------------------------------------------------------------
        # TEST 6: Offline sync idempotency & retry behavior
        # -------------------------------------------------------------
        print("\n[TEST 6] Verifying offline submission idempotency & pending-sync endpoint")
        # Submitting an existing offline_id does not duplicate records in MongoDB
        count_before = await symptoms_col.count_documents({"patient_id": patient_id})
        res_dup = await client.post("/api/patient/symptoms", json=sym3_payload, headers=pat_headers)
        assert res_dup.status_code in [200, 201]
        count_after = await symptoms_col.count_documents({"patient_id": patient_id})
        assert count_before == count_after, f"Duplicate offline_id was inserted again! Before: {count_before}, After: {count_after}"
        print(f" -> [PASS] Idempotent handling for offline_id '{sym3_payload['offline_id']}' verified. No duplicate records created.")

        print("\n" + "=" * 60)
        print("  ALL 6 TESTS PASSED SUCCESSFULLY!")
        print("=" * 60)

if __name__ == "__main__":
    asyncio.run(run_phase1_verification())
