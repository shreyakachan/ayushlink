import os
import sys
import json
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import httpx
from database import (
    get_collection,
    COLLECTION_PATIENTS,
    COLLECTION_PRESCRIPTIONS,
    COLLECTION_NOTIFICATIONS,
    COLLECTION_DOCTORS,
    connect_to_mongo,
    close_mongo_connection,
)
from services.notification_service import create_prescription_notification

BASE_URL = "http://localhost:8000"

async def run_verification():
    await connect_to_mongo()
    try:
        patients_col = get_collection(COLLECTION_PATIENTS)
        prescriptions_col = get_collection(COLLECTION_PRESCRIPTIONS)
        notifications_col = get_collection(COLLECTION_NOTIFICATIONS)
        doctors_col = get_collection(COLLECTION_DOCTORS)

        print("=" * 60)
        print("STEP 0: Initial Patient Collection Verification")
        print("=" * 60)
        init_patient_count = await patients_col.count_documents({})
        print(f"Total patient count in MongoDB: {init_patient_count}")
        assert init_patient_count == 3, f"Expected exactly 3 patients, found {init_patient_count}"

        patients = await patients_col.find({}, {"patient_id": 1, "full_name": 1, "phone": 1}).to_list(10)
        print("Existing 3 patients:")
        for p in patients:
            print(f"  - ID: {p.get('patient_id')}, Name: {p.get('full_name')}, Phone: {p.get('phone')}")
        
        patient_ids = {p.get('patient_id') for p in patients}
        assert patient_ids == {"P-4559", "P-2430", "P-4099"}, f"Unexpected patient IDs: {patient_ids}"

        async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
            # Login as Doctor
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
            doc_json = doc_login_res.json()
            doc_token = doc_json["access_token"]
            doc_name = doc_json["doctor"]["full_name"]
            print(f"\n[Doctor Authenticated]: {doc_name} (Phone: {doc_phone})")

            print("\n" + "=" * 60)
            print("STEP 1 & 2: Submit Real Doctor Prescription for P-4559 & Confirm Save")
            print("=" * 60)
            rx_payload = {
                "patient_id": "P-4559",
                "diagnosis": "Digestive Impairment (Agnimandya)",
                "medicines": [
                    {
                        "name": "Triphala Churna",
                        "dosage": "3g with warm water",
                        "frequency": "Once daily at night",
                        "duration": "7 days",
                        "instructions": "Take before bedtime with lukewarm water"
                    }
                ],
                "advice": "Avoid cold and oily foods, drink warm water throughout the day.",
                "instructions": "Avoid cold and oily foods, drink warm water throughout the day.",
                "notes": "Mild epigastric fullness on palpation.",
                "status": "active"
            }

            rx_res = await client.post(
                "/api/doctor/prescriptions",
                json=rx_payload,
                headers={"Authorization": f"Bearer {doc_token}"}
            )
            assert rx_res.status_code == 201, f"Prescription submission failed: {rx_res.text}"
            rx_data = rx_res.json()
            rx_id = rx_data.get("prescription_id")
            print(f"[Prescription Created Successfully via API]")
            print(f"  Prescription ID: {rx_id}")
            print(f"  Patient ID: {rx_data.get('patient_id')}")
            print(f"  Doctor Name: {rx_data.get('doctor_name')}")
            print(f"  Diagnosis: {rx_data.get('diagnosis')}")
            print(f"  Medicines: {rx_data.get('medicines')}")

            # Verify saved in MongoDB
            stored_rx = await prescriptions_col.find_one({"prescription_id": rx_id})
            assert stored_rx is not None, f"Prescription {rx_id} not found in MongoDB prescriptions collection"
            print(f"  -> Confirmed stored in MongoDB 'prescriptions' collection (_id: {stored_rx['_id']})")

            print("\n" + "=" * 60)
            print("STEP 3 & 4: Confirm Exactly One Notification for P-4559 & Verify Fields")
            print("=" * 60)
            matching_notifs = await notifications_col.find({"prescription_id": rx_id, "patient_id": "P-4559"}).to_list(10)
            print(f"Notifications created for prescription {rx_id} and patient P-4559: {len(matching_notifs)}")
            assert len(matching_notifs) == 1, f"Expected exactly 1 notification, found {len(matching_notifs)}"

            notif = matching_notifs[0]
            print("Actual Notification Document in MongoDB:")
            print(json.dumps({
                "notification_id": notif.get("notification_id"),
                "patient_id": notif.get("patient_id"),
                "prescription_id": notif.get("prescription_id"),
                "consultation_id": notif.get("consultation_id"),
                "doctor_id": notif.get("doctor_id"),
                "doctor_name": notif.get("doctor_name"),
                "title": notif.get("title"),
                "message": notif.get("message"),
                "type": notif.get("type"),
                "is_read": notif.get("is_read"),
                "created_at": notif.get("created_at").isoformat() if isinstance(notif.get("created_at"), datetime) else str(notif.get("created_at")),
            }, indent=2))

            # Verify specific required fields
            assert notif.get("patient_id") == "P-4559", f"patient_id mismatch: {notif.get('patient_id')}"
            assert notif.get("prescription_id") == rx_id, f"prescription_id mismatch: {notif.get('prescription_id')} vs {rx_id}"
            assert notif.get("doctor_name") == doc_name, f"doctor_name mismatch: {notif.get('doctor_name')} vs {doc_name}"
            assert notif.get("title") == "New Prescription Received", f"title mismatch: {notif.get('title')}"
            assert notif.get("message") == f"{doc_name} has issued a new prescription for you.", f"message mismatch: {notif.get('message')}"
            assert notif.get("created_at") is not None, "created_at timestamp is missing"
            assert notif.get("is_read") is False, f"is_read should be False (unread), got {notif.get('is_read')}"
            print("  -> All 7 required notification fields verified successfully.")

            print("\n" + "=" * 60)
            print("STEP 5: Verify P-2430 and P-4099 Did NOT Receive This Notification")
            print("=" * 60)
            p2430_notifs = await notifications_col.find({"prescription_id": rx_id, "patient_id": "P-2430"}).to_list(10)
            p4099_notifs = await notifications_col.find({"prescription_id": rx_id, "patient_id": "P-4099"}).to_list(10)
            print(f"Notifications for P-2430 (Kavita Patil) matching rx {rx_id}: {len(p2430_notifs)}")
            print(f"Notifications for P-4099 (Arjun Shinde) matching rx {rx_id}: {len(p4099_notifs)}")
            assert len(p2430_notifs) == 0, "Unintended notification created for patient P-2430!"
            assert len(p4099_notifs) == 0, "Unintended notification created for patient P-4099!"
            print("  -> Confirmed zero notifications created for unrelated patients.")

            print("\n" + "=" * 60)
            print("STEP 6: Verify Duplicate Prevention (No duplicate notifications)")
            print("=" * 60)
            # Try to trigger notification creation again with the same prescription ID
            dup_result = await create_prescription_notification(
                patient_id="P-4559",
                doctor_name=doc_name,
                prescription_id=rx_id,
            )
            print(f"Deduplication response notification_id: {dup_result.notification_id}")
            assert dup_result.notification_id == notif.get("notification_id"), "Deduplication did not return the existing notification!"

            # Check database count again
            matching_notifs_after_dup = await notifications_col.find({"prescription_id": rx_id, "patient_id": "P-4559"}).to_list(10)
            print(f"Notification count for prescription {rx_id} after duplicate request: {len(matching_notifs_after_dup)}")
            assert len(matching_notifs_after_dup) == 1, f"Duplicate notification was created! Count: {len(matching_notifs_after_dup)}"
            print("  -> Deduplication verified successfully. No duplicate notification created.")

            print("\n" + "=" * 60)
            print("STEP 7: Final Patient Count Verification")
            print("=" * 60)
            final_patient_count = await patients_col.count_documents({})
            print(f"Final patient count in MongoDB: {final_patient_count}")
            assert final_patient_count == 3, f"Expected exactly 3 patients, found {final_patient_count}"

            final_patients = await patients_col.find({}, {"patient_id": 1, "full_name": 1}).to_list(10)
            final_ids = {p.get('patient_id') for p in final_patients}
            assert final_ids == {"P-4559", "P-2430", "P-4099"}, f"Patient records modified: {final_ids}"
            print("Confirmed: Exactly the original 3 patients exist with zero additions or modifications.")

            print("\n" + "=" * 60)
            print("ALL VERIFICATIONS COMPLETED AND PASSED!")
            print("=" * 60)

    finally:
        await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(run_verification())
