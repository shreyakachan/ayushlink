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


async def run_step6_tests():
    print("==================================================================")
    print("   AYUSHLINK STEP 6: PHC + AMBULANCE RESPONSE FLOW VERIFICATION   ")
    print("==================================================================")

    await connect_to_mongo()
    patients_col = get_collection(COLLECTION_PATIENTS)
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)
    doc_col = get_collection(COLLECTION_DOCTORS)
    alerts_col = get_collection(COLLECTION_EMERGENCY_ALERTS)
    notif_col = get_collection(COLLECTION_NOTIFICATIONS)

    # 1. Ensure Real Patient exists (Shreya / P-101)
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

    # Ensure Assigned ASHA exists
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

    # Ensure Unrelated ASHA exists for security tests
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

    # Ensure Doctor exists
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

    # Tokens
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
        # -------------------------------------------------------------
        # 1. Trigger Patient SOS
        # -------------------------------------------------------------
        print("\n[Step 1] Triggering Patient Emergency SOS...")
        sos_payload = {
            "emergency_type": "cardiac_sos",
            "emergency_notes": "Severe chest pain and shortness of breath in Chandapur village.",
            "gps_coordinates": {"lat": 19.9975, "lng": 73.7898},
            "simulated_telemetry": {
                "frequency": "865.2 MHz (IN865 Band - SIMULATED)",
                "spreading_factor": "SF10 (SIMULATED)",
                "rssi": -98,
                "snr": -4.2,
            }
        }
        res = await client.post(
            "/emergency/sos",
            headers={"Authorization": f"Bearer {patient_token}"},
            json=sos_payload,
        )
        assert res.status_code == 201, f"POST /emergency/sos failed: {res.text}"
        alert_data = res.json()
        alert_id = alert_data["alert_id"]
        packet_id = alert_data["lora_telemetry"]["packet_id"]
        print(f"[OK] SOS Triggered: Alert ID = {alert_id}, Initial Status = {alert_data['status']}")

        # -------------------------------------------------------------
        # 2. Simulated LoRa Gateway Ingest
        # -------------------------------------------------------------
        print("\n[Step 2] Processing Simulated LoRa Gateway Packet Ingest...")
        frame = f"{packet_id}|{alert_id}|{patient_id}|Chandapur|cardiac_sos|{datetime.now(timezone.utc).isoformat()}".encode("utf-8")
        crc = calculate_crc16(frame)

        gateway_payload = {
            "packet_id": packet_id,
            "alert_id": alert_id,
            "patient_id": patient_id,
            "gateway_id": "GW-CHANDAPUR-PHC-01",
            "frequency": "865.2 MHz (IN865 Band - SIMULATED)",
            "spreading_factor": "SF10 (SIMULATED)",
            "bandwidth": "125 kHz (SIMULATED)",
            "rssi": -98,
            "snr": -4.2,
            "packet_size": len(frame),
            "checksum": crc,
            "is_simulation": True,
        }

        res_gw = await client.post("/lora/gateway/packet", json=gateway_payload)
        assert res_gw.status_code == 200, f"Gateway Ingest failed: {res_gw.text}"
        gw_data = res_gw.json()
        print(f"[OK] Gateway Downlink ACK received: Dispatch Ticket = {gw_data['dispatch_ticket_id']}, Status = {gw_data['status']}")

        # -------------------------------------------------------------
        # 3. Security Tests: Unauthorized Actions
        # -------------------------------------------------------------
        print("\n[Step 3] Testing Security & Role Authorization...")

        # 3a. Patient cannot advance emergency status
        res_pat_patch = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {patient_token}"},
            json={"status": "RESOLVED"},
        )
        assert res_pat_patch.status_code == 403, f"Expected 403 for patient PATCH, got {res_pat_patch.status_code}"
        print("[PASS] Security Passed: Patient cannot advance emergency status (403 Forbidden)")

        # 3b. Unrelated ASHA worker cannot acknowledge
        res_unrelated_asha = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {unrelated_asha_token}"},
            json={"status": "ASHA_ACKNOWLEDGED"},
        )
        assert res_unrelated_asha.status_code == 403, f"Expected 403 for unrelated ASHA, got {res_unrelated_asha.status_code}"
        print("[PASS] Security Passed: Unrelated ASHA worker rejected (403 Forbidden)")

        # 3c. ASHA cannot dispatch ambulance
        res_asha_amb = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {asha_token}"},
            json={"status": "AMBULANCE_DISPATCHED"},
        )
        assert res_asha_amb.status_code == 403, f"Expected 403 for ASHA ambulance dispatch, got {res_asha_amb.status_code}"
        print("[PASS] Security Passed: ASHA worker cannot dispatch ambulance (403 Forbidden)")

        # 3d. ASHA cannot resolve emergency
        res_asha_res = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {asha_token}"},
            json={"status": "RESOLVED"},
        )
        assert res_asha_res.status_code == 403, f"Expected 403 for ASHA resolve, got {res_asha_res.status_code}"
        print("[PASS] Security Passed: ASHA worker cannot resolve emergency (403 Forbidden)")

        # -------------------------------------------------------------
        # 4. ASHA Acknowledges Emergency
        # -------------------------------------------------------------
        print("\n[Step 4] Assigned ASHA Acknowledging Emergency...")
        res_asha_ack = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {asha_token}"},
            json={"status": "ASHA_ACKNOWLEDGED", "asha_status": "ACKNOWLEDGED", "notes": "ASHA acknowledged via mobile dashboard"},
        )
        assert res_asha_ack.status_code == 200, f"ASHA Ack failed: {res_asha_ack.text}"
        ack_data = res_asha_ack.json()
        assert ack_data["status"] == "ASHA_ACKNOWLEDGED"
        print(f"[OK] ASHA Acknowledged: Status = {ack_data['status']}, asha_status = {ack_data['asha_status']}")

        # -------------------------------------------------------------
        # 5. Doctor / PHC Confirms PHC Notification
        # -------------------------------------------------------------
        print("\n[Step 5] Doctor / PHC Acknowledging Notification...")
        res_phc = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {doctor_token}"},
            json={"status": "PHC_NOTIFIED", "phc_status": "ACKNOWLEDGED", "notes": "PHC Medical Officer acknowledged emergency"},
        )
        assert res_phc.status_code == 200, f"PHC Ack failed: {res_phc.text}"
        phc_data = res_phc.json()
        assert phc_data["status"] == "PHC_NOTIFIED"
        assert phc_data["phc_status"] == "ACKNOWLEDGED"
        print(f"[OK] PHC Notified: Status = {phc_data['status']}, phc_status = {phc_data['phc_status']}")

        # -------------------------------------------------------------
        # 6. Doctor Dispatches Ambulance
        # -------------------------------------------------------------
        print("\n[Step 6] Doctor Dispatching 108 Emergency Ambulance...")
        res_amb = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {doctor_token}"},
            json={"status": "AMBULANCE_DISPATCHED", "ambulance_status": "DISPATCHED", "notes": "108 Ambulance dispatched to Chandapur"},
        )
        assert res_amb.status_code == 200, f"Ambulance dispatch failed: {res_amb.text}"
        amb_data = res_amb.json()
        assert amb_data["status"] == "AMBULANCE_DISPATCHED"
        assert amb_data["ambulance_status"] == "DISPATCHED"
        print(f"[OK] Ambulance Dispatched: Status = {amb_data['status']}, ambulance_status = {amb_data['ambulance_status']}")

        # -------------------------------------------------------------
        # 7. Responder / PHC Marks Patient Reached
        # -------------------------------------------------------------
        print("\n[Step 7] Marking Patient Reached...")
        res_rch = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {doctor_token}"},
            json={"status": "PATIENT_REACHED", "ambulance_status": "ARRIVED", "notes": "Ambulance arrived at patient residence"},
        )
        assert res_rch.status_code == 200, f"Patient reached failed: {res_rch.text}"
        rch_data = res_rch.json()
        assert rch_data["status"] == "PATIENT_REACHED"
        assert rch_data["ambulance_status"] == "ARRIVED"
        print(f"[OK] Patient Reached: Status = {rch_data['status']}, ambulance_status = {rch_data['ambulance_status']}")

        # -------------------------------------------------------------
        # 8. Doctor Resolves Emergency
        # -------------------------------------------------------------
        print("\n[Step 8] Resolving Emergency...")
        res_res = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {doctor_token}"},
            json={"status": "RESOLVED", "notes": "Patient stabilized and admitted to Chandapur PHC cardiac unit"},
        )
        assert res_res.status_code == 200, f"Resolve failed: {res_res.text}"
        res_data = res_res.json()
        assert res_data["status"] == "RESOLVED"
        assert res_data["resolved_at"] is not None
        print(f"[OK] Emergency Resolved: Status = {res_data['status']}, resolved_at = {res_data['resolved_at']}")

        # -------------------------------------------------------------
        # 9. Monotonic Guard Check: Backward Transition Rejected
        # -------------------------------------------------------------
        print("\n[Step 9] Testing Monotonic Transition Guard...")
        res_invalid_rollback = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {doctor_token}"},
            json={"status": "AMBULANCE_DISPATCHED"},
        )
        assert res_invalid_rollback.status_code == 400, f"Expected 400 for backward transition, got {res_invalid_rollback.status_code}"
        print("[PASS] Monotonic Guard Passed: Cannot roll back from RESOLVED to AMBULANCE_DISPATCHED (400 Bad Request)")

        # -------------------------------------------------------------
        # 10. Database Persistence & Milestone Notifications Check
        # -------------------------------------------------------------
        print("\n[Step 10] Verifying MongoDB Document & Milestone Notifications...")
        persisted_alert = await alerts_col.find_one({"alert_id": alert_id})
        assert persisted_alert is not None, "Emergency alert document was deleted!"
        assert persisted_alert["status"] == "RESOLVED"
        assert persisted_alert["resolved_at"] is not None
        assert "cardiac unit" in persisted_alert.get("resolution_notes", "")
        print(f"[OK] MongoDB Persistence: Document {alert_id} exists with status = {persisted_alert['status']}")

        # Check Notifications
        notifs = await notif_col.find({"alert_id": alert_id}).to_list(length=20)
        print(f"[OK] Milestone Notifications: {len(notifs)} notifications generated for {alert_id}")
        for n in notifs:
            safe_title = n.get('title', '').encode('ascii', 'replace').decode('ascii')
            safe_msg = n.get('message', '').encode('ascii', 'replace').decode('ascii')
            print(f"   * [{n.get('recipient_role').upper()}] {safe_title}: {safe_msg}")

    await close_mongo_connection()
    print("\n==================================================================")
    print("   [PASS] ALL STEP 6 END-TO-END & SECURITY TESTS PASSED           ")
    print("==================================================================")


if __name__ == "__main__":
    asyncio.run(run_step6_tests())
