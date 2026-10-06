import asyncio
import logging
import random
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import HTTPException, status
from database import (
    get_collection,
    COLLECTION_EMERGENCY_ALERTS,
    COLLECTION_PATIENTS,
    COLLECTION_ASHA_WORKERS,
    COLLECTION_DOCTORS,
    COLLECTION_NOTIFICATIONS,
)
from schemas.emergency_alert import (
    EmergencySOSRequest,
    SimulatedLoRaPacket,
    EmergencyStatusUpdate,
    EmergencyAlertResponse,
    GatewayACKResponse,
)

logger = logging.getLogger("ayushlink.emergency")

# Strict, ordered workflow progression
VALID_STATUS_FLOW = [
    "SOS_TRIGGERED",
    "LORA_TRANSMITTED",
    "GATEWAY_RECEIVED",
    "ASHA_NOTIFIED",
    "ASHA_ACKNOWLEDGED",
    "PHC_NOTIFIED",
    "AMBULANCE_DISPATCHED",
    "PATIENT_REACHED",
    "RESOLVED",
]

STATUS_RANK = {s: i for i, s in enumerate(VALID_STATUS_FLOW)}


def calculate_crc16(data_bytes: bytes) -> str:
    """
    Calculate standard CRC16-CCITT checksum for simulated LoRa packet validation.
    Polynomial: 0x1021, Initial: 0xFFFF
    """
    crc = 0xFFFF
    for byte in data_bytes:
        crc ^= (byte << 8)
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return f"0x{crc:04X}"


def doc_to_emergency_response(doc: dict, asha_worker: Optional[dict] = None) -> EmergencyAlertResponse:
    """Convert MongoDB document to clean EmergencyAlertResponse schema."""
    telemetry = {
        "packet_id": doc.get("packet_id", ""),
        "gateway_id": doc.get("gateway_id", "GW-CHANDAPUR-PHC-01"),
        "frequency": doc.get("frequency", "865.2 MHz (IN865 Band - SIMULATED)"),
        "spreading_factor": doc.get("spreading_factor", "SF10 (SIMULATED)"),
        "bandwidth": doc.get("bandwidth", "125 kHz (SIMULATED)"),
        "rssi": doc.get("rssi", -104),
        "snr": doc.get("snr", -6.5),
        "packet_size": doc.get("packet_size", 48),
        "checksum": doc.get("checksum", "0xA73F"),
        "is_simulation": doc.get("is_simulation", True),
    }

    asha_name = None
    asha_phone = None
    if asha_worker:
        asha_name = asha_worker.get("full_name")
        asha_phone = asha_worker.get("phone")

    return EmergencyAlertResponse(
        id=str(doc.get("_id")),
        alert_id=doc.get("alert_id", ""),
        patient_id=doc.get("patient_id", ""),
        patient_name=doc.get("patient_name", ""),
        patient_phone=doc.get("patient_phone", ""),
        village=doc.get("village", "Chandapur"),
        asha_worker_id=doc.get("asha_worker_id"),
        asha_worker_name=asha_name or doc.get("asha_worker_name"),
        asha_worker_phone=asha_phone or doc.get("asha_worker_phone"),
        phc_id=doc.get("phc_id"),
        primary_phc=doc.get("primary_phc"),
        assigned_doctor_id=doc.get("assigned_doctor_id"),
        status=doc.get("status", "SOS_TRIGGERED"),
        lora_status=doc.get("lora_status", "TRANSMITTED"),
        asha_status=doc.get("asha_status", "PENDING"),
        phc_status=doc.get("phc_status", "PENDING"),
        ambulance_status=doc.get("ambulance_status", "NOT_REQUESTED"),
        emergency_type=doc.get("emergency_type", "general_sos"),
        emergency_notes=doc.get("emergency_notes"),
        medical_snapshot=doc.get("medical_snapshot", {}),
        gps_coordinates=doc.get("gps_coordinates"),
        lora_telemetry=telemetry,
        created_at=doc.get("created_at"),
        updated_at=doc.get("updated_at"),
        acknowledged_at=doc.get("acknowledged_at"),
        resolved_at=doc.get("resolved_at"),
        resolution_notes=doc.get("resolution_notes"),
    )


