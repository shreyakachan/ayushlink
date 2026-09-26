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
    COLLECTION_CONSULTATIONS,
    COLLECTION_NOTIFICATIONS,
    connect_to_mongo,
    close_mongo_connection,
)
from services.notification_service import create_prescription_notification

BASE_URL = "http://localhost:8000"

async def run_consultation_verification():
    await connect_to_mongo()
    try:
        patients_col = get_collection(COLLECTION_PATIENTS)
        prescriptions_col = get_collection(COLLECTION_PRESCRIPTIONS)
        consultations_col = get_collection(COLLECTION_CONSULTATIONS)
        notifications_col = get_collection(COLLECTION_NOTIFICATIONS)

        print("=" * 60)
        print("Consultation Prescription Notification Verification")
        print("=" * 60)

        async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
            # Login as Doctor
            doc_phone = "9823000001"
            doc_login_res = await client.post("/api/doctor/login", json={
                "phone": doc_phone,
                "password": "DoctorSecurePass123"
            })
            assert doc_login_res.status_code == 200
            doc_token = doc_login_res.json()["access_token"]
            doc_name = doc_login_res.json()["doctor"]["full_name"]

            # Submit consultation for P-4559
            cons_payload = {
                "patient_id": "P-4559",
                "diagnosis": "Hyperacidity (Amlapitta)",
                "notes": "Burning sensation in epigastrium after meals.",
                "advice": "Avoid citrus fruits and sour food. Take meals on regular intervals.",
                "medicines": [
                    {
                        "name": "Kamdudha Ras (Mukta Yukta)",
                        "dosage": "1 tablet with milk",
                        "frequency": "Twice daily before food",
                        "duration": "7 days",
                        "instructions": "Take 30 mins before breakfast and dinner"
                    }
                ],
                "status": "completed"
            }

            cons_res = await client.post(
                "/api/doctor/consultations",
                json=cons_payload,
                headers={"Authorization": f"Bearer {doc_token}"}
            )
            assert cons_res.status_code == 201, f"Consultation submit failed: {cons_res.text}"
            cons_data = cons_res.json()
            cons_id = cons_data["consultation_id"]
            print(f"[Consultation Created]: {cons_id}")

            # Verify saved in consultations collection
            stored_cons = await consultations_col.find_one({"consultation_id": cons_id})
            assert stored_cons is not None

            # Verify saved in prescriptions collection
            stored_rx = await prescriptions_col.find_one({"consultation_id": cons_id})
            assert stored_rx is not None
            rx_id = stored_rx["prescription_id"]
            print(f"[Prescription Generated]: {rx_id}")

            # Verify notification for P-4559
            matching_notifs = await notifications_col.find({"consultation_id": cons_id, "patient_id": "P-4559"}).to_list(10)
            print(f"Notifications created for consultation {cons_id}: {len(matching_notifs)}")
            assert len(matching_notifs) == 1

            notif = matching_notifs[0]
            print("Consultation Notification Document:")
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

            assert notif["patient_id"] == "P-4559"
            assert notif["prescription_id"] == rx_id
            assert notif["consultation_id"] == cons_id
            assert notif["doctor_name"] == doc_name
            assert notif["title"] == "New Prescription Received"
            assert notif["message"] == f"{doc_name} has issued a new prescription for you."
            assert notif["is_read"] is False

            # Verify unrelated patients
            p2430_notifs = await notifications_col.find({"consultation_id": cons_id, "patient_id": "P-2430"}).to_list(10)
            p4099_notifs = await notifications_col.find({"consultation_id": cons_id, "patient_id": "P-4099"}).to_list(10)
            assert len(p2430_notifs) == 0
            assert len(p4099_notifs) == 0

            # Verify deduplication
            dup_res = await create_prescription_notification(
                patient_id="P-4559",
                doctor_name=doc_name,
                prescription_id=rx_id,
                consultation_id=cons_id,
            )
            assert dup_res.notification_id == notif["notification_id"]

            # Verify patient collection count is still exactly 3
            pat_count = await patients_col.count_documents({})
            assert pat_count == 3
            print(f"\n[Final Check] Patients count: {pat_count} (P-4559, P-2430, P-4099)")
            print("CONSULTATION NOTIFICATION VERIFICATION PASSED!")

    finally:
        await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(run_consultation_verification())
