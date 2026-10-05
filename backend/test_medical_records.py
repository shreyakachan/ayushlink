import asyncio
from httpx import AsyncClient, ASGITransport
from main import app
from database import (
    get_collection,
    COLLECTION_PATIENTS,
    COLLECTION_ASHA_WORKERS,
    COLLECTION_SYMPTOMS,
    COLLECTION_NOTIFICATIONS,
    connect_to_mongo,
    close_mongo_connection,
)


async def run_tests():
    print("==================================================")
    print("  AyushLink Medical Records & Symptoms Test Suite ")
    print("==================================================")

    await connect_to_mongo()
    patients_col = get_collection(COLLECTION_PATIENTS)
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)
    symptoms_col = get_collection(COLLECTION_SYMPTOMS)
    notifs_col = get_collection(COLLECTION_NOTIFICATIONS)

    # Clean up test accounts
    phone_patient1 = "9823011111"  # Village: Chandapur
    phone_patient2 = "9823022222"  # Village: Rampur
    phone_asha_chandapur = "9876511111"  # Villages: ["Chandapur", "Nandgaon"]
    phone_asha_other = "9876522222"  # Villages: ["Kharwadi"]

    for col in [patients_col, asha_col, symptoms_col, notifs_col]:
        if col is not None:
            await col.delete_many({"phone": {"$in": [phone_patient1, phone_patient2, phone_asha_chandapur, phone_asha_other]}})

    pid_p1 = None
    pid_p2 = None
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:

            # ---------------------------------------------------------
            # Setup: Register Patient 1 (Chandapur) & Patient 2 (Rampur)
            # ---------------------------------------------------------
            print("\n[SETUP] Registering test patients and ASHA workers...")
            res_p1 = await client.post("/api/patient/register", json={
                "full_name": "TestPatient MedRec1",
                "phone": phone_patient1,
                "password": "Password123",
                "age": 29,
                "gender": "female",
                "village": "Chandapur",
                "preferred_language": "hi",
                "blood_group": "O+",
            })
            assert res_p1.status_code == 201
            p1_data = res_p1.json()
            token_p1 = p1_data["access_token"]
            pid_p1 = p1_data["patient"]["patient_id"]
            headers_p1 = {"Authorization": f"Bearer {token_p1}"}

            res_p2 = await client.post("/api/patient/register", json={
                "full_name": "TestPatient MedRec2",
                "phone": phone_patient2,
                "password": "Password123",
                "age": 45,
                "gender": "male",
                "village": "Rampur",
                "preferred_language": "en",
            })
            assert res_p2.status_code == 201
            p2_data = res_p2.json()
            token_p2 = p2_data["access_token"]
            pid_p2 = p2_data["patient"]["patient_id"]
            headers_p2 = {"Authorization": f"Bearer {token_p2}"}

            # Setup: Register ASHA 1 (Assigned to Chandapur) & ASHA 2 (Assigned to Kharwadi)
            res_a1 = await client.post("/api/asha/register", json={
                "full_name": "ASHA Suman",
                "phone": phone_asha_chandapur,
                "password": "AshaPassword123",
                "assigned_villages": ["Chandapur", "Nandgaon"],
                "primary_phc": "Chandapur PHC",
            })
            assert res_a1.status_code == 201
            token_a1 = res_a1.json()["access_token"]
            headers_a1 = {"Authorization": f"Bearer {token_a1}"}

            res_a2 = await client.post("/api/asha/register", json={
                "full_name": "ASHA Geeta",
                "phone": phone_asha_other,
                "password": "AshaPassword123",
                "assigned_villages": ["Kharwadi"],
                "primary_phc": "Kharwadi PHC",
            })
            assert res_a2.status_code == 201
            token_a2 = res_a2.json()["access_token"]
            headers_a2 = {"Authorization": f"Bearer {token_a2}"}
            print(f"[OK] Test entities created: Patient 1 ({pid_p1}, Chandapur), Patient 2 ({pid_p2}, Rampur)")

            # ---------------------------------------------------------
            # TEST 1: Update Patient's Own Medical Information
            # ---------------------------------------------------------
            print("\n[TEST 1] Patient updating own medical record (PUT /api/patient/medical-record)...")
            med_update = {
                "blood_group": "B+",
                "allergies": ["Penicillin", "Dust"],
                "chronic_conditions": ["Hypertension"],
                "emergency_contacts": [{"name": "Rajesh Kumar", "relation": "Husband", "phone": "9823055555"}],
                "medical_history": [{"date": "2026-07-10", "reason": "Viral fever checkup"}],
            }
            res_med = await client.put("/api/patient/medical-record", json=med_update, headers=headers_p1)
            assert res_med.status_code == 200, f"Expected 200, got {res_med.status_code}: {res_med.json()}"
            med_data = res_med.json()
            assert med_data["blood_group"] == "B+"
            assert "Penicillin" in med_data["allergies"]
            assert "Hypertension" in med_data["chronic_conditions"]
            assert len(med_data["emergency_contacts"]) == 1
            print(f"[OK] Patient medical record successfully updated: BloodGroup={med_data['blood_group']}, Allergies={med_data['allergies']}")

            # ---------------------------------------------------------
            # TEST 2: Submit Patient Symptoms
            # ---------------------------------------------------------
            print("\n[TEST 2] Patient submitting symptoms (POST /api/patient/symptoms)...")
            symptom_payload = {
                "symptoms": ["Fever", "Headache", "Cough"],
                "description": "Continuous high body temperature with dry cough since yesterday",
                "severity": "moderate",
                "duration": "2-3-days",
                "notes": "Took paracetamol with mild relief",
            }
            res_sym = await client.post("/api/patient/symptoms", json=symptom_payload, headers=headers_p1)
            assert res_sym.status_code == 201, f"Expected 201, got {res_sym.status_code}: {res_sym.json()}"
            sym_data = res_sym.json()
            assert sym_data["patient_id"] == pid_p1
            assert "Fever" in sym_data["symptoms"]
            assert sym_data["status"] == "reported"
            assert "recorded_at" in sym_data
            print(f"[OK] Symptom record created in MongoDB: SymptomID={sym_data['symptom_id']}, Status={sym_data['status']}")

            # Verify MongoDB storage in symptoms collection
            stored_sym = await symptoms_col.find_one({"symptom_id": sym_data["symptom_id"]})
            assert stored_sym is not None, "Symptom not found in symptoms collection"
            assert stored_sym["patient_id"] == pid_p1
            assert stored_sym["status"] == "reported"
            print(f"[OK] MongoDB 'symptoms' collection verified successfully")

            # ---------------------------------------------------------
            # TEST 3: Retrieve Patient's Own Medical Records & Symptoms
            # ---------------------------------------------------------
            print("\n[TEST 3] Patient retrieving own record (GET /api/patient/medical-record)...")
            res_rec = await client.get("/api/patient/medical-record", headers=headers_p1)
            assert res_rec.status_code == 200
            rec_data = res_rec.json()
            assert rec_data["patient_id"] == pid_p1
            assert rec_data["blood_group"] == "B+"
            assert len(rec_data["recent_symptoms"]) >= 1
            assert rec_data["recent_symptoms"][0]["description"].startswith("Continuous high")
            print(f"[OK] Retrieved medical profile + {len(rec_data['recent_symptoms'])} recent symptoms")

            # ---------------------------------------------------------
            # TEST 4: Unauthorized Access Rejection (No token or invalid token)
            # ---------------------------------------------------------
            print("\n[TEST 4] Testing Unauthorized Access Protection (401 Unauthorized)...")
            res_unauth = await client.get("/api/patient/medical-record")
            assert res_unauth.status_code == 401, f"Expected 401, got {res_unauth.status_code}"

            res_bad_tok = await client.get("/api/patient/medical-record", headers={"Authorization": "Bearer invalid.token.xyz"})
            assert res_bad_tok.status_code == 401
            print(f"[OK] Unauthenticated/Invalid token correctly rejected with 401")

            # ---------------------------------------------------------
            # TEST 5: Authorized ASHA Worker Accessing Assigned Patient Record
            # ---------------------------------------------------------
            print("\n[TEST 5] Authorized ASHA Worker (Chandapur) accessing Patient 1 (Chandapur)...")
            res_asha_p1 = await client.get(f"/api/asha/patients/{pid_p1}/records", headers=headers_a1)
            assert res_asha_p1.status_code == 200, f"Expected 200, got {res_asha_p1.status_code}: {res_asha_p1.json()}"
            assert res_asha_p1.json()["full_name"] == "TestPatient MedRec1"
            print(f"[OK] Authorized ASHA worker successfully accessed patient record for {res_asha_p1.json()['full_name']}")

            # ASHA Submitting symptom on behalf of patient
            print("\n[TEST 5b] Authorized ASHA Worker submitting symptom for patient...")
            res_asha_sym = await client.post(
                f"/api/asha/patients/{pid_p1}/symptoms",
                json={"symptoms": ["Joint pain"], "description": "Severe knee swelling", "severity": "severe"},
                headers=headers_a1,
            )
            assert res_asha_sym.status_code == 201
            assert res_asha_sym.json()["submitted_by"] == "asha"
            print(f"[OK] ASHA symptom submission succeeded on behalf of patient")

            # ---------------------------------------------------------
            # TEST 6: Unauthorized ASHA Worker Accessing Unassigned Patient (403 Forbidden)
            # ---------------------------------------------------------
            print("\n[TEST 6] Unauthorized ASHA Worker (Kharwadi) accessing Patient 1 (Chandapur)...")
            res_forbidden = await client.get(f"/api/asha/patients/{pid_p1}/records", headers=headers_a2)
            assert res_forbidden.status_code == 403, f"Expected 403 Forbidden, got {res_forbidden.status_code}"
            print(f"[OK] Unauthorized ASHA worker blocked with 403: {res_forbidden.json()['detail']}")

            # ---------------------------------------------------------
            # TEST 7: Patient attempting to access another patient's record (403 Forbidden)
            # ---------------------------------------------------------
            print("\n[TEST 7] Patient 2 attempting to access Patient 1's records...")
            res_p2_on_p1 = await client.get(f"/api/asha/patients/{pid_p1}/records", headers=headers_p2)
            assert res_p2_on_p1.status_code == 403
            print(f"[OK] Patient access to other patient records blocked with 403 Forbidden")

    finally:
        # Cleanup
        for col in [patients_col, asha_col, symptoms_col, notifs_col]:
            if col is not None:
                await col.delete_many({"phone": {"$in": [phone_patient1, phone_patient2, phone_asha_chandapur, phone_asha_other]}})
                if pid_p1 or pid_p2:
                    await col.delete_many({"patient_id": {"$in": [p for p in [pid_p1, pid_p2] if p]}})

        await close_mongo_connection()

    print("\n==================================================")
    print(" ALL MEDICAL RECORDS & SYMPTOMS TESTS PASSED!     ")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(run_tests())