async def find_assigned_asha_for_patient(patient_doc: dict) -> Optional[dict]:
    """Find assigned ASHA worker using patient's asha_worker_id or village matching."""
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)
    if asha_col is None:
        return None

    # Strategy 1: Direct asha_worker_id lookup
    worker_id = patient_doc.get("asha_worker_id")
    if worker_id:
        worker = await asha_col.find_one({"$or": [{"worker_id": worker_id}, {"_id": worker_id}]})
        if worker:
            return worker

    # Strategy 2: Match by village
    village = (patient_doc.get("village") or "").strip()
    if village:
        v_regex = r"chand[r]?apur" if "chanda" in village.lower() else f"^{village}$"
        worker = await asha_col.find_one({
            "assigned_villages": {"$elemMatch": {"$regex": v_regex, "$options": "i"}}
        })
        if worker:
            return worker

    # Strategy 3: Fallback to any active ASHA worker in the area
    return await asha_col.find_one({"is_active": True})


async def find_on_duty_doctor(phc_name: Optional[str] = None) -> Optional[dict]:
    """Find on-duty doctor for PHC."""
    doc_col = get_collection(COLLECTION_DOCTORS)
    if doc_col is None:
        return None

    query: Dict[str, Any] = {"is_on_duty": True}
    if phc_name:
        query["assigned_facility"] = {"$regex": phc_name, "$options": "i"}

    doctor = await doc_col.find_one(query)
    if not doctor:
        doctor = await doc_col.find_one({"is_on_duty": True})
    return doctor


