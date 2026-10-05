import asyncio
import random
from httpx import AsyncClient, ASGITransport
from main import app
from database import (
    get_collection,
    COLLECTION_CONSULTATIONS,
    COLLECTION_PATIENTS,
    COLLECTION_DOCTORS,
    COLLECTION_ASHA_WORKERS,
    connect_to_mongo,
    close_mongo_connection,
)


async def run_tests():
    print("==================================================")
    print("   AyushLink Teleconsultation Layer Test Suite    ")
    print("==================================================")

    await connect_to_mongo()
    cons_col = get_collection(COLLECTION_CONSULTATIONS)
    patients_col = get_collection(COLLECTION_PATIENTS)
    doctors_col = get_collection(COLLECTION_DOCTORS)
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)

    phone_suffix = random.randint(10000, 99999)
    phone_doctor = f"98230{phone_suffix}"
    phone_patient1 = f"98231{phone_suffix}"
    phone_patient2 = f"98232{phone_suffix}"
    phone_asha = f"98765{phone_suffix}"

    created_cons_ids = []
    created_pids = []
    doc_id = None

    # Pre-test cleanup
    for col in [cons_col, patients_col, doctors_col, asha_col]:
        if col is not None:
            await col.delete_many({"phone": {"$in": [phone_doctor, phone_patient1, phone_patient2, phone_asha]}})

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:

            # ---------------------------------------------------------
            # SETUP: Register Doctor, Patient, and ASHA Worker
            # ---------------------------------------------------------
            print("\n[SETUP] Registering test Doctor, Patient, and ASHA worker...")

            # 1. Register Doctor
            res_doc = await client.post("/api/doctor/register", json={
                "full_name": "Dr. Anjali Rao",
                "phone": phone_doctor,
                "password": "DocPassword123",
                "specialization": "General Physician",
            })
            assert res_doc.status_code == 201
            token_doc = res_doc.json()["access_token"]
            doc_id = res_doc.json()["doctor"]["doctor_id"]
            headers_doc = {"Authorization": f"Bearer {token_doc}"}

            # 2. Register Patient 1 & Patient 2
            res_pat = await client.post("/api/patient/register", json={
                "full_name": "TestPatient Alpha",
                "phone": phone_patient1,
                "password": "PatPassword123",
                "gender": "female",
                "village": "Chandapur",
                "age": 32,
            })
            assert res_pat.status_code == 201, f"Expected 201, got {res_pat.status_code}: {res_pat.json()}"
            token_pat = res_pat.json()["access_token"]
            pid = res_pat.json()["patient"]["patient_id"]
            created_pids.append(pid)
            headers_pat = {"Authorization": f"Bearer {token_pat}"}

            res_pat2 = await client.post("/api/patient/register", json={
                "full_name": "TestPatient Beta",
                "phone": phone_patient2,
                "password": "PatPassword123",
                "gender": "male",
                "village": "Chandapur",
                "age": 45,
            })
            assert res_pat2.status_code == 201
            pid2 = res_pat2.json()["patient"]["patient_id"]
            created_pids.append(pid2)

            # 3. Register ASHA Worker
            res_asha = await client.post("/api/asha/register", json={
                "full_name": "ASHA Suman",
                "phone": phone_asha,
                "password": "AshaPassword123",
                "assigned_villages": ["Chandapur"],
            })
            assert res_asha.status_code == 201
            token_asha = res_asha.json()["access_token"]
            headers_asha = {"Authorization": f"Bearer {token_asha}"}

            print(f"[OK] Setup complete: Doctor {doc_id}, Patients {created_pids}, ASHA Suman")

            # ---------------------------------------------------------
            # TEST 1: Patient Creates Consultation Request
            # ---------------------------------------------------------
            print("\n[TEST 1] Patient creating consultation request (POST /api/consultations/request)...")
            req_payload = {
                "reason": "High fever follow-up and chest congestion",
                "symptoms": ["High Fever", "Chest pain"],
                "urgency": "urgent",
                "notes": "Fever persisting despite medication",
            }
            res_req1 = await client.post("/api/consultations/request", json=req_payload, headers=headers_pat)
            assert res_req1.status_code == 201, f"Expected 201, got {res_req1.status_code}: {res_req1.json()}"
            cons1_data = res_req1.json()
            cons1_id = cons1_data["consultation_id"]
            created_cons_ids.append(cons1_id)
            assert cons1_data["status"] == "requested"
            assert cons1_data["urgency"] == "urgent"
            assert cons1_data["patient_id"] == pid
            assert "call_session" in cons1_data
            assert cons1_data["call_session"]["session_status"] == "idle"
            print(f"[OK] Consultation request 1 created: ID={cons1_id}, Status={cons1_data['status']}, CallRoom={cons1_data['call_session']['room_id']}")

            # ---------------------------------------------------------
            # TEST 1b: Duplicate Request Prevention (Calling again returns existing active request)
            # ---------------------------------------------------------
            print("\n[TEST 1b] Testing duplicate request prevention (same patient requesting again)...")
            res_req1_dup = await client.post("/api/consultations/request", json=req_payload, headers=headers_pat)
            assert res_req1_dup.status_code == 201 or res_req1_dup.status_code == 200
            assert res_req1_dup.json()["consultation_id"] == cons1_id
            print(f"[OK] Duplicate prevention confirmed: Returned existing consultation {cons1_id}")

            # ---------------------------------------------------------
            # TEST 2: ASHA Worker Creates Consultation Request on Behalf of Patient
            # ---------------------------------------------------------
            print("\n[TEST 2] ASHA Worker creating consultation request for patient...")
            asha_req_payload = {
                "patient_id": pid2,
                "reason": "Skin rash evaluation",
                "symptoms": ["Skin lesion"],
                "urgency": "routine",
            }
            res_req2 = await client.post("/api/consultations/request", json=asha_req_payload, headers=headers_asha)
            assert res_req2.status_code == 201
            cons2_data = res_req2.json()
            cons2_id = cons2_data["consultation_id"]
            created_cons_ids.append(cons2_id)
            assert cons2_data["requested_by"] == "asha", f"Expected asha, got {cons2_data.get('requested_by')} in {cons2_data}"
            print(f"[OK] Consultation request 2 created by ASHA: ID={cons2_id}")

            # ---------------------------------------------------------
            # TEST 3: Doctor Views Consultation Queue & History (GET /api/consultations/history)
            # ---------------------------------------------------------
            print("\n[TEST 3] Doctor viewing consultation queue (GET /api/consultations/history)...")
            res_doc_hist = await client.get("/api/consultations/history", headers=headers_doc)
            assert res_doc_hist.status_code == 200
            doc_cons_list = res_doc_hist.json()
            assert len(doc_cons_list) >= 2
            print(f"[OK] Doctor retrieved {len(doc_cons_list)} pending/active consultation(s)")

            # ---------------------------------------------------------
            # TEST 4: Doctor Accepts Consultation Request 1
            # ---------------------------------------------------------
            print(f"\n[TEST 4] Doctor accepting consultation {cons1_id} (POST /api/consultations/{cons1_id}/decision)...")
            res_accept = await client.post(
                f"/api/consultations/{cons1_id}/decision",
                json={"action": "accept", "notes": "Case accepted. Ready for video/audio call."},
                headers=headers_doc,
            )
            assert res_accept.status_code == 200, f"Expected 200, got {res_accept.status_code}: {res_accept.json()}"
            accept_data = res_accept.json()
            assert accept_data["status"] == "accepted"
            assert accept_data["doctor_id"] == doc_id
            assert accept_data["doctor_name"] == "Dr. Anjali Rao"
            assert accept_data["call_session"]["session_status"] == "ready"
            print(f"[OK] Consultation {cons1_id} accepted: Doctor assigned={doc_id}, CallStatus={accept_data['call_session']['session_status']}")

            # ---------------------------------------------------------
            # TEST 5: Doctor Rejects Consultation Request 2
            # ---------------------------------------------------------
            print(f"\n[TEST 5] Doctor rejecting consultation {cons2_id}...")
            res_reject = await client.post(
                f"/api/consultations/{cons2_id}/decision",
                json={"action": "reject", "notes": "Please refer to dermatology OPD at civil hospital."},
                headers=headers_doc,
            )
            assert res_reject.status_code == 200
            reject_data = res_reject.json()
            assert reject_data["status"] == "rejected"
            assert reject_data["notes"].startswith("Please refer")
            print(f"[OK] Consultation {cons2_id} rejected with physician explanation")

            # ---------------------------------------------------------
            # TEST 6: Update Consultation Status (in_progress -> completed)
            # ---------------------------------------------------------
            print(f"\n[TEST 6] Progressing consultation status to in_progress and then completed...")
            # in_progress
            res_prog = await client.patch(
                f"/api/consultations/{cons1_id}/status",
                json={"status": "in_progress", "notes": "Consultation call in progress"},
                headers=headers_doc,
            )
            assert res_prog.status_code == 200
            assert res_prog.json()["status"] == "in_progress"
            assert res_prog.json()["call_session"]["session_status"] == "active"

            # completed
            res_comp = await client.patch(
                f"/api/consultations/{cons1_id}/status",
                json={"status": "completed", "notes": "Consultation finished. Prescribed medication."},
                headers=headers_doc,
            )
            assert res_comp.status_code == 200
            assert res_comp.json()["status"] == "completed"
            assert res_comp.json()["call_session"]["session_status"] == "ended"
            print(f"[OK] Consultation {cons1_id} completed successfully. Session closed.")

            # ---------------------------------------------------------
            # TEST 7: Patient Views Own Consultation History
            # ---------------------------------------------------------
            print("\n[TEST 7] Patient viewing consultation history...")
            res_pat_hist = await client.get("/api/consultations/history", headers=headers_pat)
            assert res_pat_hist.status_code == 200
            pat_hist = res_pat_hist.json()
            assert len(pat_hist) >= 1
            assert any(c["consultation_id"] == cons1_id for c in pat_hist)
            print(f"[OK] Patient successfully retrieved own history with {len(pat_hist)} consultation(s)")

            # ---------------------------------------------------------
            # TEST 8: Role-Based Authorization Rejection
            # ---------------------------------------------------------
            print("\n[TEST 8] Testing Role-Based Authorization Rejections...")

            # Patient attempting to accept/reject consultation
            res_pat_decision = await client.post(
                f"/api/consultations/{cons1_id}/decision",
                json={"action": "accept"},
                headers=headers_pat,
            )
            assert res_pat_decision.status_code == 403, f"Expected 403, got {res_pat_decision.status_code}"
            print(f"[OK] Patient blocked from doctor decision endpoint with 403")

            # ASHA attempting to accept/reject consultation
            res_asha_decision = await client.post(
                f"/api/consultations/{cons1_id}/decision",
                json={"action": "accept"},
                headers=headers_asha,
            )
            assert res_asha_decision.status_code == 403
            print(f"[OK] ASHA worker blocked from doctor decision endpoint with 403")

            # Unauthenticated request
            res_no_tok = await client.get("/api/consultations/history")
            assert res_no_tok.status_code == 401
            print(f"[OK] Unauthenticated request blocked with 401 Unauthorized")

    finally:
        # Clean up all created test accounts and test consultations
        print("\n[TEARDOWN] Cleaning up test consultations, patients, and accounts...")
        for col in [cons_col, patients_col, doctors_col, asha_col]:
            if col is not None:
                await col.delete_many({"phone": {"$in": [phone_doctor, phone_patient1, phone_patient2, phone_asha]}})
                if created_pids:
                    await col.delete_many({"patient_id": {"$in": created_pids}})
        if cons_col is not None and created_cons_ids:
            await cons_col.delete_many({"consultation_id": {"$in": created_cons_ids}})

        await close_mongo_connection()
        print("[OK] Teardown complete: Zero test records left behind.")

    print("\n==================================================")
    print("   ALL TELECONSULTATION TESTS PASSED!             ")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(run_tests())
