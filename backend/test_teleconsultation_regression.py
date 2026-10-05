import asyncio
import random
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport
from main import app
from database import (
    get_collection,
    COLLECTION_CONSULTATIONS,
    COLLECTION_PATIENTS,
    COLLECTION_DOCTORS,
    connect_to_mongo,
    close_mongo_connection,
)
from services.security import create_access_token


async def run_regression_tests():
    print("==================================================")
    print(" AyushLink Teleconsultation Regression Test Suite ")
    print("==================================================")

    await connect_to_mongo()
    cons_col = get_collection(COLLECTION_CONSULTATIONS)
    patients_col = get_collection(COLLECTION_PATIENTS)
    doctors_col = get_collection(COLLECTION_DOCTORS)

    phone_suffix = random.randint(10000, 99999)
    doc_doc = await doctors_col.find_one({"doctor_id": "DOC-102"}) or await doctors_col.find_one({})
    doc_id = doc_doc.get("doctor_id") if doc_doc else "DOC-102"
    doc_phone = doc_doc.get("phone", "9823000002") if doc_doc else "9823000002"
    doc_token = create_access_token({"sub": doc_id, "phone": doc_phone, "role": "doctor"})
    headers_doc = {"Authorization": f"Bearer {doc_token}"}

    test_pat_id = f"P-TEST-{phone_suffix}"
    test_pat_phone = f"98233{phone_suffix}"
    await patients_col.insert_one({
        "patient_id": test_pat_id,
        "full_name": "Test Patient Regression",
        "phone": test_pat_phone,
        "gender": "female",
        "village": "Chandapur",
        "age": 30,
        "role": "patient",
    })

    pat_token = create_access_token({"sub": test_pat_id, "phone": test_pat_phone, "role": "patient"})
    headers_pat = {"Authorization": f"Bearer {pat_token}"}

    created_cons_ids = []

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:

            # ---------------------------------------------------------
            # TEST 1: Opening PatientCallScreen does NOT create a request
            # ---------------------------------------------------------
            print("\n[TEST 1] Verifying opening PatientCallScreen does NOT create requests...")
            initial_count = await cons_col.count_documents({"patient_id": test_pat_id})
            assert initial_count == 0

            # Simulate opening screen: GET active request + GET available doctors
            res_active = await client.get("/api/consultations/active-request", headers=headers_pat)
            assert res_active.status_code == 200
            assert res_active.json() is None

            res_docs = await client.get("/api/doctors")
            assert res_docs.status_code == 200

            count_after_open = await cons_col.count_documents({"patient_id": test_pat_id})
            assert count_after_open == 0, f"Expected 0 consultations, found {count_after_open}"
            print("[OK] Opening PatientCallScreen created 0 consultation requests.")

            # ---------------------------------------------------------
            # TEST 2: Refreshing & multiple screen renders do NOT create requests
            # ---------------------------------------------------------
            print("\n[TEST 2] Verifying refreshing / multiple renders do NOT create requests...")
            for i in range(5):
                res_check = await client.get("/api/consultations/active-request", headers=headers_pat)
                assert res_check.status_code == 200
                assert res_check.json() is None

            count_after_multi_refresh = await cons_col.count_documents({"patient_id": test_pat_id})
            assert count_after_multi_refresh == 0, f"Expected 0 consultations, found {count_after_multi_refresh}"
            print("[OK] 5 consecutive screen checks/refreshes created 0 consultation requests.")

            # ---------------------------------------------------------
            # TEST 3: One explicit request action creates exactly ONE consultation request
            # ---------------------------------------------------------
            print("\n[TEST 3] Testing explicit user consultation request (POST /api/consultations/request)...")
            req_payload = {
                "doctor_id": doc_id,
                "reason": "Cold and headache follow-up",
                "urgency": "routine",
                "symptoms": ["Headache", "Cold"],
            }
            res_create = await client.post("/api/consultations/request", json=req_payload, headers=headers_pat)
            assert res_create.status_code == 201, f"Expected 201, got {res_create.status_code}: {res_create.json()}"
            cons_data = res_create.json()
            cons_id = cons_data["consultation_id"]
            created_cons_ids.append(cons_id)
            assert cons_data["status"] == "requested"
            assert cons_data["patient_id"] == test_pat_id

            count_after_first_req = await cons_col.count_documents({"patient_id": test_pat_id})
            assert count_after_first_req == 1, f"Expected 1 consultation, found {count_after_first_req}"
            print(f"[OK] Exactly 1 consultation created on explicit button click: {cons_id}")

            # ---------------------------------------------------------
            # TEST 4: Repeating the same request / retry does NOT create duplicates
            # ---------------------------------------------------------
            print("\n[TEST 4] Testing duplicate request prevention on rapid button clicks / retries...")
            for i in range(3):
                res_retry = await client.post("/api/consultations/request", json=req_payload, headers=headers_pat)
                assert res_retry.status_code in [200, 201]
                retry_data = res_retry.json()
                assert retry_data["consultation_id"] == cons_id, f"Expected same consultation_id {cons_id}, got {retry_data.get('consultation_id')}"

            count_after_retries = await cons_col.count_documents({"patient_id": test_pat_id})
            assert count_after_retries == 1, f"Expected strictly 1 consultation, found {count_after_retries}"
            print(f"[OK] Deduplication verified: 3 repeated requests returned existing consultation {cons_id} with 0 duplicates.")

            # ---------------------------------------------------------
            # TEST 5: Offline teleconsultation sync compatibility & deduplication
            # ---------------------------------------------------------
            print("\n[TEST 5] Testing offline teleconsultation sync compatibility & deduplication...")
            offline_client_id = f"OFFLINE-CONS-{phone_suffix}"
            offline_batch = {
                "batch_id": f"BATCH-{offline_client_id}",
                "items": [
                    {
                        "client_id": offline_client_id,
                        "type": "consultation_request",
                        "client_created_at": datetime.now(timezone.utc).isoformat(),
                        "payload": {
                            "patient_id": test_pat_id,
                            "reason": "Offline headache request",
                            "urgency": "routine",
                        },
                    }
                ],
            }
            # Active request already exists for this patient, so sync must return existing active request
            res_sync1 = await client.post("/api/sync/batch", json=offline_batch, headers=headers_pat)
            assert res_sync1.status_code == 200
            sync1_data = res_sync1.json()
            assert sync1_data["already_synced_count"] == 1
            assert sync1_data["results"][0]["server_id"] == cons_id
            print(f"[OK] Offline sync safely detected existing active request {cons_id} and prevented duplicate creation.")

            # ---------------------------------------------------------
            # TEST 6: Doctor triage queue shows ONLY genuine pending requests (NO Sunita Devi duplicates)
            # ---------------------------------------------------------
            print("\n[TEST 6] Verifying Doctor video triage queue...")
            res_triage = await client.get("/api/doctor/video-requests", headers=headers_doc)
            assert res_triage.status_code == 200
            triage_list = res_triage.json()
            
            # Check that Sunita Devi test requests do NOT appear
            sunita_requests = [c for c in triage_list if c.get("patient_name") == "Sunita Devi"]
            assert len(sunita_requests) == 0, f"Found unwanted Sunita Devi requests: {sunita_requests}"
            
            # Check that our test patient request is present
            matching_req = next((c for c in triage_list if c.get("consultation_id") == cons_id), None)
            assert matching_req is not None, f"Expected active request {cons_id} in doctor queue"
            print(f"[OK] Doctor triage verified: Exactly genuine pending requests shown, ZERO unwanted Sunita Devi requests.")

            # ---------------------------------------------------------
            # TEST 7: Doctor accepts and completes consultation cleanly
            # ---------------------------------------------------------
            print("\n[TEST 7] Progressing consultation to completion...")
            res_decide = await client.post(
                f"/api/consultations/{cons_id}/decision",
                json={"action": "accept", "notes": "Accepting regression test call"},
                headers=headers_doc,
            )
            assert res_decide.status_code == 200
            assert res_decide.json()["status"] == "accepted"

            res_end = await client.post(f"/api/consultations/{cons_id}/end-call", headers=headers_pat)
            assert res_end.status_code == 200
            assert res_end.json()["status"] == "completed"
            print(f"[OK] Consultation {cons_id} cleanly ended and completed.")

    finally:
        print("\n[TEARDOWN] Cleaning up regression test artifacts...")
        await patients_col.delete_one({"patient_id": test_pat_id})
        if created_cons_ids:
            await cons_col.delete_many({"consultation_id": {"$in": created_cons_ids}})
        await close_mongo_connection()
        print("[OK] Regression test teardown completed.")

    print("\n==================================================")
    print(" ALL TELECONSULTATION REGRESSION TESTS PASSED!    ")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(run_regression_tests())