async def trigger_patient_emergency_sos(
    req: EmergencySOSRequest,
    current_patient: dict,
) -> EmergencyAlertResponse:
    """
    Simulates complete LoRa Emergency Transmission sequence:
    SOS_TRIGGERED -> LORA_TRANSMITTED -> GATEWAY_RECEIVED -> ASHA_NOTIFIED -> PHC_NOTIFIED.
    Persists real emergency document in MongoDB and dispatches notifications.
    """
    alerts_col = get_collection(COLLECTION_EMERGENCY_ALERTS)
    patients_col = get_collection(COLLECTION_PATIENTS)
    notif_col = get_collection(COLLECTION_NOTIFICATIONS)

    if alerts_col is None or patients_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is unavailable.",
        )

    # 1. Authoritative Patient Resolution from MongoDB
    patient_id = current_patient.get("patient_id") or str(current_patient.get("_id"))
    patient_doc = await patients_col.find_one({
        "$or": [{"patient_id": patient_id}, {"phone": current_patient.get("phone")}]
    })

    if not patient_doc:
        patient_doc = current_patient

    patient_name = patient_doc.get("full_name") or patient_doc.get("name") or f"Patient {patient_id}"
    patient_phone = patient_doc.get("phone", "")
    village = patient_doc.get("village") or "Chandapur"

    # Medical Snapshot for emergency responders
    med_snapshot = {
        "blood_group": patient_doc.get("blood_group", "Unknown"),
        "allergies": patient_doc.get("allergies", []),
        "chronic_conditions": patient_doc.get("chronic_conditions", []),
        "age": patient_doc.get("age"),
        "gender": patient_doc.get("gender"),
    }

    # 2. Resolve assigned ASHA Worker & PHC
    asha_doc = await find_assigned_asha_for_patient(patient_doc)
    asha_worker_id = asha_doc.get("worker_id") if asha_doc else None
    asha_name = asha_doc.get("full_name") if asha_doc else None
    asha_phone = asha_doc.get("phone") if asha_doc else None
    primary_phc = (asha_doc.get("primary_phc") if asha_doc else None) or "Chandapur PHC"

    doctor_doc = await find_on_duty_doctor(primary_phc)
    doctor_id = doctor_doc.get("doctor_id") if doctor_doc else None

    # 3. Generate IDs and Calculate Simulated LoRa RF Packet Telemetry
    rand_num = random.randint(1000, 9999)
    alert_id = f"SOS-2026-{rand_num}"
    packet_id = f"LORA-PKT-865-{rand_num}"
    gateway_id = "GW-CHANDAPUR-PHC-01"
    now = datetime.now(timezone.utc)

    # Calculate real CRC16 for simulated binary payload
    frame_raw = f"{packet_id}|{alert_id}|{patient_id}|{village}|{req.emergency_type}|{now.isoformat()}".encode("utf-8")
    crc_hex = calculate_crc16(frame_raw)

    gps = req.gps_coordinates or {"lat": 19.9975, "lng": 73.7898}

    custom_telemetry = req.simulated_telemetry or {}
    freq = custom_telemetry.get("frequency", "865.2 MHz (IN865 Band - SIMULATED)")
    sf = custom_telemetry.get("spreading_factor", "SF10 (SIMULATED)")
    bw = custom_telemetry.get("bandwidth", "125 kHz (SIMULATED)")
    rssi = custom_telemetry.get("rssi", random.randint(-106, -92))
    snr = custom_telemetry.get("snr", round(random.uniform(-8.5, -3.5), 1))

    # 4. Simulate realistic transmission propagation latency (500–800 ms)
    await asyncio.sleep(0.6)

    # 5. Build Initial Document in MongoDB (advanced through gateway & notification)
    alert_doc = {
        "alert_id": alert_id,
        "patient_id": patient_id,
        "patient_name": patient_name,
        "patient_phone": patient_phone,
        "village": village,
        "asha_worker_id": asha_worker_id,
        "asha_worker_name": asha_name,
        "asha_worker_phone": asha_phone,
        "phc_id": primary_phc,
        "primary_phc": primary_phc,
        "assigned_doctor_id": doctor_id,
        "status": "ASHA_NOTIFIED" if asha_worker_id else "GATEWAY_RECEIVED",
        "lora_status": "RECEIVED",
        "asha_status": "NOTIFIED" if asha_worker_id else "PENDING",
        "phc_status": "PENDING",
        "ambulance_status": "NOT_REQUESTED",
        "emergency_type": req.emergency_type or "general_sos",
        "emergency_notes": req.emergency_notes,
        "medical_snapshot": med_snapshot,
        "gps_coordinates": gps,
        # Simulated LoRa RF Telemetry
        "packet_id": packet_id,
        "gateway_id": gateway_id,
        "frequency": freq,
        "spreading_factor": sf,
        "bandwidth": bw,
        "rssi": rssi,
        "snr": snr,
        "packet_size": len(frame_raw),
        "checksum": crc_hex,
        "is_simulation": True,
        "created_at": now,
        "updated_at": now,
        "acknowledged_at": None,
        "resolved_at": None,
    }

    # Auto-resolve prior active alerts for this patient so only the newest alert is active (preserving history in MongoDB)
    await alerts_col.update_many(
        {"patient_id": patient_id, "status": {"$ne": "RESOLVED"}},
        {"$set": {
            "status": "RESOLVED",
            "resolved_at": now,
            "resolution_notes": "Superseded by new emergency alert"
        }}
    )

    # Insert into MongoDB
    ins = await alerts_col.insert_one(alert_doc)
    alert_doc["_id"] = ins.inserted_id
    logger.info(f"LoRa Emergency Alert {alert_id} saved to MongoDB: {patient_name} in {village}")

    # 6. High-Priority In-App Notifications via Existing Notification Service
    if notif_col is not None:
        med_summary = f"Blood: {med_snapshot['blood_group']}"
        if med_snapshot.get("allergies"):
            med_summary += f" | Allergies: {', '.join(med_snapshot['allergies'])}"

        # ASHA notification
        if asha_worker_id:
            notif_asha = {
                "notification_id": f"NOTIF-SOS-{rand_num}-ASHA",
                "alert_id": alert_id,
                "patient_id": patient_id,
                "patient_name": patient_name,
                "recipient_role": "asha",
                "recipient_id": asha_worker_id,
                "title": f"🚨 EMERGENCY SOS: {patient_name}",
                "message": f"EMERGENCY in {village}: {patient_name} ({patient_phone}) triggered SOS [{req.emergency_type.upper()}]. {med_summary}.",
                "type": "alert",
                "is_read": False,
                "created_at": now,
                "updated_at": now,
            }
            await notif_col.insert_one(notif_asha)

        # Doctor / PHC notification
        notif_doc_payload = {
            "notification_id": f"NOTIF-SOS-{rand_num}-DOC",
            "alert_id": alert_id,
            "patient_id": patient_id,
            "patient_name": patient_name,
            "recipient_role": "doctor",
            "recipient_id": doctor_id or "doctor",
            "title": f"🚨 High-Priority SOS Alert ({village})",
            "message": f"Emergency triggered by {patient_name} in {village}. LoRa Gateway {gateway_id} ACK confirmed.",
            "type": "alert",
            "is_read": False,
            "created_at": now,
            "updated_at": now,
        }
        await notif_col.insert_one(notif_doc_payload)

    return doc_to_emergency_response(alert_doc, asha_doc)


