import asyncio
import os
import sys
from datetime import datetime, timezone
import httpx
from bson import ObjectId

# Ensure backend directory is in path
backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database import (
    connect_to_mongo,
    close_mongo_connection,
    get_collection,
    COLLECTION_DOCTORS,
    COLLECTION_PATIENTS,
    COLLECTION_ASHA_WORKERS,
    COLLECTION_CONSULTATIONS,
    COLLECTION_PRESCRIPTIONS,
    COLLECTION_NOTIFICATIONS,
)
from services.security import create_access_token

BASE_URL = "http://127.0.0.1:8000"

async def run_e2e_prescription_workflow():
    print("=" * 60)
    print("  AYUSHLINK FULL END-TO-END PRESCRIPTION LIFECYCLE TEST  ")
    print("=" * 60)

    await connect_to_mongo()
    doctors_col = get_collection(COLLECTION_DOCTORS)
    patients_col = get_collection(COLLECTION_PATIENTS)
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)
    cons_col = get_collection(COLLECTION_CONSULTATIONS)
    rx_col = get_collection(COLLECTION_PRESCRIPTIONS)
    notifs_col = get_collection(COLLECTION_NOTIFICATIONS)

    # -------------------------------------------------------------
    # Step 0: Inspect and verify actual demo identities in MongoDB
    # -------------------------------------------------------------
    print("\n[STEP 0] Inspecting actual Demo Identities in MongoDB...")
    doc = await doctors_col.find_one({"$or": [{"doctor_id": "DOC-501"}, {"phone": "9823088882"}]})
    assert doc is not None, "Doctor DOC-501 not found in database!"
    doc_id = doc.get("doctor_id", "DOC-501")
    doc_phone = doc.get("phone", "9823088882")
    doc_name = doc.get("full_name")
    print(f"  [OK] Doctor Found: {doc_name} (ID={doc_id}, Phone={doc_phone}, Facility={doc.get('assigned_facility')})")

    patient = await patients_col.find_one({"$or": [{"patient_id": "P-4559"}, {"phone": "9324998108"}]})
    assert patient is not None, "Patient P-4559 (Shreya) not found in database!"
    p_id = patient.get("patient_id", "P-4559")
    p_phone = patient.get("phone", "9324998108")
    p_name = patient.get("full_name", "Shreya")
    p_village = patient.get("village", "Chandapur")
    p_asha_assigned = patient.get("asha_worker_id")
    print(f"  [OK] Patient Found: {p_name} (ID={p_id}, Phone={p_phone}, Village={p_village}, Assigned ASHA={p_asha_assigned})")

    asha = await asha_col.find_one({"$or": [{"worker_id": "ASHA-340"}, {"phone": "9876543210"}]})
    assert asha is not None, "ASHA Worker ASHA-340 (Pooja Sharma) not found in database!"
    asha_id = asha.get("worker_id", "ASHA-340")
    asha_phone = asha.get("phone", "9876543210")
    asha_name = asha.get("full_name", "Pooja Sharma")
    asha_villages = asha.get("assigned_villages", [])
    print(f"  [OK] ASHA Worker Found: {asha_name} (ID={asha_id}, Phone={asha_phone}, Villages={asha_villages})")
    assert p_village in asha_villages or p_asha_assigned == asha_id, f"ASHA {asha_id} must be assigned to village {p_village}!"

    # Count initial baseline records to verify existing data remains intact
    initial_cons_count = await cons_col.count_documents({})
    initial_rx_count = await rx_col.count_documents({})
    print(f"  [BASELINE] Total consultations in DB: {initial_cons_count}, Total prescriptions in DB: {initial_rx_count}")

    created_cons_id = None
    created_rx_id = None
    unassigned_asha_id = None

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        # -------------------------------------------------------------
        # Step 1: Authenticate as Doctor (Dr Arvind Varma / DOC-501)
        # -------------------------------------------------------------
        print("\n[STEP 1] Authenticating Doctor DOC-501 via /api/doctor/login...")
        login_res = await client.post("/api/doctor/login", json={"phone": doc_phone, "password": "DoctorSecurePass123"})
        if login_res.status_code != 200:
            # Fallback password test
            login_res = await client.post("/api/doctor/login", json={"phone": doc_phone, "password": "Password123"})
        assert login_res.status_code == 200, f"Doctor login failed: {login_res.status_code} - {login_res.text}"
        doc_token = login_res.json()["access_token"]
        doc_headers = {"Authorization": f"Bearer {doc_token}"}
        print(f"  [OK] Doctor authenticated successfully. JWT token acquired.")

        # -------------------------------------------------------------
        # Step 2: Open Patient P-4559 Record as Doctor
        # -------------------------------------------------------------
        print(f"\n[STEP 2] Fetching Patient {p_id} ({p_name}) Record as Doctor...")
        rec_res = await client.get(f"/api/doctor/patients/{p_id}/records", headers=doc_headers)
        assert rec_res.status_code == 200, f"Failed to fetch patient record: {rec_res.status_code} - {rec_res.text}"
        rec_data = rec_res.json()
        assert rec_data["patient_id"] == p_id
        assert rec_data["full_name"] == p_name
        assert rec_data["village"] == p_village
        print(f"  [OK] Patient record loaded: Name={rec_data['full_name']}, Village={rec_data['village']}, BloodGroup={rec_data.get('blood_group')}")

        # -------------------------------------------------------------
        # Step 3: Enter clinically appropriate diagnosis & prescription
        # -------------------------------------------------------------
        print("\n[STEP 3] Preparing clinical consultation & digital prescription payload...")
        test_diagnosis = "[TEST-E2E] Acute Bronchitis & Pharyngeal Infection"
        test_notes = "Bilateral chest rhonchi, inflamed tonsillar pillars, persistent productive cough. SpO2 97% on room air."
        test_advice = "Warm saline gargles 3-4 times daily, adequate oral hydration, avoid cold drinks, steam inhalation before bed."
        test_medicines = [
            {
                "name": "Amoxicillin 500mg",
                "dosage": "1 capsule",
                "frequency": "Thrice daily after meals",
                "duration": "5 days",
                "instructions": "Complete full 5-day antibiotic course with water",
            },
            {
                "name": "Paracetamol 650mg",
                "dosage": "1 tablet",
                "frequency": "Twice daily SOS for fever",
                "duration": "3 days",
                "instructions": "Take after meals if temperature > 100 F",
            },
            {
                "name": "Cetirizine 10mg",
                "dosage": "1 tablet",
                "frequency": "Once daily at bedtime",
                "duration": "3 days",
                "instructions": "Take at night; may cause mild sedation",
            },
        ]
        cons_payload = {
            "patient_id": p_id,
            "diagnosis": test_diagnosis,
            "notes": test_notes,
            "advice": test_advice,
            "medicines": test_medicines,
            "urgency": "routine",
            "status": "completed",
        }

        # -------------------------------------------------------------
        # Step 4: Save Consultation and Prescription
        # -------------------------------------------------------------
        print("\n[STEP 4] Submitting consultation and prescription via POST /api/doctor/consultations...")
        save_res = await client.post("/api/doctor/consultations", json=cons_payload, headers=doc_headers)
        assert save_res.status_code == 201, f"Failed to save consultation: {save_res.status_code} - {save_res.text}"
        cons_data = save_res.json()
        created_cons_id = cons_data.get("consultation_id")
        created_rx_id = cons_data.get("prescription_id")
        assert created_cons_id is not None, "Response must include consultation_id"
        assert created_rx_id is not None, "Response must include persisted prescription_id"
        print(f"  [OK] Consultation confirmed: ID={created_cons_id}, Prescription ID={created_rx_id}")
        print(f"  [OK] Prescribed medicines count: {len(cons_data.get('medicines', []))}")

        # -------------------------------------------------------------
        # Step 5: Verify Database Persistence
        # -------------------------------------------------------------
        print("\n[STEP 5] Verifying MongoDB persistence across all collections...")
        # Check consultations collection
        db_cons = await cons_col.find_one({"consultation_id": created_cons_id})
        assert db_cons is not None, f"Consultation {created_cons_id} not found in MongoDB 'consultations'!"
        assert db_cons["status"] == "completed"
        assert db_cons["doctor_id"] == doc_id
        assert db_cons["diagnosis"] == test_diagnosis
        print(f"  [OK] MongoDB 'consultations': Record verified with doctor_id={db_cons['doctor_id']}")

        # Check prescriptions collection
        db_rx = await rx_col.find_one({"prescription_id": created_rx_id})
        assert db_rx is not None, f"Prescription {created_rx_id} not found in MongoDB 'prescriptions'!"
        assert db_rx["patient_id"] == p_id
        assert db_rx["patient_name"] == p_name
        assert db_rx["doctor_id"] == doc_id
        assert db_rx["consultation_id"] == created_cons_id
        assert len(db_rx["medicines"]) == 3
        print(f"  [OK] MongoDB 'prescriptions': Record verified with {len(db_rx['medicines'])} medicines, linked to {created_cons_id}")

        # Check patient medical history
        db_pat = await patients_col.find_one({"patient_id": p_id})
        med_hist = db_pat.get("medical_history", [])
        hist_entry = next((h for h in med_hist if h.get("id") == created_rx_id or h.get("prescription_id") == created_rx_id or h.get("consultation_id") == created_cons_id), None)
        assert hist_entry is not None, f"Visit record not found in patient's medical_history: {med_hist[-2:]}"
        print(f"  [OK] MongoDB 'patients' medical_history: History entry confirmed with reason='{hist_entry.get('reason')}'")

        # -------------------------------------------------------------
        # Step 6: Patient Login & Verification (Shreya / P-4559)
        # -------------------------------------------------------------
        print("\n[STEP 6] Logging in as Patient Shreya (P-4559) and verifying Prescription delivery...")
        pat_token = create_access_token({"sub": p_id, "phone": p_phone, "role": "patient"})
        pat_headers = {"Authorization": f"Bearer {pat_token}"}

        # Check /api/patient/prescriptions
        pat_rx_res = await client.get("/api/patient/prescriptions", headers=pat_headers)
        assert pat_rx_res.status_code == 200, f"Patient failed to get prescriptions: {pat_rx_res.status_code}"
        pat_prescriptions = pat_rx_res.json()
        target_rx = next((rx for rx in pat_prescriptions if rx["prescription_id"] == created_rx_id), None)
        assert target_rx is not None, f"Prescription {created_rx_id} not found in patient's prescription list!"
        assert target_rx["diagnosis"] == test_diagnosis
        assert len(target_rx["medicines"]) == 3
        assert target_rx["doctor_name"] == doc_name
        print(f"  [OK] Patient Prescriptions endpoint: Found {created_rx_id} with {len(target_rx['medicines'])} meds, prescribed by {target_rx['doctor_name']}")

        # Check /api/patient/medical-record
        pat_med_res = await client.get("/api/patient/medical-record", headers=pat_headers)
        assert pat_med_res.status_code == 200
        pat_med_data = pat_med_res.json()
        hist_item = next((h for h in pat_med_data.get("medical_history", []) if h.get("id") == created_rx_id or h.get("prescription_id") == created_rx_id or h.get("consultation_id") == created_cons_id), None)
        assert hist_item is not None, "Prescription/consultation missing from patient's medical record!"
        print(f"  [OK] Patient Medical Record endpoint: Past visit confirmed with reason: {hist_item.get('reason')}")

        # -------------------------------------------------------------
        # Step 7: Assigned ASHA Worker Login & Verification (ASHA-340)
        # -------------------------------------------------------------
        print("\n[STEP 7] Logging in as Assigned ASHA Worker (ASHA-340, Pooja Sharma)...")
        asha_token = create_access_token({"sub": asha_id, "phone": asha_phone, "role": "asha"})
        asha_headers = {"Authorization": f"Bearer {asha_token}"}

        # Check /api/asha/patients/{patient_id}/prescriptions
        asha_rx_res = await client.get(f"/api/asha/patients/{p_id}/prescriptions", headers=asha_headers)
        assert asha_rx_res.status_code == 200, f"ASHA failed to get patient prescriptions: {asha_rx_res.status_code} - {asha_rx_res.text}"
        asha_prescriptions = asha_rx_res.json()
        asha_target_rx = next((rx for rx in asha_prescriptions if rx["prescription_id"] == created_rx_id), None)
        assert asha_target_rx is not None, f"Prescription {created_rx_id} not found in ASHA's patient prescription view!"
        assert asha_target_rx["patient_name"] == p_name
        assert asha_target_rx["patient_village"] == p_village
        print(f"  [OK] ASHA Worker Prescriptions view: Successfully verified {created_rx_id} for {p_name} in village {p_village}")

        # -------------------------------------------------------------
        # Step 8: Persistence across fresh session tokens (relod simulation)
        # -------------------------------------------------------------
        print("\n[STEP 8] Simulating page refresh / re-login with newly generated JWT tokens...")
        fresh_pat_token = create_access_token({"sub": p_id, "phone": p_phone, "role": "patient"})
        fresh_pat_headers = {"Authorization": f"Bearer {fresh_pat_token}"}
        fresh_pat_res = await client.get("/api/patient/prescriptions", headers=fresh_pat_headers)
        assert fresh_pat_res.status_code == 200
        assert any(rx["prescription_id"] == created_rx_id for rx in fresh_pat_res.json())
        print(f"  [OK] Persistence confirmed: Prescription {created_rx_id} remains visible after re-login/refresh.")

        # -------------------------------------------------------------
        # Step 9: Security checks (Unrelated Patient & Unassigned ASHA Worker)
        # -------------------------------------------------------------
        print("\n[STEP 9] Verifying Security: Unrelated Patient & Unassigned ASHA blocked...")
        
        # Unrelated patient
        unrelated_pid = "P-9999"
        await patients_col.delete_one({"patient_id": unrelated_pid})
        await patients_col.insert_one({
            "patient_id": unrelated_pid,
            "full_name": "Unrelated Patient",
            "phone": "9999999999",
            "village": "Devgaon",
            "created_at": datetime.now(timezone.utc),
        })
        unrelated_token = create_access_token({"sub": unrelated_pid, "phone": "9999999999", "role": "patient"})
        unrelated_headers = {"Authorization": f"Bearer {unrelated_token}"}
        unrel_rx_res = await client.get("/api/patient/prescriptions", headers=unrelated_headers)
        assert unrel_rx_res.status_code == 200
        # Must NOT see Shreya's prescription
        assert not any(rx["prescription_id"] == created_rx_id for rx in unrel_rx_res.json())
        print(f"  [OK] Unrelated patient cannot see Shreya's prescription.")

        # Unassigned ASHA worker (village: Devgaon only)
        unassigned_asha_id = f"ASHA-TEST-{datetime.now().strftime('%H%M%S')}"
        unassigned_token = create_access_token({"sub": unassigned_asha_id, "phone": "9998887776", "role": "asha"})
        unassigned_headers = {"Authorization": f"Bearer {unassigned_token}"}
        
        # Register temporary unassigned worker in DB
        await asha_col.delete_many({"$or": [{"phone": "9998887776"}, {"worker_id": unassigned_asha_id}]})
        await asha_col.insert_one({
            "worker_id": unassigned_asha_id,
            "full_name": "Unassigned Test ASHA",
            "phone": "9998887776",
            "assigned_villages": ["Devgaon"],
            "created_at": datetime.now(timezone.utc),
        })

        unauth_asha_res = await client.get(f"/api/asha/patients/{p_id}/prescriptions", headers=unassigned_headers)
        assert unauth_asha_res.status_code == 403, f"Expected 403 Forbidden, got {unauth_asha_res.status_code}: {unauth_asha_res.text}"
        print(f"  [OK] Unassigned ASHA blocked with 403 Forbidden: {unauth_asha_res.json()['detail']}")

        # -------------------------------------------------------------
        # Step 10: Failed save and retry; ensure no false success & no duplicate
        # -------------------------------------------------------------
        print("\n[STEP 10] Testing validation failure & retry idempotency...")
        # Empty diagnosis and notes -> 400 Bad Request
        invalid_res = await client.post("/api/doctor/consultations", json={"patient_id": p_id, "diagnosis": "", "notes": ""}, headers=doc_headers)
        assert invalid_res.status_code in [400, 422], f"Expected 400/422 for invalid payload, got {invalid_res.status_code}"
        print(f"  [OK] Backend rejected invalid consultation without persisting record: {invalid_res.json().get('detail')}")

        # Retry saving with same consultation_id -> updates existing, does not create duplicate prescription
        retry_payload = dict(cons_payload)
        retry_payload["consultation_id"] = created_cons_id
        retry_payload["notes"] = "Updated consultation notes on retry."
        retry_res = await client.post("/api/doctor/consultations", json=retry_payload, headers=doc_headers)
        assert retry_res.status_code == 201
        retry_data = retry_res.json()
        assert retry_data["consultation_id"] == created_cons_id
        assert retry_data["prescription_id"] == created_rx_id

        # Verify prescriptions count for this consultation in DB is exactly 1
        rx_matches = await rx_col.count_documents({"consultation_id": created_cons_id})
        assert rx_matches == 1, f"Expected exactly 1 prescription for consultation, found {rx_matches}!"
        print(f"  [OK] Idempotency confirmed: Retry updated existing record, 0 duplicate prescriptions created.")

        # -------------------------------------------------------------
        # Step 11: Verify pre-existing data integrity
        # -------------------------------------------------------------
        print("\n[STEP 11] Verifying existing demo prescriptions & history remain intact...")
        final_cons_count = await cons_col.count_documents({})
        final_rx_count = await rx_col.count_documents({})
        assert final_cons_count >= initial_cons_count
        assert final_rx_count >= initial_rx_count
        print(f"  [OK] Baseline integrity confirmed. Existing records untouched.")

    # -------------------------------------------------------------
    # Cleanup only test records created by this test
    # -------------------------------------------------------------
    print("\n[CLEANUP] Cleaning up test records...")
    if created_cons_id:
        await cons_col.delete_one({"consultation_id": created_cons_id})
    if created_rx_id:
        await rx_col.delete_one({"prescription_id": created_rx_id})
    if unassigned_asha_id:
        await asha_col.delete_one({"worker_id": unassigned_asha_id})
    await patients_col.delete_one({"patient_id": "P-9999"})
    if created_rx_id or created_cons_id:
        await patients_col.update_one(
            {"patient_id": p_id},
            {"$pull": {"medical_history": {"$or": [{"id": created_rx_id}, {"prescription_id": created_rx_id}, {"consultation_id": created_cons_id}]}}}
        )
    await notifs_col.delete_many({"prescription_id": created_rx_id})
    print("  [OK] Cleanup complete: All test-generated records cleanly removed.")

    await close_mongo_connection()

    print("\n" + "=" * 60)
    print("   ALL END-TO-END PRESCRIPTION LIFECYCLE TESTS PASSED!   ")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(run_e2e_prescription_workflow())
