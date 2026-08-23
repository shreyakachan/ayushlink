import asyncio
from httpx import AsyncClient, ASGITransport
from main import app
from database import (
    get_collection,
    COLLECTION_DOCTORS,
    COLLECTION_PATIENTS,
    COLLECTION_SYMPTOMS,
    COLLECTION_ASHA_WORKERS,
    connect_to_mongo,
    close_mongo_connection,
)
from services.security import decode_access_token


async def run_tests():
    print("==================================================")
    print("      AyushLink Doctor Backend Test Suite         ")
    print("==================================================")

    await connect_to_mongo()
    doctors_col = get_collection(COLLECTION_DOCTORS)
    patients_col = get_collection(COLLECTION_PATIENTS)
    symptoms_col = get_collection(COLLECTION_SYMPTOMS)
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)

    # Test numbers
    phone_doctor = "9823000001"
    phone_patient = "9823055555"
    phone_asha = "9876555555"

    for col in [doctors_col, patients_col, symptoms_col, asha_col]:
        if col is not None:
            await col.delete_many({"phone": {"$in": [phone_doctor, phone_patient, phone_asha]}})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:

        # ---------------------------------------------------------
        # TEST 1: Doctor Registration API (POST /api/doctor/register)
        # ---------------------------------------------------------
        print("\n[TEST 1] Testing Doctor Registration API (POST /api/doctor/register)...")
        reg_payload = {
            "full_name": "Dr. Anjali Rao",
            "phone": "+91 98230 00001",
            "password": "DoctorSecurePass123",
            "email": "dr.anjali@ayushlink.in",
            "specialization": "General Physician",
            "qualification": "MBBS, MD",
            "registration_number": "MCI-2024-9988",
            "assigned_facility": "District Hospital Pune",
            "preferred_language": "en",
            "is_on_duty": True,
        }
        res_doc = await client.post("/api/doctor/register", json=reg_payload)
        print(f"Status Code: {res_doc.status_code}")
        assert res_doc.status_code == 201, f"Expected 201, got {res_doc.status_code}: {res_doc.json()}"
        doc_data = res_doc.json()

        assert "access_token" in doc_data
        assert doc_data["token_type"] == "bearer"
        assert doc_data["doctor"]["full_name"] == "Dr. Anjali Rao"
        assert doc_data["doctor"]["specialization"] == "General Physician"
        assert "password" not in doc_data["doctor"]
        assert "hashed_password" not in doc_data["doctor"]
        doc_id = doc_data["doctor"]["doctor_id"]
        token_doc = doc_data["access_token"]
        headers_doc = {"Authorization": f"Bearer {token_doc}"}
        print(f"[OK] Doctor registered successfully: ID={doc_id}")

        # Verify JWT Token content
        token_payload = decode_access_token(token_doc)
        assert token_payload is not None
        assert token_payload["role"] == "doctor"
        assert token_payload["phone"] == phone_doctor
        print(f"[OK] JWT Token verified: role={token_payload['role']}, sub={token_payload['sub']}")

        # Verify MongoDB storage in doctors collection
        stored_doc = await doctors_col.find_one({"phone": phone_doctor})
        assert stored_doc is not None
        assert stored_doc["hashed_password"] != "DoctorSecurePass123"
        assert stored_doc["hashed_password"].startswith("$2b$") or stored_doc["hashed_password"].startswith("$2a$")
        print(f"[OK] MongoDB 'doctors' collection verified: Bcrypt hash confirmed ({stored_doc['hashed_password'][:15]}...)")

        # ---------------------------------------------------------
        # TEST 2: Doctor Login API (POST /api/doctor/login)
        # ---------------------------------------------------------
        print("\n[TEST 2] Testing Doctor Login API (POST /api/doctor/login)...")
        login_payload = {
            "phone": "9823000001",
            "password": "DoctorSecurePass123",
        }
        res_login = await client.post("/api/doctor/login", json=login_payload)
        assert res_login.status_code == 200, f"Expected 200, got {res_login.status_code}: {res_login.json()}"
        login_data = res_login.json()
        assert "access_token" in login_data
        assert login_data["doctor"]["doctor_id"] == doc_id
        print(f"[OK] Doctor login successful! Token received for {login_data['doctor']['full_name']}")

        # Wrong password rejection
        res_wrong = await client.post("/api/doctor/login", json={"phone": "9823000001", "password": "WrongPassword"})
        assert res_wrong.status_code == 401
        print(f"[OK] Wrong password rejected with 401")

        # ---------------------------------------------------------
        # Setup: Create a Patient and submit symptoms for testing
        # ---------------------------------------------------------
        print("\n[SETUP] Creating Patient with symptoms for consultation queue...")
        res_p = await client.post("/api/patient/register", json={
            "full_name": "Sunita Devi",
            "phone": phone_patient,
            "password": "Password123",
            "age": 34,
            "gender": "female",
            "village": "Chandapur",
            "blood_group": "B+",
            "allergies": ["Penicillin"],
            "chronic_conditions": ["Type 2 Diabetes"],
        })
        assert res_p.status_code == 201
        p_data = res_p.json()
        pid = p_data["patient"]["patient_id"]
        token_patient = p_data["access_token"]
        headers_patient = {"Authorization": f"Bearer {token_patient}"}

        # Submit symptoms for the patient
        res_sym = await client.post(
            "/api/patient/symptoms",
            json={
                "symptoms": ["High Fever", "Chills", "Body ache"],
                "description": "High fever exceeding 102F since 3 days with intense shivering",
                "severity": "severe",
                "duration": "2-3-days",
            },
            headers=headers_patient,
        )
        assert res_sym.status_code == 201
        print(f"[OK] Patient {pid} created with severe fever symptoms")

        # Setup: Create an ASHA Worker for RBAC testing
        res_a = await client.post("/api/asha/register", json={
            "full_name": "ASHA Rani",
            "phone": phone_asha,
            "password": "AshaPassword123",
            "assigned_villages": ["Chandapur"],
        })
        assert res_a.status_code == 201
        token_asha = res_a.json()["access_token"]
        headers_asha = {"Authorization": f"Bearer {token_asha}"}

        # ---------------------------------------------------------
        # TEST 3: Doctor Viewing Assigned Cases / Queue (GET /api/doctor/cases)
        # ---------------------------------------------------------
        print("\n[TEST 3] Testing Doctor Consultation Cases (GET /api/doctor/cases)...")
        res_cases = await client.get("/api/doctor/cases", headers=headers_doc)
        assert res_cases.status_code == 200, f"Expected 200, got {res_cases.status_code}: {res_cases.json()}"
        cases = res_cases.json()
        assert isinstance(cases, list)
        assert len(cases) >= 1
        matched_case = next((c for c in cases if c["patient_id"] == pid), None)
        assert matched_case is not None, f"Patient {pid} not found in doctor's cases queue"
        assert matched_case["full_name"] == "Sunita Devi"
        assert len(matched_case["recent_symptoms"]) >= 1
        print(f"[OK] Doctor cases retrieved: {len(cases)} case(s) found. Target case verified with {len(matched_case['recent_symptoms'])} symptom(s)")

        # ---------------------------------------------------------
        # TEST 4: Doctor Viewing Patient Medical History & Symptoms (GET /api/doctor/patients/{id}/records)
        # ---------------------------------------------------------
        print("\n[TEST 4] Testing Doctor View Patient Medical History (GET /api/doctor/patients/{id}/records)...")
        res_rec = await client.get(f"/api/doctor/patients/{pid}/records", headers=headers_doc)
        assert res_rec.status_code == 200, f"Expected 200, got {res_rec.status_code}: {res_rec.json()}"
        rec_data = res_rec.json()
        assert rec_data["patient_id"] == pid
        assert rec_data["full_name"] == "Sunita Devi"
        assert rec_data["blood_group"] == "B+"
        assert "Type 2 Diabetes" in rec_data["chronic_conditions"]
        assert len(rec_data["recent_symptoms"]) >= 1
        assert rec_data["recent_symptoms"][0]["description"].startswith("High fever exceeding")
        print(f"[OK] Complete medical history & symptoms retrieved for {rec_data['full_name']} (BloodGroup={rec_data['blood_group']}, Conditions={rec_data['chronic_conditions']})")

        # ---------------------------------------------------------
        # TEST 5: Doctor Assigning Case (POST /api/doctor/cases/{id}/assign)
        # ---------------------------------------------------------
        print("\n[TEST 5] Testing Doctor Assigning Case (POST /api/doctor/cases/{id}/assign)...")
        res_assign = await client.post(f"/api/doctor/cases/{pid}/assign", headers=headers_doc)
        assert res_assign.status_code == 200, f"Expected 200, got {res_assign.status_code}: {res_assign.json()}"
        assign_data = res_assign.json()
        assert assign_data["assigned_doctor_id"] == doc_id
        print(f"[OK] Patient {pid} assigned to Doctor {doc_id}")

        # ---------------------------------------------------------
        # TEST 6: Role-Based Authorization Rejection for Non-Doctors (403 Forbidden)
        # ---------------------------------------------------------
        print("\n[TEST 6] Testing Role-Based Authorization Rejections (403 Forbidden)...")

        # Patient attempting to access doctor-only cases endpoint
        res_p_blocked = await client.get("/api/doctor/cases", headers=headers_patient)
        assert res_p_blocked.status_code == 403, f"Expected 403, got {res_p_blocked.status_code}"
        print(f"[OK] Patient blocked from doctor-only cases with 403: {res_p_blocked.json()['detail']}")

        # ASHA worker attempting to access doctor-only cases endpoint
        res_a_blocked = await client.get("/api/doctor/cases", headers=headers_asha)
        assert res_a_blocked.status_code == 403, f"Expected 403, got {res_a_blocked.status_code}"
        print(f"[OK] ASHA worker blocked from doctor-only cases with 403: {res_a_blocked.json()['detail']}")

        # Patient attempting to access doctor-only patient records endpoint
        res_p_rec_blocked = await client.get(f"/api/doctor/patients/{pid}/records", headers=headers_patient)
        assert res_p_rec_blocked.status_code == 403
        print(f"[OK] Patient blocked from doctor patient records endpoint with 403")

        # ASHA worker attempting to access doctor-only patient records endpoint
        res_a_rec_blocked = await client.get(f"/api/doctor/patients/{pid}/records", headers=headers_asha)
        assert res_a_rec_blocked.status_code == 403
        print(f"[OK] ASHA worker blocked from doctor patient records endpoint with 403")

        # Unauthenticated request (no token)
        res_unauth = await client.get("/api/doctor/cases")
        assert res_unauth.status_code == 401
        print(f"[OK] Unauthenticated request rejected with 401 Unauthorized")

    # Clean up test accounts
    for col in [doctors_col, patients_col, symptoms_col, asha_col]:
        if col is not None:
            await col.delete_many({"phone": {"$in": [phone_doctor, phone_patient, phone_asha]}})
            await col.delete_many({"patient_id": pid})

    await close_mongo_connection()
    print("\n==================================================")
    print("       ALL DOCTOR BACKEND TESTS PASSED!           ")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(run_tests())
