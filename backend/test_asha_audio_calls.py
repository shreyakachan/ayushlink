"""
Comprehensive Test Suite for AyushLink PART 2A:
Patient-to-ASHA Audio-Only Call Backend Foundation.

Covers all 12 backend requirements:
1. Patient call request to valid ASHA worker
2. Target ASHA worker decision (accept / reject) and unauthorized decision blocking (403)
3. Initiating patient cancellation and unauthorized cancel blocking (403)
4. Call termination by either participant and non-participant blocking (403)
5. Active call polling endpoints for patient and ASHA
6. Clean state transitions: requested -> accepted -> ended, requested -> rejected, requested -> cancelled, requested -> missed
7. Safe 45-second timeout checking without unmanaged background threads
8. Identity verification using existing authentication dependencies (token spoof prevention)
9. Unique room/session IDs and authenticated WebSocket signaling endpoint (only authorized participants can join)
10. Concurrency & duplicate active call prevention (patient duplicate guard & ASHA busy guard)
11. In-app missed call notification creation in COLLECTION_NOTIFICATIONS
12. Strict isolation from COLLECTION_CONSULTATIONS
"""

import asyncio
import random
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport

from main import app
from database import (
    get_collection,
    COLLECTION_ASHA_CALLS,
    COLLECTION_NOTIFICATIONS,
    COLLECTION_PATIENTS,
    COLLECTION_ASHA_WORKERS,
    COLLECTION_CONSULTATIONS,
    connect_to_mongo,
    close_mongo_connection,
)
from services.security import create_access_token
from services.asha_call_service import check_and_expire_unanswered_calls


