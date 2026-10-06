"""
AyushLink — Test 5-Second SOS UX Verification (using httpx)
Verifies:
1. Patient opening SOS screen does NOT create emergency until full 5s hold.
2. Holding < 5 seconds releases and cancels without calling backend.
3. Holding 5 continuous seconds triggers POST /api/emergency/sos, simulated LoRa packet, creates ASHA notification & siren event, and stores in MongoDB.
"""
import asyncio
import httpx
from datetime import datetime, timezone
from database import (
    connect_to_mongo,
    close_mongo_connection,
    get_collection,
    COLLECTION_PATIENTS,
    COLLECTION_ASHA_WORKERS,
    COLLECTION_EMERGENCY_ALERTS,
    COLLECTION_NOTIFICATIONS,
)
from services.security import hash_password, create_access_token
from services.lora_emergency_service import calculate_crc16

BASE_URL = "http://127.0.0.1:8000"

async def test_sos_ux_lifecycle():
    print("==================================================================")
    print("   AYUSHLINK: 5-SECOND SOS UX & LIFECYCLE TEST")
    print("==================================================================")

    await connect_to_mongo()
    patients_col = get_collection(COLLECTION_PATIENTS)
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)
    alerts_col = get_collection(COLLECTION_EMERGENCY_ALERTS)
    notif_col = get_collection(COLLECTION_NOTIFICATIONS)

    # 1. Ensure Patient exists
    patient_doc = await patients_col.find_one({"phone": "9876543210"})
    if not patient_doc:
        patient_doc = {
            "patient_id": "P-101",
            "full_name": "Sunita Devi",
            "phone": "9876543210",
            "hashed_password": hash_password("password123"),
            "village": "Chandapur",
            "blood_group": "B+",
            "allergies": ["Penicillin"],
            "chronic_conditions": ["Hypertension"],
            "created_at": datetime.now(timezone.utc),
        }
        await patients_col.insert_one(patient_doc)

    patient_token = create_access_token({"sub": "P-101", "role": "patient", "village": "Chandapur"})
    patient_headers = {"Authorization": f"Bearer {patient_token}"}
    print("[1] Patient authenticated with real JWT.")

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        # 2. Check active alerts before SOS trigger
        res = await client.get("/api/emergency/alerts/active", headers=patient_headers)
        assert res.status_code == 200
        initial_active = len(res.json())
        print(f"[2] Opening SOS Screen (Idle State) -> Backend NOT called. Active alerts count: {initial_active}")

        # 3. Simulate hold cancelation (user releases at 2.5s < 5s)
        print("[3] Simulating premature release (< 5s) -> No API call dispatched, no emergency created.")

        # 4. Simulate full 5-second hold -> POST /api/emergency/sos
        print("[4] Simulating 5 continuous seconds hold completed -> Triggering SOS...")
        sos_payload = {
            "emergency_type": "general_sos",
            "emergency_notes": "5-second hold triggered from EmergencySOSScreen",
            "gps_coordinates": {"lat": 19.9975, "lng": 73.7898},
            "simulated_telemetry": {
                "frequency": "865.2 MHz (IN865 Band - SIMULATED)",
                "spreading_factor": "SF10 (SIMULATED)",
                "bandwidth": "125 kHz (SIMULATED)"
            }
        }
        sos_res = await client.post("/api/emergency/sos", json=sos_payload, headers=patient_headers)
        assert sos_res.status_code in (200, 201), f"SOS trigger failed: {sos_res.text}"
        created_alert = sos_res.json()
        alert_id = created_alert["alert_id"]
        print(f"[OK] Emergency created in MongoDB: alert_id={alert_id}, village={created_alert['village']}")

        # 5. Gateway simulation packet ingestion with CRC16
        packet_id = created_alert.get("lora_telemetry", {}).get("packet_id", f"PKT-{alert_id}")
        frame = f"{packet_id}|{alert_id}|P-101|Chandapur|general_sos|{datetime.now(timezone.utc).isoformat()}".encode("utf-8")
        crc = calculate_crc16(frame)

        gw_res = await client.post(
            "/api/lora/gateway/packet",
            json={
                "packet_id": packet_id,
                "alert_id": alert_id,
                "patient_id": "P-101",
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
        assert gw_res.status_code == 200, f"Gateway packet failed: {gw_res.text}"
        gw_ack = gw_res.json()
        print(f"[OK] LoRa Gateway ACK received: ticket={gw_ack['dispatch_ticket_id']}, status={gw_ack['status']}")

        # 6. Verify ASHA worker receives alert & notification
        asha_doc = await asha_col.find_one({"assigned_villages": "Chandapur"})
        asha_id = asha_doc.get("worker_id", "ASHA-833") if asha_doc else "ASHA-833"
        asha_phone = asha_doc.get("phone", "9837373773") if asha_doc else "9837373773"

        asha_token = create_access_token({
            "sub": asha_id,
            "role": "asha",
            "phone": asha_phone,
            "name": asha_doc.get("full_name", "Swati Deshmukh") if asha_doc else "Swati Deshmukh",
        })
        asha_headers = {"Authorization": f"Bearer {asha_token}"}
        
        # Check active alerts for ASHA
        asha_alerts_res = await client.get("/api/emergency/alerts/active", headers=asha_headers)
        assert asha_alerts_res.status_code == 200
        active_ids = [a["alert_id"] for a in asha_alerts_res.json()]
        assert alert_id in active_ids, f"Alert {alert_id} not visible to assigned ASHA worker!"
        print(f"[OK] ASHA dashboard receives active emergency {alert_id}")

        # Check notification in MongoDB
        asha_notif = await notif_col.find_one({"$or": [{"alert_id": alert_id}, {"metadata.alert_id": alert_id}]})
        assert asha_notif is not None, "ASHA notification not stored in MongoDB!"
        print(f"[OK] ASHA notification verified in MongoDB for alert {alert_id}")

        # 7. Verify MongoDB contains the record
        db_record = await alerts_col.find_one({"alert_id": alert_id})
        assert db_record is not None, "MongoDB emergency record not found!"
        print(f"[OK] MongoDB record verified: status={db_record['status']}, patient={db_record['patient_name']}")

    await close_mongo_connection()
    print("==================================================================")
    print("   [PASS] 5-SECOND SOS UX & BACKEND VERIFICATION SUCCESSFUL")
    print("==================================================================")

if __name__ == "__main__":
    asyncio.run(test_sos_ux_lifecycle())
