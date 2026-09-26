import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import httpx
from database import (
    get_collection,
    COLLECTION_PATIENTS,
    COLLECTION_PRESCRIPTIONS,
    COLLECTION_CONSULTATIONS,
    COLLECTION_DOCTORS,
    connect_to_mongo,
    close_mongo_connection,
)

BASE_URL = "http://localhost:8000"

async def test_full_prescription_flow():
    await connect_to_mongo()
    try:
        async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
            # 1. Check patient count in DB directly
            patients_col = get_collection(COLLECTION_PATIENTS)
            count = await patients_col.count_documents({})
            print(f"[DB Check] Total patients in MongoDB: {count}")
            assert count == 3, f"Expected 3 patients, found {count}"

            patients = await patients_col.find({}, {"patient_id": 1, "full_name": 1, "phone": 1}).to_list(10)
            print("[DB Check] Existing patients:")
            for p in patients:
                print(f"  - {p.get('patient_id')}: {p.get('full_name')} ({p.get('phone')})")

            # Check doctors in DB
            doctors_col = get_collection(COLLECTION_DOCTORS)
            doc_count = await doctors_col.count_documents({})
            print(f"[DB Check] Total doctors in MongoDB: {doc_count}")
            docs = await doctors_col.find({}, {"doctor_id": 1, "full_name": 1, "phone": 1}).to_list(10)
            for d in docs:
                print(f"  - {d.get('doctor_id')}: {d.get('full_name')} ({d.get('phone')})")

            doc_phone = "9823000001"

            # 2. Login as Doctor
            doc_login_res = await client.post("/api/doctor/login", json={
                "phone": doc_phone,
                "password": "DoctorSecurePass123"
            })
            if doc_login_res.status_code != 200:
                doc_login_res = await client.post("/api/doctor/login", json={
                    "phone": doc_phone,
                    "password": "123456"
                })
            print(f"[Doctor Login ({doc_phone})] Status: {doc_login_res.status_code}")
            if doc_login_res.status_code != 200:
                print(f"  Response: {doc_login_res.text}")
            doc_token = doc_login_res.json()["access_token"]

            # 3. Login as Patient Shreya P-4559 (phone 9324998108, password 123456)
            pat_login_res = await client.post("/api/patient/login", json={
                "phone": "9324998108",
                "password": "123456"
            })
            if pat_login_res.status_code != 200:
                pat_login_res = await client.post("/api/patient/login", json={
                    "phone": "9324998108",
                    "password": "password"
                })
            print(f"[Patient Login] Status: {pat_login_res.status_code}")
            patient_token = pat_login_res.json()["access_token"]

            # 4. Doctor submits consultation with specific Examination Findings & Advice
            test_findings = "Mild abdominal tenderness observed."
            test_advice = "Avoid spicy food and drink plenty of water."

            submit_payload = {
                "patient_id": "P-4559",
                "diagnosis": "Acute Gastritis",
                "notes": test_findings,
                "advice": test_advice,
                "medicines": [
                    {
                        "name": "Sutshekhar Ras",
                        "dosage": "1 tablet",
                        "frequency": "Twice daily after food",
                        "duration": "5 days",
                        "instructions": "Take with lukewarm water"
                    }
                ],
                "status": "completed"
            }

            submit_res = await client.post(
                "/api/doctor/consultations",
                json=submit_payload,
                headers={"Authorization": f"Bearer {doc_token}"}
            )
            print(f"[Consultation Submit] Status: {submit_res.status_code}")
            consultation_data = submit_res.json()
            print(f"[Consultation Submit Response] ID: {consultation_data.get('consultation_id')}")
            print(f"  Notes (Findings): {consultation_data.get('notes')}")
            print(f"  Advice: {consultation_data.get('advice')}")

            assert consultation_data.get("notes") == test_findings, "Consultation notes mismatch"
            assert consultation_data.get("advice") == test_advice, "Consultation advice mismatch"

            # 5. Patient retrieves their prescriptions
            rx_res = await client.get(
                "/api/patient/prescriptions",
                headers={"Authorization": f"Bearer {patient_token}"}
            )
            print(f"[Patient Get Prescriptions] Status: {rx_res.status_code}")
            rx_list = rx_res.json()
            print(f"[Patient Prescriptions Count]: {len(rx_list)}")
            assert len(rx_list) > 0, "No prescriptions returned for patient"

            latest_rx = rx_list[0]
            print(f"[Latest Prescription Details]")
            print(f"  Prescription ID: {latest_rx.get('prescription_id')}")
            print(f"  Diagnosis: {latest_rx.get('diagnosis')}")
            print(f"  Examination Findings (notes): {latest_rx.get('notes')}")
            print(f"  Doctor's Advice (advice): {latest_rx.get('advice')}")
            print(f"  Medicines: {latest_rx.get('medicines')}")

            assert latest_rx.get("notes") == test_findings, f"Prescription notes mismatch: got '{latest_rx.get('notes')}' expected '{test_findings}'"
            assert latest_rx.get("advice") == test_advice, f"Prescription advice mismatch: got '{latest_rx.get('advice')}' expected '{test_advice}'"

            # 6. Verify patient count is STILL 3
            count_after = await patients_col.count_documents({})
            print(f"[Final DB Check] Total patients in MongoDB: {count_after}")
            assert count_after == 3, f"Patient count changed! Expected 3, got {count_after}"

            print("\n ALL VERIFICATIONS PASSED SUCCESSFULLY!")
    finally:
        await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(test_full_prescription_flow())
