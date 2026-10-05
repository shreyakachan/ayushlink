import asyncio
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport
from main import app
from database import (
    get_collection,
    COLLECTION_NOTIFICATIONS,
    COLLECTION_SYMPTOMS,
    COLLECTION_PATIENTS,
    COLLECTION_DOCTORS,
    connect_to_mongo,
    close_mongo_connection,
)
from services.security import create_access_token


async def run_badge_tests():
    print("==================================================")
    print("  AyushLink Doctor Notification Badge Test Suite  ")
    print("==================================================")

    await connect_to_mongo()
    notifs_col = get_collection(COLLECTION_NOTIFICATIONS)
    symptoms_col = get_collection(COLLECTION_SYMPTOMS)
    patients_col = get_collection(COLLECTION_PATIENTS)
    doctors_col = get_collection(COLLECTION_DOCTORS)

    doc_doc = await doctors_col.find_one({"doctor_id": "DOC-102"}) or await doctors_col.find_one({})
    doc_id = doc_doc.get("doctor_id") if doc_doc else "DOC-102"
    doc_token = create_access_token({"sub": doc_id, "phone": doc_doc.get("phone", "9823000002") if doc_doc else "9823000002", "role": "doctor"})
    headers_doc = {"Authorization": f"Bearer {doc_token}"}

    pat_id = "P-4559"
    pat_token = create_access_token({"sub": pat_id, "phone": "9324998108", "role": "patient"})
    headers_pat = {"Authorization": f"Bearer {pat_token}"}

    test_sym_id = None
    created_notif_ids = []

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:

            # ---------------------------------------------------------
            # TEST 1: Initial state check - verify no Meena Devi or Sunita Devi notifications
            # ---------------------------------------------------------
            print("\n[TEST 1] Verifying no test patient notifications exist in Doctor feed...")
            res_init = await client.get("/api/doctor/notifications", headers=headers_doc)
            assert res_init.status_code == 200
            initial_notifs = res_init.json()

            for n in initial_notifs:
                p_name = n.get("patient_name") or ""
                assert p_name != "Meena Devi", f"Found unwanted Meena Devi notification: {n}"
                assert p_name != "Sunita Devi", f"Found unwanted Sunita Devi notification: {n}"
                assert "Shreya Shinde" not in p_name, f"Found incorrect identity: {n}"
            print(f"[OK] Clean feed verified: {len(initial_notifs)} legitimate notification(s), 0 test patient leaks.")

            # ---------------------------------------------------------
            # TEST 2: Patient submits new online symptom -> unread notification created immediately
            # ---------------------------------------------------------
            print("\n[TEST 2] Patient Shreya submits new online symptom...")
            res_sym = await client.post(
                "/api/patient/symptoms",
                json={
                    "symptoms": ["fatigue", "dizziness"],
                    "description": "Mild dizziness and fatigue in afternoon",
                    "severity": "moderate",
                    "duration": "today",
                },
                headers=headers_pat,
            )
            assert res_sym.status_code == 201
            sym_data = res_sym.json()
            test_sym_id = sym_data["symptom_id"]
            print(f"[OK] Symptom created: {test_sym_id}")

            # Doctor fetches notifications -> must contain the new unread notification
            res_after = await client.get("/api/doctor/notifications", headers=headers_doc)
            assert res_after.status_code == 200
            after_notifs = res_after.json()
            assert len(after_notifs) > 0

            top_notif = after_notifs[0]
            assert top_notif["title"] == "New Symptom Report"
            assert top_notif["is_read"] is False, "Expected new symptom notification to be unread (is_read=False)"
            assert top_notif["patient_name"] == "Shreya"
            created_notif_ids.append(top_notif["notification_id"])
            print(f"[OK] New unread notification received: ID={top_notif['notification_id']}, is_read={top_notif['is_read']}, Title='{top_notif['title']}'")

            # ---------------------------------------------------------
            # TEST 3: Marking single notification as read updates is_read flag
            # ---------------------------------------------------------
            print("\n[TEST 3] Marking notification as read (PATCH /api/doctor/notifications/{id}/read)...")
            notif_id = top_notif["notification_id"]
            res_read = await client.patch(f"/api/doctor/notifications/{notif_id}/read", headers=headers_doc)
            assert res_read.status_code == 200

            # Fetch again to verify updated read state
            res_after_read = await client.get("/api/doctor/notifications", headers=headers_doc)
            assert res_after_read.status_code == 200
            updated_list = res_after_read.json()
            target_notif = next((n for n in updated_list if n["notification_id"] == notif_id), None)
            assert target_notif is not None
            assert target_notif["is_read"] is True, f"Expected is_read=True, got {target_notif['is_read']}"
            print(f"[OK] Notification {notif_id} successfully marked as read (is_read=True).")

            # ---------------------------------------------------------
            # TEST 4: Mark all notifications as read (PATCH /api/doctor/notifications/read-all)
            # ---------------------------------------------------------
            print("\n[TEST 4] Marking all doctor notifications as read...")
            res_read_all = await client.patch("/api/doctor/notifications/read-all", headers=headers_doc)
            assert res_read_all.status_code == 200

            res_final = await client.get("/api/doctor/notifications", headers=headers_doc)
            assert res_final.status_code == 200
            final_notifs = res_final.json()
            unread_count = len([n for n in final_notifs if not n.get("is_read")])
            assert unread_count == 0, f"Expected 0 unread notifications, got {unread_count}"
            print("[OK] All notifications confirmed as read (unread count = 0).")

    finally:
        # Clean up temporary test symptom & notification
        if test_sym_id:
            if symptoms_col is not None:
                await symptoms_col.delete_many({"symptom_id": test_sym_id})
            if notifs_col is not None:
                await notifs_col.delete_many({"symptom_id": test_sym_id})
        if created_notif_ids and notifs_col is not None:
            await notifs_col.delete_many({"notification_id": {"$in": created_notif_ids}})

        await close_mongo_connection()

    print("\n==================================================")
    print(" ALL DOCTOR NOTIFICATION BADGE TESTS PASSED!      ")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(run_badge_tests())
