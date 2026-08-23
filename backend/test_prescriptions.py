import asyncio
from httpx import AsyncClient, ASGITransport
from main import app
from database import (
    get_collection,
    COLLECTION_PRESCRIPTIONS,
    COLLECTION_PATIENTS,
    COLLECTION_DOCTORS,
    COLLECTION_ASHA_WORKERS,
    connect_to_mongo,
    close_mongo_connection,
)


async def run_tests():
    print("==================================================")
    print("   AyushLink Digital Prescriptions Test Suite     ")
    print("==================================================")

    await connect_to_mongo()
    rx_col = get_collection(COLLECTION_PRESCRIPTIONS)
    patients_col = get_collection(COLLECTION_PATIENTS)
    doctors_col = get_collection(COLLECTION_DOCTORS)
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)

    # Test phone numbers
    phone_doctor = "9823099901"
    phone_patient_chandapur = "9823099902"
    phone_asha_chandapur = "9876599901"
    phone_asha_kharwadi = "9876599902"

    for col in [rx_col, patients_col, doctors_col, asha_col]:
        if col is not None:
            await col.delete_many({"phone": {"$in": [phone_doctor, phone_patient_chandapur, phone_asha_chandapur, phone_asha_kharwadi]}})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:

        # ---------------------------------------------------------
        # SETUP: Register Doctor, Patient, and ASHA Workers
        # ---------------------------------------------------------
        print("\n[SETUP] Registering test Doctor, Patient, and ASHA workers...")

        # 1. Register Doctor
        res_doc = await client.post("/api/doctor/register", json={
            "full_name": "Dr. Anjali Rao",
            "phone": phone_doctor,
            "password": "DocPassword123",
            "specialization": "General Physician",
            "qualification": "MBBS, MD",
            "assigned_facility": "Chandapur PHC",
        })
        assert res_doc.status_code == 201
        doc_data = res_doc.json()
        token_doc = doc_data["access_token"]
        doc_id = doc_data["doctor"]["doctor_id"]
        headers_doc = {"Authorization": f"Bearer {token_doc}"}

        # 2. Register Patient (Chandapur)
        res_pat = await client.post("/api/patient/register", json={
            "full_name": "Sunita Devi",
            "phone": phone_patient_chandapur,
            "password": "PatPassword123",
            "age": 34,
            "gender": "female",
            "village": "Chandapur",
            "blood_group": "B+",
        })
        assert res_pat.status_code == 201
        pat_data = res_pat.json()
        token_pat = pat_data["access_token"]
        pid = pat_data["patient"]["patient_id"]
        headers_pat = {"Authorization": f"Bearer {token_pat}"}

        # 3. Register ASHA 1 (Assigned to Chandapur)
        res_a1 = await client.post("/api/asha/register", json={
            "full_name": "ASHA Pooja",
            "phone": phone_asha_chandapur,
            "password": "AshaPassword123",
            "assigned_villages": ["Chandapur", "Nandgaon"],
        })
        assert res_a1.status_code == 201
        token_a1 = res_a1.json()["access_token"]
        headers_a1 = {"Authorization": f"Bearer {token_a1}"}

        # 4. Register ASHA 2 (Assigned to Kharwadi only)
        res_a2 = await client.post("/api/asha/register", json={
            "full_name": "ASHA Rekha",
            "phone": phone_asha_kharwadi,
            "password": "AshaPassword123",
            "assigned_villages": ["Kharwadi"],
        })
        assert res_a2.status_code == 201
        token_a2 = res_a2.json()["access_token"]
        headers_a2 = {"Authorization": f"Bearer {token_a2}"}
        print(f"[OK] Setup complete: Doctor {doc_id}, Patient {pid} (Chandapur), ASHA Chandapur, ASHA Kharwadi")

        # ---------------------------------------------------------
        # TEST 1: Doctor Creates Digital Prescription (POST /api/doctor/prescriptions)
        # ---------------------------------------------------------
        print("\n[TEST 1] Testing Doctor Creation of Prescription (POST /api/doctor/prescriptions)...")
        rx_payload = {
            "patient_id": pid,
            "diagnosis": "Viral fever with mild dehydration",
            "medicines": [
                {
                    "name": "Paracetamol 650mg",
                    "dosage": "1 tablet",
                    "frequency": "Twice daily after food",
                    "duration": "5 days",
                    "instructions": "Take with water",
                },
                {
                    "name": "ORS Sachet",
                    "dosage": "1 sachet in 1 liter water",
                    "frequency": "After every loose motion",
                    "duration": "3 days",
                    "instructions": "Drink throughout the day",
                },
            ],
            "instructions": "Drink plenty of fluids and rest. Return to clinic if fever persists over 3 days.",
            "status": "active",
        }
        res_create_rx = await client.post("/api/doctor/prescriptions", json=rx_payload, headers=headers_doc)
        print(f"Status Code: {res_create_rx.status_code}")
        assert res_create_rx.status_code == 201, f"Expected 201, got {res_create_rx.status_code}: {res_create_rx.json()}"
        rx_data = res_create_rx.json()

        assert "prescription_id" in rx_data
        assert rx_data["patient_id"] == pid
        assert rx_data["doctor_id"] == doc_id
        assert rx_data["doctor_name"] == "Dr. Anjali Rao"
        assert len(rx_data["medicines"]) == 2
        assert rx_data["medicines"][0]["name"] == "Paracetamol 650mg"
        assert rx_data["medicines"][0]["frequency"] == "Twice daily after food"
        assert rx_data["medicines"][0]["duration"] == "5 days"
        assert rx_data["status"] == "active"
        rx_id = rx_data["prescription_id"]
        print(f"[OK] Prescription created successfully: ID={rx_id}")

        # Verify MongoDB storage in prescriptions collection
        stored_rx = await rx_col.find_one({"prescription_id": rx_id})
        assert stored_rx is not None
        assert stored_rx["patient_id"] == pid
        assert stored_rx["doctor_id"] == doc_id
        assert len(stored_rx["medicines"]) == 2
        print(f"[OK] MongoDB 'prescriptions' collection record verified with 2 medicines")

        # ---------------------------------------------------------
        # TEST 2: Patient Retrieves Own Prescriptions (GET /api/patient/prescriptions)
        # ---------------------------------------------------------
        print("\n[TEST 2] Testing Patient Retrieving Prescriptions (GET /api/patient/prescriptions)...")
        res_pat_rx = await client.get("/api/patient/prescriptions", headers=headers_pat)
        assert res_pat_rx.status_code == 200, f"Expected 200, got {res_pat_rx.status_code}: {res_pat_rx.json()}"
        pat_rx_list = res_pat_rx.json()
        assert isinstance(pat_rx_list, list)
        assert len(pat_rx_list) >= 1
        found_rx = next((r for r in pat_rx_list if r["prescription_id"] == rx_id), None)
        assert found_rx is not None
        assert found_rx["doctor_name"] == "Dr. Anjali Rao"
        assert found_rx["diagnosis"] == "Viral fever with mild dehydration"
        print(f"[OK] Patient retrieved {len(pat_rx_list)} prescription(s). Target RX-{rx_id} found with {len(found_rx['medicines'])} medicines")

        # ---------------------------------------------------------
        # TEST 3: Authorized ASHA Worker Views Patient Prescriptions (GET /api/asha/patients/{id}/prescriptions)
        # ---------------------------------------------------------
        print("\n[TEST 3] Testing Authorized ASHA Worker Viewing Patient Prescriptions...")
        res_asha_rx = await client.get(f"/api/asha/patients/{pid}/prescriptions", headers=headers_a1)
        assert res_asha_rx.status_code == 200, f"Expected 200, got {res_asha_rx.status_code}: {res_asha_rx.json()}"
        asha_rx_list = res_asha_rx.json()
        assert len(asha_rx_list) >= 1
        assert asha_rx_list[0]["prescription_id"] == rx_id
        print(f"[OK] Authorized ASHA worker (Chandapur) successfully retrieved {len(asha_rx_list)} prescription(s) for patient in Chandapur")

        # ---------------------------------------------------------
        # TEST 4: Unauthorized ASHA Worker Blocked (403 Forbidden)
        # ---------------------------------------------------------
        print("\n[TEST 4] Testing Unauthorized ASHA Worker Access (Kharwadi -> Chandapur Patient)...")
        res_unauth_asha = await client.get(f"/api/asha/patients/{pid}/prescriptions", headers=headers_a2)
        assert res_unauth_asha.status_code == 403, f"Expected 403 Forbidden, got {res_unauth_asha.status_code}"
        print(f"[OK] Unauthorized ASHA worker blocked with 403: {res_unauth_asha.json()['detail']}")

        # ---------------------------------------------------------
        # TEST 5: Role-Based Authorization Rejection for Doctor Endpoints (403 Forbidden)
        # ---------------------------------------------------------
        print("\n[TEST 5] Testing Role-Based Protection on Prescription Creation...")

        # Patient attempting to issue prescription
        res_pat_create = await client.post("/api/doctor/prescriptions", json=rx_payload, headers=headers_pat)
        assert res_pat_create.status_code == 403
        print(f"[OK] Patient blocked from creating prescription with 403: {res_pat_create.json()['detail']}")

        # ASHA worker attempting to issue prescription
        res_asha_create = await client.post("/api/doctor/prescriptions", json=rx_payload, headers=headers_a1)
        assert res_asha_create.status_code == 403
        print(f"[OK] ASHA worker blocked from creating prescription with 403: {res_asha_create.json()['detail']}")

        # Unauthenticated request
        res_no_tok = await client.post("/api/doctor/prescriptions", json=rx_payload)
        assert res_no_tok.status_code == 401
        print(f"[OK] Unauthenticated request blocked with 401 Unauthorized")

    # Clean up test accounts
    for col in [rx_col, patients_col, doctors_col, asha_col]:
        if col is not None:
            await col.delete_many({"phone": {"$in": [phone_doctor, phone_patient_chandapur, phone_asha_chandapur, phone_asha_kharwadi]}})
            await col.delete_many({"patient_id": pid})

    await close_mongo_connection()
    print("\n==================================================")
    print("    ALL DIGITAL PRESCRIPTION TESTS PASSED!        ")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(run_tests())
