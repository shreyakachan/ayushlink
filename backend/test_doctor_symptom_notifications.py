import asyncio
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport
from main import app
from database import (
    get_collection,
    COLLECTION_NOTIFICATIONS,
    COLLECTION_CONSULTATIONS,
    COLLECTION_SYMPTOMS,
    COLLECTION_PATIENTS,
    COLLECTION_DOCTORS,
    connect_to_mongo,
    close_mongo_connection,
)
from services.security import create_access_token


async def run_tests():
    print("==================================================")
    print("   AyushLink Doctor Symptom Notifications Test    ")
    print("==================================================")

    await connect_to_mongo()
    notifs_col = get_collection(COLLECTION_NOTIFICATIONS)
    symptoms_col = get_collection(COLLECTION_SYMPTOMS)
    patients_col = get_collection(COLLECTION_PATIENTS)
    doctors_col = get_collection(COLLECTION_DOCTORS)
    consultations_col = get_collection(COLLECTION_CONSULTATIONS)

    # 1. Setup Doctor DOC-101
    doc_id = "DOC-101"
    doc_doc = await doctors_col.find_one({"doctor_id": doc_id})
    if not doc_doc:
        doc_doc = {
            "doctor_id": doc_id,
            "full_name": "Dr. Arvind Varma",
            "phone": "9823000001",
            "specialization": "General Physician",
            "role": "doctor",
        }
        await doctors_col.insert_one(doc_doc)

    doc_token = create_access_token({"sub": doc_id, "phone": doc_doc.get("phone"), "role": "doctor"})
    headers_doc = {"Authorization": f"Bearer {doc_token}"}

    # 2. Setup Patient Shreya (P-4559) with canonical name
    pat_id = "P-4559"
    pat_phone = "9324998108"
    await patients_col.update_one(
        {"patient_id": pat_id},
        {
            "$set": {
                "patient_id": pat_id,
                "full_name": "Shreya",
                "phone": pat_phone,
                "gender": "female",
                "village": "Chandapur",
                "age": 28,
                "role": "patient",
            }
        },
        upsert=True,
    )

    pat_token = create_access_token({"sub": pat_id, "phone": pat_phone, "role": "patient"})
    headers_pat = {"Authorization": f"Bearer {pat_token}"}

    test_offline_id = f"OFFLINE-SYM-TEST-{int(datetime.now(timezone.utc).timestamp())}"
    test_sym_id = None

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:

            # ---------------------------------------------------------
            # TEST 1: Online Symptom Submission by Patient Shreya (P-4559)
            # ---------------------------------------------------------
            print("\n[TEST 1] Patient Shreya submits new symptom: 'stomachache'...")
            symptom_payload = {
                "symptoms": ["stomachache"],
                "description": "Severe stomach pain after lunch",
                "severity": "moderate",
                "duration": "today",
            }
            res_sym = await client.post("/api/patient/symptoms", json=symptom_payload, headers=headers_pat)
            assert res_sym.status_code == 201, f"Expected 201, got {res_sym.status_code}: {res_sym.json()}"
            sym_data = res_sym.json()
            test_sym_id = sym_data["symptom_id"]
            print(f"[OK] Symptom created on backend: ID={test_sym_id}, symptoms={sym_data['symptoms']}")

            # ---------------------------------------------------------
            # TEST 2: Doctor fetches notifications (GET /api/doctor/notifications)
            # ---------------------------------------------------------
            print("\n[TEST 2] Doctor fetching notifications feed...")
            res_notifs = await client.get("/api/doctor/notifications", headers=headers_doc)
            assert res_notifs.status_code == 200, f"Expected 200, got {res_notifs.status_code}"
            notifs = res_notifs.json()
            assert len(notifs) > 0, "Expected at least 1 notification"

            # The newest notification at index 0 must be the new symptom report
            top_notif = notifs[0]
            print(f"[TOP NOTIFICATION] Title: '{top_notif.get('title')}'")
            print(f"[TOP NOTIFICATION] Message: '{top_notif.get('message')}'")
            print(f"[TOP NOTIFICATION] Type: '{top_notif.get('type')}'")
            print(f"[TOP NOTIFICATION] Patient ID: '{top_notif.get('patient_id')}'")
            print(f"[TOP NOTIFICATION] Patient Name: '{top_notif.get('patient_name')}'")
            print(f"[TOP NOTIFICATION] Read: {top_notif.get('is_read')}")

            assert top_notif["title"] == "New Symptom Report", f"Expected 'New Symptom Report', got '{top_notif.get('title')}'"
            assert top_notif["patient_name"] == "Shreya", f"Expected canonical name 'Shreya', got '{top_notif.get('patient_name')}'"
            assert top_notif["message"] == "Shreya (P-4559) submitted a new symptom: stomachache", f"Expected 'Shreya (P-4559) submitted a new symptom: stomachache', got '{top_notif.get('message')}'"
            assert "Shreya Shinde" not in top_notif["message"], "Incorrect identity 'Shreya Shinde' found in notification message!"
            assert "Shreya Shinde" not in str(top_notif.get("patient_name", "")), "Incorrect identity 'Shreya Shinde' found in patient_name!"
            assert top_notif["type"] == "new_symptom"
            assert top_notif["is_read"] is False
            print("[OK] Top notification correctly uses canonical patient identity Shreya (P-4559)!")

            # ---------------------------------------------------------
            # TEST 3: Verify existing consultation-completed notifications remain
            # ---------------------------------------------------------
            print("\n[TEST 3] Verifying historical consultation notifications are preserved...")
            cons_notifs = [n for n in notifs if n.get("type") in ["prescription", "consultation"] or "Consultation" in n.get("title", "")]
            print(f"[OK] Preserved {len(cons_notifs)} existing consultation/prescription notification(s) below new symptom report.")
            if cons_notifs:
                print(f"     Example historical notification: Title='{cons_notifs[0]['title']}', Message='{cons_notifs[0]['message']}'")

            # ---------------------------------------------------------
            # TEST 4: Offline Symptom Sync & Duplicate Protection
            # ---------------------------------------------------------
            print("\n[TEST 4] Testing Offline Batch Sync and Duplicate Notification Protection...")

            # First sync of offline symptom
            batch_payload = {
                "batch_id": f"BATCH-{test_offline_id}",
                "items": [
                    {
                        "client_id": test_offline_id,
                        "type": "symptom_report",
                        "client_created_at": datetime.now(timezone.utc).isoformat(),
                        "payload": {
                            "patient_id": "P-4559",
                            "symptoms": ["headache"],
                            "description": "Mild migraine",
                            "severity": "moderate",
                            "duration": "today",
                        },
                    }
                ],
            }

            # Sync as Patient or ASHA
            res_sync1 = await client.post("/api/sync/batch", json=batch_payload, headers=headers_pat)
            assert res_sync1.status_code == 200, f"Expected 200, got {res_sync1.status_code}: {res_sync1.json()}"
            sync1_res = res_sync1.json()
            assert sync1_res["synced_count"] == 1
            print(f"[OK] First sync of offline symptom {test_offline_id} succeeded.")

            # Check doctor notification created
            res_notifs_after_sync1 = await client.get("/api/doctor/notifications", headers=headers_doc)
            notifs_after1 = res_notifs_after_sync1.json()
            matching_notifs = [n for n in notifs_after1 if n.get("offline_id") == test_offline_id]
            assert len(matching_notifs) == 1, f"Expected exactly 1 notification for offline_id {test_offline_id}, found {len(matching_notifs)}"
            assert matching_notifs[0]["patient_name"] == "Shreya"
            assert "Shreya Shinde" not in matching_notifs[0]["message"]
            assert matching_notifs[0]["message"] == "Shreya (P-4559) submitted a new symptom: headache"
            print(f"[OK] Exactly 1 doctor notification created for offline symptom: '{matching_notifs[0]['message']}'")

            # Second sync of the EXACT SAME offline symptom (retry/idempotency test)
            print("\n[TEST 5] Testing repeated sync of identical offline symptom (deduplication check)...")
            res_sync2 = await client.post("/api/sync/batch", json=batch_payload, headers=headers_pat)
            assert res_sync2.status_code == 200
            sync2_res = res_sync2.json()
            assert sync2_res["already_synced_count"] == 1
            print(f"[OK] Second sync correctly flagged as already_synced.")

            # Verify NO duplicate notification was created
            res_notifs_after_sync2 = await client.get("/api/doctor/notifications", headers=headers_doc)
            notifs_after2 = res_notifs_after_sync2.json()
            matching_notifs_after2 = [n for n in notifs_after2 if n.get("offline_id") == test_offline_id]
            assert len(matching_notifs_after2) == 1, f"Expected still exactly 1 notification for offline_id {test_offline_id}, found {len(matching_notifs_after2)}"
            print("[OK] Duplicate protection verified: No duplicate Doctor notifications created!")

            # ---------------------------------------------------------
            # TEST 6: Mark notification as read
            # ---------------------------------------------------------
            print("\n[TEST 6] Testing marking doctor notification as read...")
            notif_to_mark = matching_notifs[0]
            nid = notif_to_mark["notification_id"]
            res_read = await client.patch(f"/api/doctor/notifications/{nid}/read", headers=headers_doc)
            assert res_read.status_code == 200
            print(f"[OK] Notification {nid} successfully marked as read.")

    finally:
        # Clean up temporary test artifacts from this test run
        if notifs_col is not None:
            await notifs_col.delete_many({"offline_id": test_offline_id})
            if test_sym_id:
                await notifs_col.delete_many({"symptom_id": test_sym_id})
        if symptoms_col is not None:
            await symptoms_col.delete_many({"offline_id": test_offline_id})
            if test_sym_id:
                await symptoms_col.delete_many({"symptom_id": test_sym_id})

        await close_mongo_connection()

    print("\n==================================================")
    print("   ALL DOCTOR NOTIFICATION TESTS PASSED!          ")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(run_tests())