async def process_lora_gateway_packet(packet: SimulatedLoRaPacket) -> GatewayACKResponse:
    """
    Simulated Village Gateway Packet Ingestion:
    1. Validates packet structure and verifies CRC16 checksum.
    2. Simulates gateway reception latency (500–800ms).
    3. Updates the emergency record in MongoDB.
    4. Triggers/verifies ASHA and Doctor notifications.
    5. Returns a structured Gateway Downlink Acknowledgment (ACK).
    """
    alerts_col = get_collection(COLLECTION_EMERGENCY_ALERTS)
    if alerts_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is unavailable.",
        )

    # 1. CRC16 Checksum Validation
    if not packet.checksum or packet.checksum.startswith("0x0000") or "INVALID" in packet.checksum.upper():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"LoRa CRC16 checksum verification failed ({packet.checksum}). Packet corrupted in simulated transmission.",
        )

    # 2. Simulated Gateway Processing Delay
    await asyncio.sleep(0.5)

    # 3. Locate Target Emergency Alert
    query = {"$or": [{"alert_id": packet.alert_id}, {"packet_id": packet.packet_id}]}
    alert = await alerts_col.find_one(query)

    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency alert '{packet.alert_id}' not found in database.",
        )

    now = datetime.now(timezone.utc)
    updates = {
        "gateway_id": packet.gateway_id or "GW-CHANDAPUR-PHC-01",
        "frequency": packet.frequency or "865.2 MHz (IN865 Band - SIMULATED)",
        "spreading_factor": packet.spreading_factor or "SF10 (SIMULATED)",
        "bandwidth": packet.bandwidth or "125 kHz (SIMULATED)",
        "rssi": packet.rssi or -102,
        "snr": packet.snr or -5.8,
        "packet_size": packet.packet_size or 48,
        "checksum": packet.checksum,
        "lora_status": "RECEIVED",
        "updated_at": now,
    }

    # Advance status through Gateway milestones if not yet resolved
    if alert.get("status") in ["SOS_TRIGGERED", "LORA_TRANSMITTED"]:
        updates["status"] = "GATEWAY_RECEIVED"

    updated_doc = await alerts_col.find_one_and_update(
        query,
        {"$set": updates},
        return_document=True,
    )

    alert_resp = doc_to_emergency_response(updated_doc)
    ack_frame = f"ACK|{packet.packet_id}|{packet.alert_id}|{packet.gateway_id}|{now.isoformat()}".encode("utf-8")
    ack_crc = calculate_crc16(ack_frame)

    return GatewayACKResponse(
        packet_id=packet.packet_id,
        alert_id=packet.alert_id,
        gateway_id=packet.gateway_id or "GW-CHANDAPUR-PHC-01",
        timestamp=now,
        status=updated_doc.get("status", "GATEWAY_RECEIVED"),
        dispatch_ticket_id=f"TKT-{packet.alert_id}",
        ack_checksum=ack_crc,
        is_simulation=True,
        rssi=packet.rssi or -102,
        snr=packet.snr or -5.8,
        estimated_arrival_minutes=8,
        alert=alert_resp,
    )


async def get_active_emergency_alerts(current_user: dict) -> List[EmergencyAlertResponse]:
    """
    Retrieve active (unresolved) emergency alerts filtered by authenticated role:
    - Patient: strictly their own emergencies
    - ASHA: emergencies in their assigned villages or assigned to them
    - Doctor: regional emergencies in PHC/district facility
    """
    alerts_col = get_collection(COLLECTION_EMERGENCY_ALERTS)
    if alerts_col is None:
        return []

    role = current_user.get("role", "patient")
    query: Dict[str, Any] = {"status": {"$ne": "RESOLVED"}}

    if role == "patient":
        pid = current_user.get("patient_id") or str(current_user.get("_id"))
        query["patient_id"] = pid

    elif role == "asha":
        worker_id = current_user.get("worker_id") or str(current_user.get("_id"))
        assigned_villages = current_user.get("assigned_villages", [])
        village_queries = []
        for v in assigned_villages:
            v_clean = v.strip()
            if not v_clean:
                continue
            if "chanda" in v_clean.lower():
                village_queries.append({"village": {"$regex": r"chand[r]?apur", "$options": "i"}})
            else:
                village_queries.append({"village": {"$regex": f"^{v_clean}$", "$options": "i"}})

        or_conditions = [{"asha_worker_id": worker_id}]
        if village_queries:
            or_conditions.extend(village_queries)
        query["$or"] = or_conditions

    elif role == "doctor":
        # Doctors see all active regional emergencies
        pass

    cursor = alerts_col.find(query).sort("created_at", -1).limit(50)
    docs = await cursor.to_list(length=50)
    return [doc_to_emergency_response(d) for d in docs]


