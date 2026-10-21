import asyncio
import httpx
from database import connect_to_mongo, close_mongo_connection, get_collection, COLLECTION_EMERGENCY_ALERTS, COLLECTION_PATIENTS, COLLECTION_ASHA_WORKERS, COLLECTION_DOCTORS

BASE_URL = "http://127.0.0.1:8000/api"

async def run_tests():
    print("=== STARTING SOS ACKNOWLEDGE + ASHA IDENTITY + OFFLINE/ONLINE SYNC TESTS ===")
    await connect_to_mongo()
    alerts_col = get_collection(COLLECTION_EMERGENCY_ALERTS)
    patients_col = get_collection(COLLECTION_PATIENTS)
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)
    doctors_col = get_collection(COLLECTION_DOCTORS)

    # Clean prior test alerts if any
    await alerts_col.delete_many({"patient_id": "P-4559"})

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=15.0) as client:
        # 1. Login Patient Shreya (P-4559)
        print("\n[STEP 1] Login Patient Shreya (P-4559, phone: 9324998108)...")
        res = await client.post("/patient/login", json={"phone": "9324998108", "password": "123456"})
        assert res.status_code == 200, f"Patient login failed: {res.text}"
        pat_token = res.json()["access_token"]
        pat_user = res.json()["patient"]
        assert pat_user["full_name"] == "Shreya", f"Expected Patient Shreya, got {pat_user['full_name']}"
        print("  -> Patient Shreya authenticated successfully.")

        # 2. Login ASHA Pooja Sharma (ASHA-340, phone: 9876543210)
        print("\n[STEP 2] Login ASHA Pooja Sharma (ASHA-340, phone: 9876543210)...")
        res = await client.post("/asha/login", json={"phone": "9876543210", "password": "123456"})
        assert res.status_code == 200, f"ASHA login failed: {res.text}"
        asha_token = res.json()["access_token"]
        asha_user = res.json()["asha_worker"]
        assert asha_user["full_name"] == "Pooja Sharma", f"Expected ASHA Pooja Sharma, got {asha_user['full_name']}"
        assert asha_user["worker_id"] == "ASHA-340", f"Expected ASHA-340, got {asha_user['worker_id']}"
        print("  -> ASHA Pooja Sharma (ASHA-340) authenticated successfully.")

        # 3. Login Doctor Ramesh Gupta (DOC-101)
        print("\n[STEP 3] Login Doctor Ramesh Gupta (DOC-101, phone: 9823000001)...")
        res = await client.post("/doctor/login", json={"phone": "9823000001", "password": "DoctorSecurePass123"})
        assert res.status_code == 200, f"Doctor login failed: {res.text}"
        doc_token = res.json()["access_token"]
        print("  -> Doctor authenticated successfully.")

        # =========================================================================
        # TEST A: ONLINE SOS TRIGGER + ACKNOWLEDGE
        # =========================================================================
        print("\n[TEST A] Online Emergency SOS Trigger by Patient Shreya...")
        sos_res = await client.post(
            "/emergency/sos",
            headers={"Authorization": f"Bearer {pat_token}"},
            json={
                "emergency_type": "general_sos",
                "emergency_notes": "Test Online SOS by Shreya",
                "gps_coordinates": {"lat": 19.9975, "lng": 73.7898},
            }
        )
        assert sos_res.status_code == 201, f"Online SOS failed: {sos_res.text}"
        alert_data = sos_res.json()
        alert_id = alert_data["alert_id"]
        print(f"  -> SOS alert created: {alert_id} for patient: {alert_data['patient_name']} (ASHA: {alert_data['asha_worker_name']})")
        assert alert_data["patient_name"] == "Shreya"
        assert alert_data["asha_worker_name"] == "Pooja Sharma"

        # Check ASHA active alerts
        asha_alerts_res = await client.get("/emergency/alerts/active", headers={"Authorization": f"Bearer {asha_token}"})
        assert asha_alerts_res.status_code == 200
        asha_alerts = asha_alerts_res.json()
        assert len(asha_alerts) >= 1
        assert asha_alerts[0]["alert_id"] == alert_id
        print("  -> ASHA receives pending SOS alert.")

        # Check Doctor active alerts
        doc_alerts_res = await client.get("/emergency/alerts/active", headers={"Authorization": f"Bearer {doc_token}"})
        assert doc_alerts_res.status_code == 200
        doc_alerts = doc_alerts_res.json()
        assert len(doc_alerts) >= 1
        assert any(a["alert_id"] == alert_id for a in doc_alerts)
        print("  -> Doctor receives pending SOS alert.")

        # ASHA Acknowledges the SOS
        print(f"\n[TEST A - ACKNOWLEDGE] ASHA Pooja Sharma acknowledges SOS {alert_id}...")
        ack_res = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {asha_token}"},
            json={
                "status": "ASHA_ACKNOWLEDGED",
                "asha_status": "ACKNOWLEDGED",
                "notes": "Acknowledged by ASHA worker Pooja Sharma via dashboard",
            }
        )
        assert ack_res.status_code == 200, f"ASHA acknowledge failed: {ack_res.text}"
        ack_data = ack_res.json()
        assert ack_data["status"] == "ASHA_ACKNOWLEDGED"
        assert ack_data["asha_status"] == "ACKNOWLEDGED"
        print("  -> Backend acknowledged SOS successfully.")

        # Verify SOS disappeared from ASHA active alerts
        asha_alerts_after = (await client.get("/emergency/alerts/active", headers={"Authorization": f"Bearer {asha_token}"})).json()
        assert not any(a["alert_id"] == alert_id for a in asha_alerts_after), "Alert still in ASHA pending list!"
        print("  -> Alert disappeared from ASHA pending list.")

        # Verify SOS disappeared from Doctor active alerts
        doc_alerts_after = (await client.get("/emergency/alerts/active", headers={"Authorization": f"Bearer {doc_token}"})).json()
        assert not any(a["alert_id"] == alert_id for a in doc_alerts_after), "Alert still in Doctor pending list!"
        print("  -> Alert disappeared from Doctor pending list.")

        # Verify MongoDB record is NOT deleted
        db_doc = await alerts_col.find_one({"alert_id": alert_id})
        assert db_doc is not None, "MongoDB record was deleted!"
        assert db_doc["status"] == "ASHA_ACKNOWLEDGED"
        print("  -> MongoDB record retained for history/audit.")

        # =========================================================================
        # TEST B: OFFLINE SOS BATCH SYNC + DEDUPLICATION
        # =========================================================================
        print("\n[TEST B] Offline SOS Batch Sync by Patient Shreya...")
        offline_id_1 = "Q-SOS-1728312000-1234"
        sync_payload = {
            "batch_id": "SYNC-TEST-BATCH-1",
            "items": [
                {
                    "client_id": offline_id_1,
                    "type": "emergency_sos",
                    "client_created_at": "2026-10-07T12:00:00Z",
                    "payload": {
                        "emergency_type": "general_sos",
                        "emergency_notes": "Urgent assistance needed - Shreya in Chandapur (Offline Queued)",
                        "offline_id": offline_id_1,
                        "patient_id": "P-4559",
                        "patient_name": "Shreya",
                        "village": "Chandapur",
                        "gps_coordinates": {"lat": 19.9975, "lng": 73.7898},
                    }
                }
            ]
        }

        sync_res = await client.post(
            "/sync/batch",
            headers={"Authorization": f"Bearer {pat_token}"},
            json=sync_payload,
        )
        assert sync_res.status_code == 200, f"Sync batch failed: {sync_res.text}"
        sync_result = sync_res.json()
        assert sync_result["synced_count"] == 1
        synced_item = sync_result["results"][0]
        assert synced_item["status"] == "synced"
        synced_alert_id = synced_item["server_id"]
        print(f"  -> Offline SOS synchronized: {synced_alert_id}")

        # Check ASHA receives the synced offline SOS
        asha_alerts_res2 = await client.get("/emergency/alerts/active", headers={"Authorization": f"Bearer {asha_token}"})
        assert asha_alerts_res2.status_code == 200
        asha_alerts2 = asha_alerts_res2.json()
        assert any(a["alert_id"] == synced_alert_id for a in asha_alerts2)
        print("  -> ASHA receives synced offline SOS alert.")

        # Check Doctor receives the synced offline SOS
        doc_alerts_res2 = await client.get("/emergency/alerts/active", headers={"Authorization": f"Bearer {doc_token}"})
        assert doc_alerts_res2.status_code == 200
        doc_alerts2 = doc_alerts_res2.json()
        assert any(a["alert_id"] == synced_alert_id for a in doc_alerts2)
        print("  -> Doctor receives synced offline SOS alert.")

        # =========================================================================
        # TEST C: OFFLINE SOS DEDUPLICATION CHECK
        # =========================================================================
        print("\n[TEST C] Re-submitting the same offline SOS (deduplication check)...")
        sync_res_dup = await client.post(
            "/sync/batch",
            headers={"Authorization": f"Bearer {pat_token}"},
            json=sync_payload,
        )
        assert sync_res_dup.status_code == 200
        dup_result = sync_res_dup.json()
        assert dup_result["already_synced_count"] == 1
        assert dup_result["results"][0]["status"] == "already_synced"
        print("  -> Re-submitted offline SOS returned 'already_synced' without creating a duplicate!")

        # Verify exact number of documents in MongoDB with this offline_id
        count_offline = await alerts_col.count_documents({"offline_id": offline_id_1})
        assert count_offline == 1, f"Expected 1 document, found {count_offline}"
        print(f"  -> MongoDB contains exactly {count_offline} document for offline_id {offline_id_1}.")

        # Acknowledge the synced SOS
        ack_res2 = await client.patch(
            f"/emergency/alerts/{synced_alert_id}/status",
            headers={"Authorization": f"Bearer {asha_token}"},
            json={
                "status": "ASHA_ACKNOWLEDGED",
                "asha_status": "ACKNOWLEDGED",
                "notes": "Acknowledged by ASHA worker Pooja Sharma",
            }
        )
        assert ack_res2.status_code == 200
        print("  -> Synced offline SOS acknowledged by ASHA worker.")

        # Verify cleared from both
        asha_after2 = (await client.get("/emergency/alerts/active", headers={"Authorization": f"Bearer {asha_token}"})).json()
        assert not any(a["alert_id"] == synced_alert_id for a in asha_after2)
        doc_after2 = (await client.get("/emergency/alerts/active", headers={"Authorization": f"Bearer {doc_token}"})).json()
        assert not any(a["alert_id"] == synced_alert_id for a in doc_after2)
        print("  -> Synced SOS disappeared from both ASHA and Doctor active screens.")

    await close_mongo_connection()
    print("\n=== ALL BACKEND SOS, ACKNOWLEDGE, AND SYNC TESTS PASSED! ===")

if __name__ == "__main__":
    asyncio.run(run_tests())