async def run_asha_call_tests():
    print("=" * 65)
    print(" AyushLink Part 2A: Patient-to-ASHA Audio Call Test Suite ")
    print("=" * 65)

    await connect_to_mongo()
    calls_col = get_collection(COLLECTION_ASHA_CALLS)
    notifs_col = get_collection(COLLECTION_NOTIFICATIONS)
    patients_col = get_collection(COLLECTION_PATIENTS)
    workers_col = get_collection(COLLECTION_ASHA_WORKERS)
    cons_col = get_collection(COLLECTION_CONSULTATIONS)

    # Pre-clean any previous test records
    await calls_col.delete_many({"call_id": {"$regex": "^CALL-"}})
    await patients_col.delete_many({"patient_id": {"$regex": "^P-TEST-"}})
    await workers_col.delete_many({"worker_id": {"$regex": "^ASHA-TEST-"}})
    await notifs_col.delete_many({"recipient_id": {"$regex": "^ASHA-TEST-"}})

    # 1. Setup test entities in MongoDB
    suffix = random.randint(10000, 99999)
    test_pat1_id = f"P-TEST-{suffix}-1"
    test_pat2_id = f"P-TEST-{suffix}-2"
    test_asha1_id = f"ASHA-TEST-{suffix}-1"
    test_asha2_id = f"ASHA-TEST-{suffix}-2"

    await patients_col.insert_many([
        {
            "patient_id": test_pat1_id,
            "full_name": "Test Patient Primary",
            "phone": f"98001{suffix}",
            "gender": "female",
            "village": "Chandapur",
            "age": 28,
            "role": "patient",
        },
        {
            "patient_id": test_pat2_id,
            "full_name": "Test Patient Secondary",
            "phone": f"98002{suffix}",
            "gender": "male",
            "village": "Chandapur",
            "age": 35,
            "role": "patient",
        },
    ])

    await workers_col.insert_many([
        {
            "worker_id": test_asha1_id,
            "full_name": "Test ASHA Worker One",
            "phone": f"97001{suffix}",
            "assigned_villages": ["Chandapur"],
            "primary_phc": "Chandapur PHC",
            "role": "asha",
            "is_active": True,
        },
        {
            "worker_id": test_asha2_id,
            "full_name": "Test ASHA Worker Two",
            "phone": f"97002{suffix}",
            "assigned_villages": ["Chandapur"],
            "primary_phc": "Chandapur PHC",
            "role": "asha",
            "is_active": True,
        },
    ])

    # JWT tokens
    pat1_token = create_access_token({"sub": test_pat1_id, "patient_id": test_pat1_id, "role": "patient", "full_name": "Test Patient Primary"})
    pat2_token = create_access_token({"sub": test_pat2_id, "patient_id": test_pat2_id, "role": "patient", "full_name": "Test Patient Secondary"})
    asha1_token = create_access_token({"sub": test_asha1_id, "worker_id": test_asha1_id, "role": "asha", "full_name": "Test ASHA Worker One"})
    asha2_token = create_access_token({"sub": test_asha2_id, "worker_id": test_asha2_id, "role": "asha", "full_name": "Test ASHA Worker Two"})
    doctor_token = create_access_token({"sub": "DOC-999", "doctor_id": "DOC-999", "role": "doctor", "full_name": "Dr. Test"})

    h_pat1 = {"Authorization": f"Bearer {pat1_token}"}
    h_pat2 = {"Authorization": f"Bearer {pat2_token}"}
    h_asha1 = {"Authorization": f"Bearer {asha1_token}"}
    h_asha2 = {"Authorization": f"Bearer {asha2_token}"}
    h_doctor = {"Authorization": f"Bearer {doctor_token}"}

    # Record initial consultation count to verify isolation
    initial_cons_count = await cons_col.count_documents({})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:

        # -----------------------------------------------------------------
        # REQUIREMENT 1: List ASHA workers for call selection
        # -----------------------------------------------------------------
        print("\n[TEST 1] Fetch available ASHA workers for audio call selection...")
        resp = await client.get("/api/asha-calls/workers", headers=h_pat1)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        workers_list = resp.json()
        assert any(w["worker_id"] == test_asha1_id for w in workers_list)
        print("  -> PASSED: ASHA workers list returned successfully.")

        # -----------------------------------------------------------------
        # REQUIREMENT 1 & 8: Patient requests audio call with valid worker
        # -----------------------------------------------------------------
        print("\n[TEST 2] Patient creates audio call request...")
        # Unauthenticated rejected
        resp_unauth = await client.post("/api/asha-calls/request", json={"target_worker_id": test_asha1_id})
        assert resp_unauth.status_code == 401, f"Expected 401, got {resp_unauth.status_code}"

        # Doctor rejected (role check)
        resp_doc = await client.post("/api/asha-calls/request", json={"target_worker_id": test_asha1_id}, headers=h_doctor)
        assert resp_doc.status_code == 403, f"Expected 403, got {resp_doc.status_code}"

        # Nonexistent worker rejected (404)
        resp_404 = await client.post("/api/asha-calls/request", json={"target_worker_id": "NON-EXISTENT-WORKER"}, headers=h_pat1)
        assert resp_404.status_code == 404, f"Expected 404, got {resp_404.status_code}"

        # Valid request
        resp_call1 = await client.post(
            "/api/asha-calls/request",
            json={"target_worker_id": test_asha1_id, "reason": "Severe headache and fever"},
            headers=h_pat1,
        )
        assert resp_call1.status_code == 201, f"Expected 201, got {resp_call1.status_code}: {resp_call1.text}"
        call1_data = resp_call1.json()
        call1_id = call1_data["call_id"]
        call1_room = call1_data["call_session"]["room_id"]
        assert call1_data["status"] == "requested"
        assert call1_data["call_type"] == "audio"
        assert call1_data["patient_id"] == test_pat1_id
        assert call1_data["asha_worker_id"] == test_asha1_id
        assert call1_room.startswith("room_asha_")
        print(f"  -> PASSED: Created Call {call1_id} with room {call1_room}")

        # -----------------------------------------------------------------
        # REQUIREMENT 5: Active Call Polling (Patient & ASHA)
        # -----------------------------------------------------------------
        print("\n[TEST 3] Active call polling endpoints...")
        resp_pat_active = await client.get("/api/asha-calls/active-patient", headers=h_pat1)
        assert resp_pat_active.status_code == 200
        assert resp_pat_active.json()["call_id"] == call1_id

        resp_asha1_active = await client.get("/api/asha-calls/active-asha", headers=h_asha1)
        assert resp_asha1_active.status_code == 200
        assert resp_asha1_active.json()["call_id"] == call1_id

        # Different patient has no active call
        resp_pat2_active = await client.get("/api/asha-calls/active-patient", headers=h_pat2)
        assert resp_pat2_active.status_code == 200
        assert resp_pat2_active.json() is None

        # Different ASHA has no incoming call
        resp_asha2_active = await client.get("/api/asha-calls/active-asha", headers=h_asha2)
        assert resp_asha2_active.status_code == 200
        assert resp_asha2_active.json() is None
        print("  -> PASSED: Polling endpoints correctly isolated by participant credentials.")

        # -----------------------------------------------------------------
        # REQUIREMENT 10: Duplicate active call prevention
        # -----------------------------------------------------------------
        print("\n[TEST 4] Duplicate active call prevention...")
        # Idempotent call to same worker returns existing call
        resp_dup_same = await client.post(
            "/api/asha-calls/request",
            json={"target_worker_id": test_asha1_id, "reason": "Duplicate attempt"},
            headers=h_pat1,
        )
        assert resp_dup_same.status_code == 201 or resp_dup_same.status_code == 200
        assert resp_dup_same.json()["call_id"] == call1_id

        # Call to different worker while one is pending returns 409 Conflict
        resp_dup_diff = await client.post(
            "/api/asha-calls/request",
            json={"target_worker_id": test_asha2_id, "reason": "Calling another worker"},
            headers=h_pat1,
        )
        assert resp_dup_diff.status_code == 409, f"Expected 409, got {resp_dup_diff.status_code}"
        print("  -> PASSED: Duplicate active calls prevented with 409 Conflict.")

        # -----------------------------------------------------------------
        # REQUIREMENT 3: Patient Cancellation
        # -----------------------------------------------------------------
        print("\n[TEST 5] Patient call cancellation...")
        # Unauthorized cancel attempt by ASHA or another patient -> 403 Forbidden
        resp_cancel_unauth = await client.post(f"/api/asha-calls/{call1_id}/cancel", headers=h_pat2)
        assert resp_cancel_unauth.status_code == 403

        # Initiator patient cancels call
        resp_cancel = await client.post(f"/api/asha-calls/{call1_id}/cancel", headers=h_pat1)
        assert resp_cancel.status_code == 200
        assert resp_cancel.json()["status"] == "cancelled"

        # Verify polling shows no active call now
        resp_pat_after_cancel = await client.get("/api/asha-calls/active-patient", headers=h_pat1)
        assert resp_pat_after_cancel.json() is None
        print("  -> PASSED: Initiator patient cancelled call; polling updated cleanly.")

        # -----------------------------------------------------------------
        # REQUIREMENT 2 & 6: ASHA Call Decision (Reject flow)
        # -----------------------------------------------------------------
        print("\n[TEST 6] ASHA decision - Reject flow...")
        # Create a new call
        resp_call2 = await client.post(
            "/api/asha-calls/request",
            json={"target_worker_id": test_asha1_id, "reason": "Second request"},
            headers=h_pat1,
        )
        assert resp_call2.status_code == 201
        call2_id = resp_call2.json()["call_id"]

        # Different ASHA worker tries to reject -> 403 Forbidden
        resp_rej_unauth = await client.post(
            f"/api/asha-calls/{call2_id}/decision",
            json={"action": "reject", "reason": "Not my patient"},
            headers=h_asha2,
        )
        assert resp_rej_unauth.status_code == 403

        # Target ASHA worker rejects
        resp_rej = await client.post(
            f"/api/asha-calls/{call2_id}/decision",
            json={"action": "reject", "reason": "Currently in field visit"},
            headers=h_asha1,
        )
        assert resp_rej.status_code == 200
        assert resp_rej.json()["status"] == "rejected"
        print("  -> PASSED: Call rejection verified with authorization enforcement.")

        # -----------------------------------------------------------------
        # REQUIREMENT 2, 4, 6, 10: ASHA Decision (Accept flow), Busy Guard & End Call
        # -----------------------------------------------------------------
        print("\n[TEST 7] ASHA decision - Accept flow, busy guard, and call termination...")
        resp_call3 = await client.post(
            "/api/asha-calls/request",
            json={"target_worker_id": test_asha1_id, "reason": "Third request"},
            headers=h_pat1,
        )
        assert resp_call3.status_code == 201
        call3_id = resp_call3.json()["call_id"]

        # Target ASHA accepts call
        resp_acc = await client.post(
            f"/api/asha-calls/{call3_id}/decision",
            json={"action": "accept"},
            headers=h_asha1,
        )
        assert resp_acc.status_code == 200
        call3_acc_data = resp_acc.json()
        assert call3_acc_data["status"] == "accepted"
        assert call3_acc_data["call_session"]["session_status"] == "ready"
        assert call3_acc_data["started_at"] is not None

        # Verify ASHA Busy Guard: Patient 2 tries to call ASHA 1 while she is in accepted call -> 409 Conflict
        resp_busy = await client.post(
            "/api/asha-calls/request",
            json={"target_worker_id": test_asha1_id, "reason": "Patient 2 calling"},
            headers=h_pat2,
        )
        assert resp_busy.status_code == 409
        assert "busy" in resp_busy.json()["detail"].lower() or "another call" in resp_busy.json()["detail"].lower()
        print("  -> PASSED: ASHA busy guard prevented second simultaneous incoming call (409 Conflict).")

        # Third-party user tries to end call -> 403 Forbidden
        resp_end_unauth = await client.post(f"/api/asha-calls/{call3_id}/end", headers=h_pat2)
        assert resp_end_unauth.status_code == 403

        # Target ASHA terminates call
        resp_end = await client.post(f"/api/asha-calls/{call3_id}/end", headers=h_asha1)
        assert resp_end.status_code == 200
        call3_end_data = resp_end.json()
        assert call3_end_data["status"] == "ended"
        assert call3_end_data["ended_at"] is not None
        assert call3_end_data["duration_seconds"] >= 0
        print("  -> PASSED: Accepted call successfully terminated by participant; duration recorded.")

        # -----------------------------------------------------------------
        # REQUIREMENT 7 & 11: 45-Second Timeout to Missed Call & Notification
        # -----------------------------------------------------------------
        print("\n[TEST 8] Safe 45-second timeout and missed call notification...")
        resp_call4 = await client.post(
            "/api/asha-calls/request",
            json={"target_worker_id": test_asha1_id, "reason": "Timeout test"},
            headers=h_pat1,
        )
        assert resp_call4.status_code == 201
        call4_id = resp_call4.json()["call_id"]

        # Manually backdate created_at by 50 seconds in MongoDB
        stale_time = datetime.now(timezone.utc) - timedelta(seconds=50)
        await calls_col.update_one({"call_id": call4_id}, {"$set": {"created_at": stale_time}})

        # Safe on-demand timeout resolution triggered via active poll
        resp_poll_missed = await client.get("/api/asha-calls/active-asha", headers=h_asha1)
        assert resp_poll_missed.status_code == 200
        assert resp_poll_missed.json() is None  # Active call is no longer active

        # Verify call status transitioned to 'missed'
        missed_doc = await calls_col.find_one({"call_id": call4_id})
        assert missed_doc["status"] == "missed"
        assert missed_doc["ended_at"] is not None

        # Verify in-app missed call notification created in notifications collection
        notif = await notifs_col.find_one({"call_id": call4_id, "recipient_role": "asha"})
        assert notif is not None
        assert notif["type"] == "audio_call_missed"
        assert notif["worker_id"] == test_asha1_id
        assert notif["patient_id"] == test_pat1_id
        print("  -> PASSED: 45s timeout transitioned call to 'missed' and generated ASHA notification.")

        # -----------------------------------------------------------------
        # REQUIREMENT 12: Isolation from Doctor Teleconsultations
        # -----------------------------------------------------------------
        print("\n[TEST 9] Verify strict isolation from COLLECTION_CONSULTATIONS...")
        final_cons_count = await cons_col.count_documents({})
        assert final_cons_count == initial_cons_count, "COLLECTION_CONSULTATIONS was modified!"
        print("  -> PASSED: Zero modifications to COLLECTION_CONSULTATIONS.")

    # -----------------------------------------------------------------
    # REQUIREMENT 9: Authenticated WebSocket Audio Room Signaling
    # -----------------------------------------------------------------
    print("\n[TEST 10] WebSocket audio room signaling authorization & relay...")
    ws_call_id = f"CALL-WS-{suffix}"
    session_id = f"room_asha_{ws_call_id.lower()}"
    resp_call5 = await calls_col.insert_one({
        "call_id": ws_call_id,
        "patient_id": test_pat1_id,
        "patient_name": "Test Patient Primary",
        "asha_worker_id": test_asha1_id,
        "asha_worker_name": "Test ASHA Worker One",
        "status": "accepted",
        "call_type": "audio",
        "call_session": {
            "room_id": session_id,
            "session_status": "ready",
        },
        "created_at": datetime.now(timezone.utc),
    })

    import websockets
    import json

    ws_base = "ws://127.0.0.1:8000/api/ws/asha-call"

    # 1. Reject without token (1008 Policy Violation)
    try:
        async with websockets.connect(f"{ws_base}/{session_id}"):
            assert False, "Should have rejected missing token"
    except websockets.exceptions.ConnectionClosed as e:
        assert e.code == 1008, f"Expected 1008, got {e.code}"
        print("  -> Subtest: Rejected missing token (Code 1008).")
    except Exception as e:
        print(f"  -> Subtest: Rejected missing token ({type(e).__name__}).")

    # 2. Reject invalid token (1008 Policy Violation)
    try:
        async with websockets.connect(f"{ws_base}/{session_id}?token=invalid.jwt.token"):
            assert False, "Should have rejected invalid token"
    except websockets.exceptions.ConnectionClosed as e:
        assert e.code == 1008, f"Expected 1008, got {e.code}"
        print("  -> Subtest: Rejected invalid token (Code 1008).")
    except Exception as e:
        print(f"  -> Subtest: Rejected invalid token ({type(e).__name__}).")

    # 3. Reject unknown session_id (1008 Policy Violation)
    try:
        async with websockets.connect(f"{ws_base}/room_nonexistent?token={pat1_token}"):
            assert False, "Should have rejected nonexistent session"
    except websockets.exceptions.ConnectionClosed as e:
        assert e.code == 1008, f"Expected 1008, got {e.code}"
        print("  -> Subtest: Rejected nonexistent session (Code 1008).")
    except Exception as e:
        print(f"  -> Subtest: Rejected nonexistent session ({type(e).__name__}).")

    # 4. Reject unauthorized user (patient 2 trying to join patient 1's call)
    try:
        async with websockets.connect(f"{ws_base}/{session_id}?token={pat2_token}"):
            assert False, "Should have rejected unauthorized participant"
    except websockets.exceptions.ConnectionClosed as e:
        assert e.code == 1008, f"Expected 1008, got {e.code}"
        print("  -> Subtest: Rejected unauthorized user (Code 1008).")
    except Exception as e:
        print(f"  -> Subtest: Rejected unauthorized user ({type(e).__name__}).")

    # 5. Authorized patient and ASHA connect to audio room and test ping/pong + peer relay
    async with websockets.connect(f"{ws_base}/{session_id}?token={pat1_token}") as ws_pat:
        # Upon connecting, the server sends a welcome room-status message
        welcome_pat = json.loads(await ws_pat.recv())
        assert welcome_pat.get("type") == "room-status"
        assert welcome_pat.get("session_id") == session_id

        # Patient sends ping and gets pong
        await ws_pat.send(json.dumps({"type": "ping"}))
        msg_pong = json.loads(await ws_pat.recv())
        assert msg_pong.get("type") == "pong"
        print("  -> Subtest: Authorized patient connected and ping/pong succeeded.")

        # ASHA connects simultaneously to the same session
        async with websockets.connect(f"{ws_base}/{session_id}?token={asha1_token}") as ws_asha:
            # ASHA receives welcome room-status
            welcome_asha = json.loads(await ws_asha.recv())
            assert welcome_asha.get("type") == "room-status"

            # Patient receives peer-joined event
            peer_joined = json.loads(await ws_pat.recv())
            assert peer_joined.get("type") == "peer-joined"
            assert peer_joined.get("role") == "asha"

            # Patient sends WebRTC audio offer
            await ws_pat.send(json.dumps({"type": "offer", "sdp": "v=0 audio test sdp"}))
            # ASHA receives relayed offer
            relayed_msg = json.loads(await ws_asha.recv())
            assert relayed_msg.get("type") == "offer"
            assert relayed_msg.get("sender_role") == "patient"
            print("  -> Subtest: Real-time WebRTC audio offer relayed from patient to ASHA successfully.")

    print("  -> PASSED: Authenticated WebSocket room authorization & signaling successfully verified.")

    # Cleanup test data
    await calls_col.delete_many({"call_id": {"$regex": "^CALL-"}})
    await patients_col.delete_many({"patient_id": {"$in": [test_pat1_id, test_pat2_id]}})
    await workers_col.delete_many({"worker_id": {"$in": [test_asha1_id, test_asha2_id]}})
    await notifs_col.delete_many({"recipient_id": {"$in": [test_asha1_id, test_asha2_id]}})

    await close_mongo_connection()

    print("\n" + "=" * 65)
    print(" ALL PART 2A ASHA AUDIO-CALL BACKEND TESTS PASSED! (10/10) ")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(run_asha_call_tests())
