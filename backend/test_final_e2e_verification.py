import asyncio
import httpx
from datetime import datetime, timezone
from database import (
    connect_to_mongo,
    close_mongo_connection,
    get_collection,
    COLLECTION_PATIENTS,
    COLLECTION_ASHA_WORKERS,
    COLLECTION_DOCTORS,
    COLLECTION_EMERGENCY_ALERTS,
    COLLECTION_NOTIFICATIONS,
)
from services.security import hash_password, create_access_token
from services.lora_emergency_service import calculate_crc16


async def run_final_e2e_verification():
    print("==================================================================")
    print("   AYUSHLINK STEP 7: FINAL END-TO-END VERIFICATION & HARDENING    ")
    print("==================================================================")

    await connect_to_mongo()
    patients_col = get_collection(COLLECTION_PATIENTS)
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)
    doc_col = get_collection(COLLECTION_DOCTORS)
    alerts_col = get_collection(COLLECTION_EMERGENCY_ALERTS)
    notif_col = get_collection(COLLECTION_NOTIFICATIONS)

    # 1. Ensure Real Patient (Shreya Kachan / P-101) exists in MongoDB
    patient_doc = await patients_col.find_one({"$or": [{"phone": "9876543210"}, {"patient_id": "P-101"}]})
    if not patient_doc:
        patient_doc = {
            "patient_id": "P-101",
            "full_name": "Shreya Kachan",
            "phone": "9876543210",
            "hashed_password": hash_password("123456"),
            "village": "Chandapur",
            "blood_group": "B+",
            "allergies": ["Penicillin"],
            "chronic_conditions": ["Hypertension"],
            "asha_worker_id": "ASHA-833",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        await patients_col.insert_one(patient_doc)

    patient_id = patient_doc.get("patient_id", "P-101")
    patient_phone = patient_doc.get("phone", "9876543210")
    patient_name = patient_doc.get("full_name", "Shreya Kachan")

    # 2. Ensure Assigned ASHA Worker (Swati Deshmukh / ASHA-833) exists
    asha_doc = await asha_col.find_one({"$or": [{"worker_id": "ASHA-833"}, {"assigned_villages": "Chandapur"}]})
    if not asha_doc:
        asha_doc = {
            "worker_id": "ASHA-833",
            "full_name": "Swati Deshmukh",
            "phone": "9837373773",
            "assigned_villages": ["Chandapur", "Nandgaon"],
            "primary_phc": "Chandapur PHC",
            "is_active": True,
        }
        await asha_col.insert_one(asha_doc)

    # 3. Ensure Unrelated ASHA Worker (Kavita Patil / ASHA-999) exists
    unrelated_asha_doc = await asha_col.find_one({"worker_id": "ASHA-999"})
    if not unrelated_asha_doc:
        unrelated_asha_doc = {
            "worker_id": "ASHA-999",
            "full_name": "Kavita Patil",
            "phone": "9837373999",
            "assigned_villages": ["Dindori"],
            "primary_phc": "Dindori PHC",
            "is_active": True,
        }
        await asha_col.insert_one(unrelated_asha_doc)

    # 4. Ensure Doctor (Dr. Rajesh Sharma / DOC-501) exists
    doc_doc = await doc_col.find_one({"$or": [{"doctor_id": "DOC-501"}, {"is_on_duty": True}]})
    if not doc_doc:
        doc_doc = {
            "doctor_id": "DOC-501",
            "full_name": "Dr. Rajesh Sharma",
            "phone": "9820011223",
            "specialization": "General Medicine",
            "assigned_facility": "Chandapur PHC",
            "is_on_duty": True,
        }
        await doc_col.insert_one(doc_doc)

    doc_id = doc_doc.get("doctor_id", "DOC-501")

    # Generate Real JWTs
    patient_token = create_access_token({
        "sub": patient_id,
        "role": "patient",
        "phone": patient_phone,
        "name": patient_name,
    })

    asha_token = create_access_token({
        "sub": asha_doc.get("worker_id", "ASHA-833"),
        "role": "asha",
        "phone": asha_doc.get("phone", "9837373773"),
        "name": asha_doc.get("full_name", "Swati Deshmukh"),
    })

    unrelated_asha_token = create_access_token({
        "sub": "ASHA-999",
        "role": "asha",
        "phone": "9837373999",
        "name": "Kavita Patil",
    })

    doctor_token = create_access_token({
        "sub": doc_id,
        "role": "doctor",
        "phone": doc_doc.get("phone", "9820011223"),
        "name": doc_doc.get("full_name", "Dr. Rajesh Sharma"),
    })

    base_url = "http://127.0.0.1:8000/api"

    async with httpx.AsyncClient(base_url=base_url, timeout=15.0) as client:
        # =============================================================
        # STAGE 1: PATIENT TRIGGERS SOS (AUTH REQUIRED)
        # =============================================================
        print("\n[Stage 1] Patient Triggering SOS (POST /api/emergency/sos)...")
        sos_payload = {
            "emergency_type": "cardiac_sos",
            "emergency_notes": "Patient experiencing intense chest tightness and dizziness.",
            "gps_coordinates": {"lat": 19.9975, "lng": 73.7898},
            "simulated_telemetry": {
                "frequency": "865.2 MHz (IN865 Band - SIMULATED)",
                "spreading_factor": "SF10 (SIMULATED)",
                "bandwidth": "125 kHz (SIMULATED)",
                "rssi": -97,
                "snr": -4.8,
            }
        }
        res_sos = await client.post(
            "/emergency/sos",
            headers={"Authorization": f"Bearer {patient_token}"},
            json=sos_payload,
        )
        assert res_sos.status_code == 201, f"SOS Trigger failed: {res_sos.text}"
        alert = res_sos.json()
        alert_id = alert["alert_id"]
        packet_id = alert["lora_telemetry"]["packet_id"]
        initial_doc_id = alert["id"]
        print(f"[OK] SOS Created: alert_id={alert_id}, patient={alert['patient_name']}, village={alert['village']}, status={alert['status']}")

        # =============================================================
        # STAGE 2: LORA GATEWAY PACKET INGESTION & CRC16 VERIFICATION
        # =============================================================
        print("\n[Stage 2] Simulating Gateway Ingestion (POST /api/lora/gateway/packet)...")
        frame = f"{packet_id}|{alert_id}|{patient_id}|Chandapur|cardiac_sos|{datetime.now(timezone.utc).isoformat()}".encode("utf-8")
        crc = calculate_crc16(frame)

        gw_res = await client.post(
            "/lora/gateway/packet",
            json={
                "packet_id": packet_id,
                "alert_id": alert_id,
                "patient_id": patient_id,
                "gateway_id": "GW-CHANDAPUR-PHC-01",
                "frequency": "865.2 MHz (IN865 Band - SIMULATED)",
                "spreading_factor": "SF10 (SIMULATED)",
                "bandwidth": "125 kHz (SIMULATED)",
                "rssi": -97,
                "snr": -4.8,
                "packet_size": len(frame),
                "checksum": crc,
                "is_simulation": True,
            },
        )
        assert gw_res.status_code == 200, f"Gateway packet ingest failed: {gw_res.text}"
        gw_ack = gw_res.json()
        assert gw_ack["ack"] is True
        print(f"[OK] Gateway Downlink ACK: Ticket={gw_ack['dispatch_ticket_id']}, Checksum={gw_ack['ack_checksum']}, Status={gw_ack['status']}")

        # =============================================================
        # STAGE 3: SECURITY & AUTHORIZATION REJECTION TESTING
        # =============================================================
        print("\n[Stage 3] Testing Security & RBAC Guards...")
        # 3a. Patient cannot advance emergency status directly
        p_res = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {patient_token}"},
            json={"status": "RESOLVED"},
        )
        assert p_res.status_code == 403, f"Expected 403 for patient PATCH, got {p_res.status_code}"
        print("[PASS] Security Guard: Patient cannot directly advance status (403 Forbidden)")

        # 3b. Unrelated ASHA worker rejected
        u_res = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {unrelated_asha_token}"},
            json={"status": "ASHA_ACKNOWLEDGED"},
        )
        assert u_res.status_code == 403, f"Expected 403 for unrelated ASHA, got {u_res.status_code}"
        print("[PASS] Security Guard: Unrelated ASHA worker rejected (403 Forbidden)")

        # 3c. ASHA cannot dispatch ambulance
        a_res = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {asha_token}"},
            json={"status": "AMBULANCE_DISPATCHED"},
        )
        assert a_res.status_code == 403, f"Expected 403 for ASHA ambulance dispatch, got {a_res.status_code}"
        print("[PASS] Security Guard: ASHA cannot dispatch ambulance (403 Forbidden)")

        # 3d. ASHA cannot resolve emergency
        r_res = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {asha_token}"},
            json={"status": "RESOLVED"},
        )
        assert r_res.status_code == 403, f"Expected 403 for ASHA resolve, got {r_res.status_code}"
        print("[PASS] Security Guard: ASHA cannot resolve emergency (403 Forbidden)")

        # =============================================================
        # STAGE 4: ASHA ACKNOWLEDGEMENT
        # =============================================================
        print("\n[Stage 4] Assigned ASHA Acknowledging Emergency...")
        ack_res = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {asha_token}"},
            json={"status": "ASHA_ACKNOWLEDGED", "asha_status": "ACKNOWLEDGED", "notes": "ASHA Swati heading to patient residence"},
        )
        assert ack_res.status_code == 200, f"ASHA ack failed: {ack_res.text}"
        ack_obj = ack_res.json()
        assert ack_obj["status"] == "ASHA_ACKNOWLEDGED"
        assert ack_obj["id"] == initial_doc_id
        print(f"[OK] ASHA Acknowledged: Status={ack_obj['status']}, asha_status={ack_obj['asha_status']}")

        # =============================================================
        # STAGE 5: PHC / DOCTOR NOTIFICATION ACKNOWLEDGEMENT
        # =============================================================
        print("\n[Stage 5] Doctor / PHC Acknowledging Notification...")
        phc_res = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {doctor_token}"},
            json={"status": "PHC_NOTIFIED", "phc_status": "ACKNOWLEDGED", "notes": "PHC Medical Officer confirmed SOS"},
        )
        assert phc_res.status_code == 200, f"PHC ack failed: {phc_res.text}"
        phc_obj = phc_res.json()
        assert phc_obj["status"] == "PHC_NOTIFIED"
        assert phc_obj["phc_status"] == "ACKNOWLEDGED"
        assert phc_obj["id"] == initial_doc_id
        print(f"[OK] PHC Notified: Status={phc_obj['status']}, phc_status={phc_obj['phc_status']}")

        # =============================================================
        # STAGE 6: AMBULANCE DISPATCH
        # =============================================================
        print("\n[Stage 6] Doctor Dispatching Ambulance...")
        amb_res = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {doctor_token}"},
            json={"status": "AMBULANCE_DISPATCHED", "ambulance_status": "DISPATCHED", "notes": "108 Ambulance dispatched to Chandapur"},
        )
        assert amb_res.status_code == 200, f"Ambulance dispatch failed: {amb_res.text}"
        amb_obj = amb_res.json()
        assert amb_obj["status"] == "AMBULANCE_DISPATCHED"
        assert amb_obj["ambulance_status"] == "DISPATCHED"
        assert amb_obj["id"] == initial_doc_id
        print(f"[OK] Ambulance Dispatched: Status={amb_obj['status']}, ambulance_status={amb_obj['ambulance_status']}")

        # =============================================================
        # STAGE 7: PATIENT REACHED
        # =============================================================
        print("\n[Stage 7] Marking Patient Reached...")
        rch_res = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {doctor_token}"},
            json={"status": "PATIENT_REACHED", "ambulance_status": "ARRIVED", "notes": "Ambulance team arrived at patient home"},
        )
        assert rch_res.status_code == 200, f"Patient reached failed: {rch_res.text}"
        rch_obj = rch_res.json()
        assert rch_obj["status"] == "PATIENT_REACHED"
        assert rch_obj["ambulance_status"] == "ARRIVED"
        assert rch_obj["id"] == initial_doc_id
        print(f"[OK] Patient Reached: Status={rch_obj['status']}, ambulance_status={rch_obj['ambulance_status']}")

        # =============================================================
        # STAGE 8: SIMULATING REFRESH / ACTIVE ALERT RECOVERY
        # =============================================================
        print("\n[Stage 8] Testing Active Alert Recovery on Page Refresh / Re-login...")
        # 8a. Patient gets active alert
        pat_active_res = await client.get(
            "/emergency/alerts/active",
            headers={"Authorization": f"Bearer {patient_token}"},
        )
        assert pat_active_res.status_code == 200
        pat_active = pat_active_res.json()
        assert any(a["alert_id"] == alert_id for a in pat_active)
        print(f"[OK] Patient State Recovery: Successfully recovered active alert ({alert_id}) on refresh")

        # 8b. ASHA gets active alert
        asha_active_res = await client.get(
            "/emergency/alerts/active",
            headers={"Authorization": f"Bearer {asha_token}"},
        )
        assert asha_active_res.status_code == 200
        asha_active = asha_active_res.json()
        assert any(a["alert_id"] == alert_id for a in asha_active)
        print(f"[OK] ASHA State Recovery: Successfully recovered active alert ({alert_id}) on refresh")

        # 8c. Doctor gets active alert
        doc_active_res = await client.get(
            "/emergency/alerts/active",
            headers={"Authorization": f"Bearer {doctor_token}"},
        )
        assert doc_active_res.status_code == 200
        doc_active = doc_active_res.json()
        assert any(a["alert_id"] == alert_id for a in doc_active)
        print(f"[OK] Doctor State Recovery: Successfully recovered active alert ({alert_id}) on refresh")

        # =============================================================
        # STAGE 9: EMERGENCY RESOLUTION
        # =============================================================
        print("\n[Stage 9] Doctor Resolving Emergency...")
        res_res = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {doctor_token}"},
            json={"status": "RESOLVED", "notes": "Emergency successfully resolved. Patient admitted to Chandapur PHC observation ward."},
        )
        assert res_res.status_code == 200, f"Emergency resolve failed: {res_res.text}"
        res_obj = res_res.json()
        assert res_obj["status"] == "RESOLVED"
        assert res_obj["resolved_at"] is not None
        assert res_obj["id"] == initial_doc_id
        print(f"[OK] Emergency Resolved: Status={res_obj['status']}, resolved_at={res_obj['resolved_at']}")

        # =============================================================
        # STAGE 10: MONOTONIC ROLLBACK PREVENTION
        # =============================================================
        print("\n[Stage 10] Testing Monotonic Rollback Prevention...")
        rb_res = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {doctor_token}"},
            json={"status": "AMBULANCE_DISPATCHED"},
        )
        assert rb_res.status_code == 400, f"Expected 400 for rollback, got {rb_res.status_code}"
        print("[PASS] Rollback Prevention: Cannot transition from RESOLVED backwards (400 Bad Request)")

        # =============================================================
        # STAGE 11: DATABASE RECORD INTEGRITY & PERSISTENCE
        # =============================================================
        print("\n[Stage 11] Verifying MongoDB Persistence & Document Integrity...")
        persisted = await alerts_col.find_one({"alert_id": alert_id})
        assert persisted is not None, "Emergency alert was deleted!"
        assert str(persisted["_id"]) == initial_doc_id, "Document _id mutated during lifecycle!"
        assert persisted["status"] == "RESOLVED"
        assert persisted["resolved_at"] is not None
        assert persisted["phc_status"] == "ACKNOWLEDGED"
        assert persisted["ambulance_status"] == "ARRIVED"
        assert "observation ward" in persisted.get("resolution_notes", "")
        print(f"[OK] Single Document Maintained Throughout: _id = {persisted['_id']}, alert_id = {persisted['alert_id']}")
        print(f"[OK] Final Status in MongoDB: {persisted['status']}, ResolvedAt: {persisted['resolved_at']}")

        # =============================================================
        # STAGE 12: MILESTONE NOTIFICATIONS DE-DUPLICATION CHECK
        # =============================================================
        print("\n[Stage 12] Verifying Milestone Notifications & De-duplication...")
        notifs = await notif_col.find({"alert_id": alert_id}).to_list(length=50)
        notif_ids = [n["notification_id"] for n in notifs]
        assert len(notif_ids) == len(set(notif_ids)), "Duplicate notification IDs found!"
        print(f"[OK] Notifications Count: {len(notifs)} unique notification records generated for alert {alert_id}")
        for n in notifs:
            safe_title = n.get('title', '').encode('ascii', 'replace').decode('ascii')
            safe_msg = n.get('message', '').encode('ascii', 'replace').decode('ascii')
            print(f"   * [{n.get('recipient_role').upper()}] {safe_title}: {safe_msg}")

    await close_mongo_connection()
    print("\n==================================================================")
    print("   [PASS] ALL STEP 7 FINAL END-TO-END VERIFICATIONS SUCCEEDED     ")
    print("==================================================================")


if __name__ == "__main__":
    asyncio.run(run_final_e2e_verification())
