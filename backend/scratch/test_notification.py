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
    COLLECTION_NOTIFICATIONS,
    COLLECTION_DOCTORS,
    connect_to_mongo,
    close_mongo_connection,
)

BASE_URL = "http://localhost:8000"

async def test_notification_flow():
    await connect_to_mongo()
    try:
        async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
            # 1. Check patient count in DB directly
            patients_col = get_collection(COLLECTION_PATIENTS)
            count_initial = await patients_col.count_documents({})
            print(f"[DB Check] Initial total patients in MongoDB: {count_initial}")
            assert count_initial == 3, f"Expected 3 patients, found {count_initial}"

            patients = await patients_col.find({}, {"patient_id": 1, "full_name": 1, "phone": 1}).to_list(10)
            print("[DB Check] Existing patients:")
            for p in patients:
                print(f"  - {p.get('patient_id')}: {p.get('full_name')} ({p.get('phone')})")

            # Check initial notifications count for all patients
            notif_col = get_collection(COLLECTION_NOTIFICATIONS)
            p4559_notifs_before = await notif_col.count_documents({"patient_id": "P-4559"})
            p2430_notifs_before = await notif_col.count_documents({"patient_id": "P-2430"})
            p4099_notifs_before = await notif_col.count_documents({"patient_id": "P-4099"})
            print(f"[Notification Baseline] P-4559: {p4559_notifs_before}, P-2430: {p2430_notifs_before}, P-4099: {p4099_notifs_before}")

            # 2. Login as Doctor
            doc_phone = "9823000001"
            doc_login_res = await client.post("/api/doctor/login", json={
                "phone": doc_phone,
                "password": "DoctorSecurePass123"
            })
            if doc_login_res.status_code != 200:
                doc_login_res = await client.post("/api/doctor/login", json={
                    "phone": doc_phone,
                    "password": "password123"
                })
            assert doc_login_res.status_code == 200, f"Doctor login failed: {doc_login_res.text}"
            doc_data = doc_login_res.json()
            doc_token = doc_data["access_token"]
            doc_name = doc_data["doctor"]["full_name"]
            print(f"[Doctor Login] Logged in as: {doc_name} ({doc_phone})")

            # 3. Doctor submits a prescription/consultation for P-4559
            submit_payload = {
                "patient_id": "P-4559",
                "diagnosis": "Seasonal Allergic Rhinitis",
                "notes": "Mild nasal congestion and sneezing.",
                "advice": "Drink warm fluids, steam inhalation twice daily.",
                "medicines": [
                    {
                        "name": "Sitopaladi Churna",
                        "dosage": "3g with honey",
                        "frequency": "Twice daily after food",
                        "duration": "5 days",
                        "instructions": "Take with pure honey"
                    }
                ],
                "status": "completed"
            }

            submit_res = await client.post(
                "/api/doctor/consultations",
                json=submit_payload,
                headers={"Authorization": f"Bearer {doc_token}"}
            )
            assert submit_res.status_code == 201, f"Consultation submission failed: {submit_res.text}"
            cons_res_data = submit_res.json()
            cons_id = cons_res_data.get("consultation_id")
            print(f"[Consultation Submitted] ID: {cons_id}")

            # 4. Verify notification in MongoDB for P-4559
            latest_notif = await notif_col.find_one(
                {"patient_id": "P-4559", "consultation_id": cons_id}
            )
            assert latest_notif is not None, f"No notification found in MongoDB for patient P-4559 and consultation {cons_id}"
            print(f"[Notification in DB Verified]")
            print(f"  Notification ID: {latest_notif.get('notification_id')}")
            print(f"  Patient ID: {latest_notif.get('patient_id')}")
            print(f"  Doctor Name: {latest_notif.get('doctor_name')}")
            print(f"  Title: {latest_notif.get('title')}")
            print(f"  Message: {latest_notif.get('message')}")
            print(f"  Prescription ID: {latest_notif.get('prescription_id')}")
            print(f"  Consultation ID: {latest_notif.get('consultation_id')}")
            print(f"  is_read: {latest_notif.get('is_read')}")
            print(f"  created_at: {latest_notif.get('created_at')}")

            assert latest_notif.get("patient_id") == "P-4559", "Patient ID mismatch on notification"
            assert latest_notif.get("doctor_name") == doc_name, f"Doctor name mismatch: {latest_notif.get('doctor_name')} vs {doc_name}"
            assert latest_notif.get("title") == "New Prescription Received", "Title mismatch"
            assert latest_notif.get("message") == f"{doc_name} has issued a new prescription for you.", "Message format mismatch"
            assert latest_notif.get("is_read") is False, "is_read should be False initially"
            assert latest_notif.get("created_at") is not None, "created_at missing"

            # 5. Verify NO notification was created for unrelated patients (P-2430 or P-4099)
            p2430_notifs_after = await notif_col.count_documents({"patient_id": "P-2430"})
            p4099_notifs_after = await notif_col.count_documents({"patient_id": "P-4099"})
            print(f"[Unrelated Patients Check]")
            print(f"  P-2430 notifications before: {p2430_notifs_before}, after: {p2430_notifs_after}")
            print(f"  P-4099 notifications before: {p4099_notifs_before}, after: {p4099_notifs_after}")
            assert p2430_notifs_after == p2430_notifs_before, "Unrelated patient P-2430 received an unexpected notification!"
            assert p4099_notifs_after == p4099_notifs_before, "Unrelated patient P-4099 received an unexpected notification!"

            # 6. Verify duplicate prevention (submitting same consultation or trigger does not create duplicate notification)
            from services.notification_service import create_prescription_notification
            dup_res = await create_prescription_notification(
                patient_id="P-4559",
                doctor_name=doc_name,
                prescription_id=latest_notif.get("prescription_id"),
                consultation_id=cons_id,
            )
            assert dup_res is not None
            assert dup_res.notification_id == latest_notif.get("notification_id"), "Deduplication failed to return existing notification"

            # 7. Patient Login & Fetch Notifications via API (GET /api/patient/notifications)
            pat_login_res = await client.post("/api/patient/login", json={
                "phone": "9324998108",
                "password": "123456"
            })
            assert pat_login_res.status_code == 200, f"Patient login failed: {pat_login_res.text}"
            patient_token = pat_login_res.json()["access_token"]

            # Test direct prescription API (POST /api/doctor/prescriptions)
            direct_rx_payload = {
                "patient_id": "P-4559",
                "diagnosis": "Follow-up General Health",
                "medicines": [
                    {
                        "name": "Ashwagandha Lehya",
                        "dosage": "1 teaspoon",
                        "frequency": "Once daily at night",
                        "duration": "14 days",
                        "instructions": "Take with warm milk"
                    }
                ],
                "advice": "Daily morning walk and balanced diet.",
                "instructions": "Daily morning walk and balanced diet.",
                "notes": "Follow-up checkup normal.",
                "status": "active"
            }
            direct_rx_res = await client.post(
                "/api/doctor/prescriptions",
                json=direct_rx_payload,
                headers={"Authorization": f"Bearer {doc_token}"}
            )
            assert direct_rx_res.status_code == 201, f"Direct prescription failed: {direct_rx_res.text}"
            direct_rx_id = direct_rx_res.json().get("prescription_id")
            print(f"[Direct Prescription Created] ID: {direct_rx_id}")

            direct_notif = await notif_col.find_one({"patient_id": "P-4559", "prescription_id": direct_rx_id})
            assert direct_notif is not None, f"No notification found for direct prescription {direct_rx_id}"
            assert direct_notif.get("doctor_name") == doc_name
            assert direct_notif.get("title") == "New Prescription Received"
            assert direct_notif.get("message") == f"{doc_name} has issued a new prescription for you."
            print(f"[Direct Prescription Notification Verified] ID: {direct_notif.get('notification_id')}")

            pat_notifs_res = await client.get(
                "/api/patient/notifications",
                headers={"Authorization": f"Bearer {patient_token}"}
            )
            assert pat_notifs_res.status_code == 200, f"Patient notifications API failed: {pat_notifs_res.text}"
            pat_notifs_list = pat_notifs_res.json()
            print(f"[Patient API Check] Retrieved {len(pat_notifs_list)} notifications for P-4559")
            assert len(pat_notifs_list) > 0, "Expected at least 1 notification for P-4559"
            latest_api_notif = pat_notifs_list[0]
            assert latest_api_notif["title"] == "New Prescription Received"
            assert latest_api_notif["patient_id"] == "P-4559"
            assert latest_api_notif["doctor_name"] == doc_name

            # 8. Verify total patient count remains exactly 3
            count_final = await patients_col.count_documents({})
            print(f"[Final DB Check] Total patients in MongoDB: {count_final}")
            assert count_final == 3, f"Expected exactly 3 patients, but found {count_final}"

            # Verify the exact 3 patients are still the originals
            remaining_patients = await patients_col.find({}, {"patient_id": 1, "full_name": 1}).to_list(10)
            remaining_ids = {p.get("patient_id") for p in remaining_patients}
            assert remaining_ids == {"P-4559", "P-2430", "P-4099"}, f"Patient IDs altered: {remaining_ids}"

            print("\n ALL NOTIFICATION BACKEND TESTS PASSED SUCCESSFULLY!")
    finally:
        await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(test_notification_flow())