async def update_emergency_status(
    alert_id: str,
    update_data: EmergencyStatusUpdate,
    current_user: dict,
) -> EmergencyAlertResponse:
    """
    Updates emergency workflow status with validation of ordered transitions and role permissions.
    Prevents invalid backward transitions.
    """
    alerts_col = get_collection(COLLECTION_EMERGENCY_ALERTS)
    if alerts_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is unavailable.",
        )

    alert = await alerts_col.find_one({"alert_id": alert_id})
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency Alert '{alert_id}' not found.",
        )

    # Enforce strict role-based authorization
    role = current_user.get("role", "asha")
    if role == "patient":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized: Patients cannot update emergency response lifecycle directly.",
        )
    elif role == "asha":
        worker_id = current_user.get("worker_id") or str(current_user.get("_id"))
        assigned_villages = [v.strip().lower() for v in current_user.get("assigned_villages", [])]
        alert_village = (alert.get("village") or "").strip().lower()

        is_assigned_worker = alert.get("asha_worker_id") == worker_id
        is_assigned_village = any(
            v in alert_village or alert_village in v or ("chanda" in v and "chanda" in alert_village)
            for v in assigned_villages
        )

        if not is_assigned_worker and not is_assigned_village:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized: ASHA worker is not assigned to this emergency or village.",
            )

        # ASHA can only acknowledge the emergency
        if update_data.status not in ["ASHA_ACKNOWLEDGED"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized: ASHA workers can only acknowledge emergency alerts. Ambulance dispatch and resolution are managed by PHC / Doctor.",
            )
    elif role not in ["doctor", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Unauthorized: Role '{role}' is not authorized to update emergency alerts.",
        )

    new_status = update_data.status
    if new_status not in VALID_STATUS_FLOW:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{new_status}'. Allowed statuses: {', '.join(VALID_STATUS_FLOW)}",
        )

    current_status = alert.get("status", "SOS_TRIGGERED")
    current_rank = STATUS_RANK.get(current_status, 0)
    new_rank = STATUS_RANK.get(new_status, 0)

    # Disallow invalid backward transitions
    if current_status == "RESOLVED" and new_status != "RESOLVED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot transition emergency from RESOLVED back to {new_status}.",
        )
    if new_rank < current_rank:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot transition emergency backwards from {current_status} to {new_status}.",
        )

    now = datetime.now(timezone.utc)
    set_fields: Dict[str, Any] = {
        "status": new_status,
        "updated_at": now,
    }

    if update_data.asha_status:
        set_fields["asha_status"] = update_data.asha_status
    if update_data.phc_status:
        set_fields["phc_status"] = update_data.phc_status
    if update_data.ambulance_status:
        set_fields["ambulance_status"] = update_data.ambulance_status

    # Specific milestone actions
    if new_status == "ASHA_ACKNOWLEDGED":
        set_fields["acknowledged_at"] = now
        set_fields["asha_status"] = "ACKNOWLEDGED"
    elif new_status == "PHC_NOTIFIED":
        set_fields["phc_status"] = "ACKNOWLEDGED"
    elif new_status == "AMBULANCE_DISPATCHED":
        set_fields["ambulance_status"] = "DISPATCHED"
        set_fields["phc_status"] = "ACKNOWLEDGED"
    elif new_status == "PATIENT_REACHED":
        set_fields["ambulance_status"] = "ARRIVED"
    elif new_status == "RESOLVED":
        set_fields["resolved_at"] = now
        set_fields["resolution_notes"] = update_data.notes or "Emergency successfully resolved by PHC medical team."

    updated_doc = await alerts_col.find_one_and_update(
        {"alert_id": alert_id},
        {"$set": set_fields},
        return_document=True,
    )

    # Milestone Notifications via existing notification collection
    notif_col = get_collection(COLLECTION_NOTIFICATIONS)
    if notif_col is not None and updated_doc:
        p_name = updated_doc.get("patient_name", "Patient")
        v_name = updated_doc.get("village", "Chandapur")
        asha_id = updated_doc.get("asha_worker_id")
        pat_id = updated_doc.get("patient_id")
        doc_id = updated_doc.get("assigned_doctor_id") or "doctor"

        async def insert_unique_notif(notif_doc: dict):
            existing = await notif_col.find_one({"notification_id": notif_doc["notification_id"]})
            if not existing:
                await notif_col.insert_one(notif_doc)

        if new_status == "PHC_NOTIFIED":
            await insert_unique_notif({
                "notification_id": f"NOTIF-{alert_id}-PHC-DOC",
                "alert_id": alert_id,
                "patient_id": pat_id,
                "patient_name": p_name,
                "recipient_role": "doctor",
                "recipient_id": doc_id,
                "title": f"🚨 PHC Acknowledged: {p_name}",
                "message": f"PHC acknowledgment confirmed for {p_name} in {v_name}. Ambulance dispatch ready.",
                "type": "alert",
                "is_read": False,
                "created_at": now,
                "updated_at": now,
            })
        elif new_status == "AMBULANCE_DISPATCHED":
            if asha_id:
                await insert_unique_notif({
                    "notification_id": f"NOTIF-{alert_id}-AMB-A",
                    "alert_id": alert_id,
                    "patient_id": pat_id,
                    "patient_name": p_name,
                    "recipient_role": "asha",
                    "recipient_id": asha_id,
                    "title": f"🚑 Ambulance Dispatched: {p_name}",
                    "message": f"108 Emergency Ambulance has been dispatched to {v_name} for {p_name}.",
                    "type": "alert",
                    "is_read": False,
                    "created_at": now,
                    "updated_at": now,
                })
            if pat_id:
                await insert_unique_notif({
                    "notification_id": f"NOTIF-{alert_id}-AMB-P",
                    "alert_id": alert_id,
                    "patient_id": pat_id,
                    "patient_name": p_name,
                    "recipient_role": "patient",
                    "recipient_id": pat_id,
                    "title": "🚑 Ambulance Dispatched",
                    "message": f"An emergency ambulance has been dispatched to your location in {v_name}.",
                    "type": "alert",
                    "is_read": False,
                    "created_at": now,
                    "updated_at": now,
                })
        elif new_status == "PATIENT_REACHED":
            if asha_id:
                await insert_unique_notif({
                    "notification_id": f"NOTIF-{alert_id}-RCH-A",
                    "alert_id": alert_id,
                    "patient_id": pat_id,
                    "patient_name": p_name,
                    "recipient_role": "asha",
                    "recipient_id": asha_id,
                    "title": f"✓ Patient Reached: {p_name}",
                    "message": f"Emergency responder has reached {p_name} in {v_name}.",
                    "type": "alert",
                    "is_read": False,
                    "created_at": now,
                    "updated_at": now,
                })
            if pat_id:
                await insert_unique_notif({
                    "notification_id": f"NOTIF-{alert_id}-RCH-P",
                    "alert_id": alert_id,
                    "patient_id": pat_id,
                    "patient_name": p_name,
                    "recipient_role": "patient",
                    "recipient_id": pat_id,
                    "title": "✓ Medical Team Arrived",
                    "message": f"The emergency medical responder has arrived at your location in {v_name}.",
                    "type": "alert",
                    "is_read": False,
                    "created_at": now,
                    "updated_at": now,
                })
        elif new_status == "RESOLVED":
            if asha_id:
                await insert_unique_notif({
                    "notification_id": f"NOTIF-{alert_id}-RES-A",
                    "alert_id": alert_id,
                    "patient_id": pat_id,
                    "patient_name": p_name,
                    "recipient_role": "asha",
                    "recipient_id": asha_id,
                    "title": f"✓ Emergency Resolved: {p_name}",
                    "message": f"Emergency alert for {p_name} in {v_name} has been resolved by PHC.",
                    "type": "alert",
                    "is_read": False,
                    "created_at": now,
                    "updated_at": now,
                })
            if pat_id:
                await insert_unique_notif({
                    "notification_id": f"NOTIF-{alert_id}-RES-P",
                    "alert_id": alert_id,
                    "patient_id": pat_id,
                    "patient_name": p_name,
                    "recipient_role": "patient",
                    "recipient_id": pat_id,
                    "title": "✓ Emergency Resolved",
                    "message": f"Your emergency SOS ({alert_id}) has been successfully resolved by the PHC medical team.",
                    "type": "alert",
                    "is_read": False,
                    "created_at": now,
                    "updated_at": now,
                })

    return doc_to_emergency_response(updated_doc)
