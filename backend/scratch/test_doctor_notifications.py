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
    COLLECTION_NOTIFICATIONS,
    COLLECTION_DOCTORS,
    connect_to_mongo,
    close_mongo_connection,
)

BASE_URL = "http://localhost:8000"

async def test_doctor_notification_system():
    await connect_to_mongo()
    try:
        patients_col = get_collection(COLLECTION_PATIENTS)
        notifications_col = get_collection(COLLECTION_NOTIFICATIONS)

        print("=" * 60)
        print("1. Patient Integrity Check")
        print("=" * 60)
        p_count = await patients_col.count_documents({})
        print(f"Total patient count: {p_count}")
        assert p_count == 3, f"Expected 3 patients, found {p_count}"

        patients = await patients_col.find({}, {"patient_id": 1, "full_name": 1}).to_list(10)
        p_ids = {p.get("patient_id") for p in patients}
        assert p_ids == {"P-4559", "P-2430", "P-4099"}
        print(f"Patients: {[p.get('patient_id') + ' (' + p.get('full_name') + ')' for p in patients]}")

        async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
            print("\n" + "=" * 60)
            print("2. Doctor Authentication & Notification Fetch")
            print("=" * 60)
            # Login as Dr. Ramesh Gupta (DOC-101)
            doc_phone = "9823000001"
            login_res = await client.post("/api/doctor/login", json={
                "phone": doc_phone,
                "password": "DoctorSecurePass123"
            })
            assert login_res.status_code == 200, f"Doctor login failed: {login_res.text}"
            doc_data = login_res.json()
            doc_token = doc_data["access_token"]
            doc_name = doc_data["doctor"]["full_name"]
            doc_id = doc_data["doctor"]["doctor_id"]
            print(f"Logged in as: {doc_name} (ID: {doc_id})")

            # Fetch Doctor Notifications via GET /api/doctor/notifications
            notifs_res = await client.get(
                "/api/doctor/notifications",
                headers={"Authorization": f"Bearer {doc_token}"}
            )
            assert notifs_res.status_code == 200, f"Get doctor notifications failed: {notifs_res.text}"
            notifs = notifs_res.json()
            print(f"Retrieved {len(notifs)} dynamic notification(s) for doctor {doc_name}:")
            for idx, n in enumerate(notifs[:5], 1):
                print(f"  [{idx}] Type: {n.get('type')} | Title: {n.get('title')}")
                print(f"      Message: {n.get('message')}")
                print(f"      Time: {n.get('created_at')} | Unread: {not n.get('is_read')}")

            # Verify that notifications contain real database entities
            if len(notifs) > 0:
                first_notif = notifs[0]
                assert "notification_id" in first_notif
                assert "title" in first_notif
                assert "message" in first_notif
                assert "created_at" in first_notif
                assert "is_read" in first_notif

                # Test Mark Single Notification as Read
                notif_target_id = first_notif["notification_id"]
                mark_read_res = await client.patch(
                    f"/api/doctor/notifications/{notif_target_id}/read",
                    headers={"Authorization": f"Bearer {doc_token}"}
                )
                assert mark_read_res.status_code == 200, f"Mark read failed: {mark_read_res.text}"
                print(f"\nSuccessfully marked notification {notif_target_id} as read.")

                # Test Mark All as Read
                mark_all_res = await client.patch(
                    "/api/doctor/notifications/read-all",
                    headers={"Authorization": f"Bearer {doc_token}"}
                )
                assert mark_all_res.status_code == 200, f"Mark all read failed: {mark_all_res.text}"
                print("Successfully marked all doctor notifications as read.")

            print("\n" + "=" * 60)
            print("3. Final Patient Count & Integrity Check")
            print("=" * 60)
            final_p_count = await patients_col.count_documents({})
            assert final_p_count == 3
            print(f"Final patient count in MongoDB: {final_p_count} (P-4559, P-2430, P-4099)")
            print("\nALL DOCTOR NOTIFICATION TESTS PASSED SUCCESSFULLY!")

    finally:
        await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(test_doctor_notification_system())
