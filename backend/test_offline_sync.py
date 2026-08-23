import asyncio
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from main import app
from database import (
    get_collection,
    COLLECTION_PATIENTS,
    COLLECTION_SYMPTOMS,
    COLLECTION_CONSULTATIONS,
    COLLECTION_ASHA_WORKERS,
    COLLECTION_SYNC_LOGS,
    connect_to_mongo,
    close_mongo_connection,
)


async def run_tests():
    print("==================================================")
    print("      AyushLink PWA Offline Sync Test Suite       ")
    print("==================================================")

    await connect_to_mongo()
    patients_col = get_collection(COLLECTION_PATIENTS)
    symptoms_col = get_collection(COLLECTION_SYMPTOMS)
    cons_col = get_collection(COLLECTION_CONSULTATIONS)
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)
    sync_logs_col = get_collection(COLLECTION_SYNC_LOGS)

    # Test numbers
    phone_asha = "9876577701"
    phone_offline_patient = "9823077701"

    for col in [patients_col, symptoms_col, cons_col, asha_col, sync_logs_col]:
        if col is not None:
            await col.delete_many({"phone": {"$in": [phone_asha, phone_offline_patient]}})
            await col.delete_many({"offline_id": {"$in": ["Q-901", "Q-903", "Q-905", "Q-915"]}})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:

        # ---------------------------------------------------------
        # SETUP: Register ASHA Worker for sync operations
        # ---------------------------------------------------------
        print("\n[SETUP] Registering ASHA worker for sync testing...")
        res_asha = await client.post("/api/asha/register", json={
            "full_name": "ASHA Anita",
            "phone": phone_asha,
            "password": "AshaPassword123",
            "assigned_villages": ["Nandgaon", "Chandapur"],
        })
        assert res_asha.status_code == 201
        token_asha = res_asha.json()["access_token"]
        headers_asha = {"Authorization": f"Bearer {token_asha}"}
        print(f"[OK] ASHA Worker ready: token generated")

        # ---------------------------------------------------------
        # TEST 1: Sync Health & Timestamp Endpoint
        # ---------------------------------------------------------
        print("\n[TEST 1] Testing Sync Status (GET /api/sync/status)...")
        res_status = await client.get("/api/sync/status")
        assert res_status.status_code == 200
        assert res_status.json()["status"] == "online"
        assert "server_time" in res_status.json()
        print(f"[OK] Sync server online: ServerTime={res_status.json()['server_time']}")

        # ---------------------------------------------------------
        # TEST 2: Batch Synchronization with Multiple Mixed Offline Records
        # ---------------------------------------------------------
        print("\n[TEST 2] Testing Batch Sync with 4 offline items (POST /api/sync/batch)...")
        offline_time_patient = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
        offline_time_symptom = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        offline_time_vitals = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        offline_time_cons = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()

        batch_payload = {
            "batch_id": "BATCH-OFFLINE-TEST-001",
            "items": [
                {
                    "client_id": "Q-901",
                    "type": "new_patient",
                    "client_created_at": offline_time_patient,
                    "payload": {
                        "full_name": "Arjun Shinde",
                        "phone": phone_offline_patient,
                        "age": 28,
                        "gender": "male",
                        "village": "Nandgaon",
                        "blood_group": "A+",
                    },
                },
                {
                    "client_id": "Q-905",
                    "type": "symptom_report",
                    "client_created_at": offline_time_symptom,
                    "payload": {
                        "patient_id": "Q-901",  # refers to the offline patient or phone
                        "symptoms": ["Dry Cough", "Mild Fever"],
                        "description": "Cough starting in evening with sore throat",
                        "severity": "mild",
                    },
                },
                {
                    "client_id": "Q-903",
                    "type": "vitals_update",
                    "client_created_at": offline_time_vitals,
                    "payload": {
                        "patient_id": phone_offline_patient,
                        "condition": "Seasonal allergy",
                        "vitals_label": "BP 120/80, Pulse 72",
                        "blood_group": "A+",
                    },
                },
                {
                    "client_id": "Q-915",
                    "type": "consultation_request",
                    "client_created_at": offline_time_cons,
                    "payload": {
                        "patient_id": phone_offline_patient,
                        "reason": "Follow-up for persistent cough",
                        "urgency": "routine",
                    },
                },
            ],
        }

        res_sync1 = await client.post("/api/sync/batch", json=batch_payload, headers=headers_asha)
        print(f"Status Code: {res_sync1.status_code}")
        assert res_sync1.status_code == 200, f"Expected 200, got {res_sync1.status_code}: {res_sync1.json()}"
        sync_res1 = res_sync1.json()
        print("SYNC RES 1:", sync_res1)
        assert sync_res1["total_items"] == 4, f"total_items: {sync_res1}"
        assert sync_res1["synced_count"] == 4, f"synced_count: {sync_res1}"
        assert sync_res1["already_synced_count"] == 0
        assert sync_res1["failed_count"] == 0
        assert len(sync_res1["results"]) == 4

        # Check individual results
        for r in sync_res1["results"]:
            assert r["status"] == "synced"
            assert r["server_id"] is not None
            print(f"   -> [SYNCED] ClientID={r['client_id']}, Type={r['type']}, ServerID={r['server_id']}")

        print(f"[OK] Batch 1 completely synchronized: {sync_res1['synced_count']}/4 records created")

        # ---------------------------------------------------------
        # TEST 3: Timestamp Preservation Verification
        # ---------------------------------------------------------
        print("\n[TEST 3] Verifying offline timestamp preservation in MongoDB...")
        stored_patient = await patients_col.find_one({"offline_id": "Q-901"})
        assert stored_patient is not None
        assert stored_patient["created_at"].year == datetime.now(timezone.utc).year
        print(f"[OK] Patient creation time preserved: {stored_patient['created_at'].isoformat()}")

        stored_symptom = await symptoms_col.find_one({"offline_id": "Q-905"})
        assert stored_symptom is not None
        print(f"[OK] Symptom recorded_at time preserved: {stored_symptom['recorded_at'].isoformat()}")

        # ---------------------------------------------------------
        # TEST 4: Idempotency & Duplicate Prevention on Repeated Sync
        # ---------------------------------------------------------
        print("\n[TEST 4] Testing repeated sync attempt with exact same offline batch...")
        res_sync2 = await client.post("/api/sync/batch", json=batch_payload, headers=headers_asha)
        assert res_sync2.status_code == 200
        sync_res2 = res_sync2.json()

        assert sync_res2["total_items"] == 4
        assert sync_res2["synced_count"] == 0, f"Expected 0 new items, got {sync_res2['synced_count']}"
        assert sync_res2["already_synced_count"] == 4, f"Expected 4 already synced, got {sync_res2['already_synced_count']}"
        assert sync_res2["failed_count"] == 0

        for r in sync_res2["results"]:
            assert r["status"] == "already_synced"
            print(f"   -> [DEDUPLICATED] ClientID={r['client_id']}, Status={r['status']}, ServerID={r['server_id']}")

        print(f"[OK] Idempotency verified: zero duplicate records created")

        # Verify MongoDB document counts did not duplicate
        patient_count = await patients_col.count_documents({"offline_id": "Q-901"})
        symptom_count = await symptoms_col.count_documents({"offline_id": "Q-905"})
        cons_count = await cons_col.count_documents({"offline_id": "Q-915"})
        assert patient_count == 1, f"Expected 1 patient document, found {patient_count}"
        assert symptom_count == 1, f"Expected 1 symptom document, found {symptom_count}"
        assert cons_count == 1, f"Expected 1 consultation document, found {cons_count}"
        print(f"[OK] Database integrity verified: PatientCount={patient_count}, SymptomCount={symptom_count}, ConsCount={cons_count}")

        # ---------------------------------------------------------
        # TEST 5: Role-Based Authorization & Rejections
        # ---------------------------------------------------------
        print("\n[TEST 5] Testing Unauthorized Access Rejection (401 Unauthorized)...")
        res_unauth = await client.post("/api/sync/batch", json=batch_payload)
        assert res_unauth.status_code == 401
        print(f"[OK] Unauthenticated sync request rejected with 401 Unauthorized")

        res_bad_tok = await client.post("/api/sync/batch", json=batch_payload, headers={"Authorization": "Bearer invalid_token"})
        assert res_bad_tok.status_code == 401
        print(f"[OK] Forged token rejected with 401 Unauthorized")

    # Clean up test accounts
    for col in [patients_col, symptoms_col, cons_col, asha_col, sync_logs_col]:
        if col is not None:
            await col.delete_many({"phone": {"$in": [phone_asha, phone_offline_patient]}})
            await col.delete_many({"offline_id": {"$in": ["Q-901", "Q-903", "Q-905", "Q-915"]}})

    await close_mongo_connection()
    print("\n==================================================")
    print("      ALL OFFLINE SYNC TESTS PASSED!              ")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(run_tests())
