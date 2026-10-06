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


async def test_lora_emergency_step2():
    print("==========================================================")
    print("   AyushLink Software LoRa Emergency Flow Test (Step 2)   ")
    print("==========================================================")

    await connect_to_mongo()
    patients_col = get_collection(COLLECTION_PATIENTS)
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)
    alerts_col = get_collection(COLLECTION_EMERGENCY_ALERTS)
    notif_col = get_collection(COLLECTION_NOTIFICATIONS)

    # 1. Ensure Patient exists
    patient_phone = "9876543210"
    patient_doc = await patients_col.find_one({"phone": patient_phone})
    if not patient_doc:
        patient_doc = {
            "patient_id": "P-101",
            "full_name": "Sunita Devi",
            "phone": patient_phone,
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
    patient_name = patient_doc.get("full_name", "Sunita Devi")

    # Generate Patient JWT
    patient_token = create_access_token({
        "sub": patient_id,
        "role": "patient",
        "phone": patient_phone,
        "name": patient_name,
    })

    # Generate ASHA JWT
    asha_token = create_access_token({
        "sub": "ASHA-833",
        "role": "asha",
        "phone": "9837373773",
        "name": "Swati Deshmukh",
    })

    doc_col = get_collection(COLLECTION_DOCTORS)
    doc_doc = await doc_col.find_one({"$or": [{"phone": "9820011223"}, {"doctor_id": "DOC-501"}]})
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

    # Generate Doctor JWT
    doc_token = create_access_token({
        "sub": doc_doc.get("doctor_id", "DOC-501"),
        "role": "doctor",
        "phone": doc_doc.get("phone", "9820011223"),
        "name": doc_doc.get("full_name", "Dr. Rajesh Sharma"),
    })

    base_url = "http://127.0.0.1:8000/api"

    async with httpx.AsyncClient(base_url=base_url) as client:
        # -------------------------------------------------------------
        # Test A-D: Patient Triggers SOS & Simulated LoRa Transmission
        # -------------------------------------------------------------
        print("\n--- 1. Testing Patient Emergency SOS & LoRa Transmission ---")
        sos_payload = {
            "emergency_type": "maternal_emergency",
            "emergency_notes": "Active labor contractions in rural field.",
            "gps_coordinates": {"lat": 19.9975, "lng": 73.7898},
            "simulated_telemetry": {
                "spreading_factor": "SF10 (SIMULATED)",
                "frequency": "865.2 MHz (IN865 Band - SIMULATED)",
                "rssi": -99,
                "snr": -5.5,
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

        print(f"[OK] Emergency Alert Created: {alert_id}")
        print(f"     Patient: {alert_data['patient_name']} ({alert_data['patient_id']})")
        print(f"     Village: {alert_data['village']}")
        print(f"     Simulated LoRa Packet ID: {packet_id}")
        print(f"     Calculated CRC16: {alert_data['lora_telemetry']['checksum']}")
        print(f"     Telemetry: Frequency={alert_data['lora_telemetry']['frequency']} | SF={alert_data['lora_telemetry']['spreading_factor']} | RSSI={alert_data['lora_telemetry']['rssi']} dBm | SNR={alert_data['lora_telemetry']['snr']} dB")

        assert alert_data["patient_name"] == patient_name
        assert alert_data["village"] == "Chandapur"
        assert alert_data["lora_telemetry"]["is_simulation"] is True

        # -------------------------------------------------------------
        # Test I-J: Verify High-Priority Notifications in MongoDB
        # -------------------------------------------------------------
        print("\n--- 2. Verifying ASHA & Doctor In-App Notifications ---")
        notifs = await notif_col.find({"alert_id": alert_id}).to_list(length=10)
        assert len(notifs) >= 2, f"Expected at least 2 notifications, got {len(notifs)}"
        for n in notifs:
            clean_title = n['title'].encode('ascii', 'replace').decode('ascii')
            clean_msg = n['message'][:65].encode('ascii', 'replace').decode('ascii')
            print(f"[OK] Notification in MongoDB for {n['recipient_role']} ({n['recipient_id']}): {clean_title} -> {clean_msg}...")

        # -------------------------------------------------------------
        # Test E-H: Simulated LoRa Gateway Ingest & Downlink ACK
        # -------------------------------------------------------------
        print("\n--- 3. Testing Simulated Gateway Packet Ingest & Downlink ACK ---")
        valid_crc = calculate_crc16(f"{packet_id}|{alert_id}|{patient_id}|Chandapur|maternal_emergency".encode("utf-8"))
        gateway_packet = {
            "packet_id": packet_id,
            "alert_id": alert_id,
            "patient_id": patient_id,
            "gateway_id": "GW-CHANDAPUR-PHC-01",
            "frequency": "865.2 MHz (IN865 Band - SIMULATED)",
            "spreading_factor": "SF10 (SIMULATED)",
            "bandwidth": "125 kHz (SIMULATED)",
            "rssi": -96,
            "snr": -4.2,
            "packet_size": 52,
            "checksum": valid_crc,
            "is_simulation": True,
            "raw_payload_hex": "41595553484C4F5241504B54303031",
        }

        gw_res = await client.post("/lora/gateway/packet", json=gateway_packet)
        assert gw_res.status_code == 200, f"Gateway ingest failed: {gw_res.text}"
        ack_data = gw_res.json()

        print(f"[OK] Gateway Downlink ACK Received:")
        print(f"     ACK Packet ID: {ack_data['packet_id']}")
        print(f"     Dispatch Ticket ID: {ack_data['dispatch_ticket_id']}")
        print(f"     Gateway ID: {ack_data['gateway_id']}")
        print(f"     ACK Checksum (CRC16): {ack_data['ack_checksum']}")
        print(f"     Status: {ack_data['status']}")
        print(f"     Estimated Responder Arrival: {ack_data['estimated_arrival_minutes']} minutes")

        assert ack_data["packet_id"] == packet_id
        assert ack_data["alert_id"] == alert_id
        assert ack_data["is_simulation"] is True

        # -------------------------------------------------------------
        # Test F: CRC/Checksum Rejection on Corrupted Frame
        # -------------------------------------------------------------
        print("\n--- 4. Testing CRC16 Corruption Rejection ---")
        corrupt_packet = {
            "packet_id": packet_id,
            "alert_id": alert_id,
            "patient_id": patient_id,
            "gateway_id": "GW-CHANDAPUR-PHC-01",
            "frequency": "865.2 MHz (IN865 Band - SIMULATED)",
            "spreading_factor": "SF10 (SIMULATED)",
            "bandwidth": "125 kHz (SIMULATED)",
            "rssi": -118,
            "snr": -12.0,
            "packet_size": 48,
            "checksum": "0x0000_CORRUPTED",
            "is_simulation": True,
        }
        corrupt_res = await client.post("/lora/gateway/packet", json=corrupt_packet)
        assert corrupt_res.status_code == 400, f"Expected 400 for corrupted CRC, got {corrupt_res.status_code}"
        print(f"[OK] Corrupted CRC packet rejected with 400: {corrupt_res.json()['detail']}")

        # -------------------------------------------------------------
        # Test 5: Role-Filtered Active Emergency Retrieval
        # -------------------------------------------------------------
        print("\n--- 5. Testing Role-Filtered Active Emergency Alerts ---")
        asha_res = await client.get("/emergency/alerts/active", headers={"Authorization": f"Bearer {asha_token}"})
        assert asha_res.status_code == 200
        asha_alerts = asha_res.json()
        assert any(a["alert_id"] == alert_id for a in asha_alerts)
        print(f"[OK] ASHA Worker retrieved {len(asha_alerts)} active emergency alert(s).")

        # -------------------------------------------------------------
        # Test 6: Workflow Progression & Backward Transition Guard
        # -------------------------------------------------------------
        print("\n--- 6. Testing Workflow Progression & Transition Guard ---")

        # ASHA Acknowledges
        ack_res = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {asha_token}"},
            json={"status": "ASHA_ACKNOWLEDGED", "notes": "ASHA Swati heading to Chandapur village."},
        )
        assert ack_res.status_code == 200
        assert ack_res.json()["status"] == "ASHA_ACKNOWLEDGED"
        print(f"[OK] Advanced status to: ASHA_ACKNOWLEDGED")

        # Ambulance Dispatched
        amb_res = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {doc_token}"},
            json={"status": "AMBULANCE_DISPATCHED", "ambulance_status": "DISPATCHED"},
        )
        assert amb_res.status_code == 200
        assert amb_res.json()["status"] == "AMBULANCE_DISPATCHED"
        print(f"[OK] Advanced status to: AMBULANCE_DISPATCHED")

        # Resolve
        res_res = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {doc_token}"},
            json={"status": "RESOLVED", "notes": "Safe hospital admission complete."},
        )
        assert res_res.status_code == 200
        assert res_res.json()["status"] == "RESOLVED"
        assert res_res.json()["resolved_at"] is not None
        print(f"[OK] Advanced status to: RESOLVED")

        # Backward transition rejection test (from RESOLVED back to SOS_TRIGGERED)
        backward_res = await client.patch(
            f"/emergency/alerts/{alert_id}/status",
            headers={"Authorization": f"Bearer {doc_token}"},
            json={"status": "SOS_TRIGGERED"},
        )
        assert backward_res.status_code == 400
        print(f"[OK] Invalid backward transition from RESOLVED rejected with 400: {backward_res.json()['detail']}")

    await close_mongo_connection()
    print("\n==========================================================")
    print(" [PASS] Step 2 Software LoRa Emergency Flow Test PASSED! ")
    print("==========================================================")


if __name__ == "__main__":
    asyncio.run(test_lora_emergency_step2())
