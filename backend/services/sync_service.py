import random
import uuid
import re
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId
from database import (
    get_collection,
    COLLECTION_PATIENTS,
    COLLECTION_SYMPTOMS,
    COLLECTION_CONSULTATIONS,
    COLLECTION_SYNC_LOGS,
    COLLECTION_EMERGENCY_ALERTS,
    COLLECTION_NOTIFICATIONS,
)
from schemas.sync import (
    BatchSyncRequest,
    BatchSyncResponse,
    SyncItemRequest,
    SyncItemResult,
)
from services.security import hash_password
from services.medical_service import find_patient_by_id_or_pid


def normalize_phone_safe(value: str) -> str:
    """Normalize phone number to 10 digits."""
    digits = re.sub(r"\D", "", str(value))
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    return digits if len(digits) == 10 else value


async def process_batch_sync(
    batch: BatchSyncRequest,
    current_user: dict,
) -> BatchSyncResponse:
    """
    Process a batch of offline-created items with full idempotency,
    timestamp preservation, and duplicate rejection.
    """
    batch_id = batch.batch_id or f"SYNC-{uuid.uuid4().hex[:8].upper()}"
    user_role = current_user.get("role") or ("patient" if "patient_id" in current_user else "asha")
    submitter_id = current_user.get("worker_id") or current_user.get("patient_id") or str(current_user.get("_id"))

    patients_col = get_collection(COLLECTION_PATIENTS)
    symptoms_col = get_collection(COLLECTION_SYMPTOMS)
    cons_col = get_collection(COLLECTION_CONSULTATIONS)
    sync_logs_col = get_collection(COLLECTION_SYNC_LOGS)

    results: List[SyncItemResult] = []
    synced_count = 0
    already_synced_count = 0
    failed_count = 0

    for item in batch.items:
        client_id = item.client_id.strip()
        item_type = item.type.lower().strip()
        client_time = item.client_created_at or datetime.now(timezone.utc)
        payload = item.payload or {}

        try:
            # =========================================================
            # Type 1: New Patient Registration
            # =========================================================
            if item_type in ["new_patient", "patient_registration", "patient"]:
                phone_raw = payload.get("phone", "")
                norm_phone = normalize_phone_safe(phone_raw)

                # Check deduplication by offline_id OR normalized phone
                existing_patient = await patients_col.find_one({
                    "$or": [
                        {"offline_id": client_id},
                        {"phone": norm_phone} if norm_phone else None,
                    ]
                })

                if existing_patient:
                    pid = existing_patient.get("patient_id", str(existing_patient["_id"]))
                    results.append(SyncItemResult(
                        client_id=client_id,
                        type=item.type,
                        status="already_synced",
                        server_id=pid,
                        message=f"Patient record already exists (ID: {pid}).",
                    ))
                    already_synced_count += 1
                else:
                    # Create new patient record
                    full_name = payload.get("full_name", payload.get("name", "Unnamed Patient")).strip()
                    raw_pass = payload.get("password", "123456")
                    pwd_hash = hash_password(raw_pass)

                    patient_id = f"P-{random.randint(1000, 9999)}"
                    patient_doc = {
                        "patient_id": patient_id,
                        "offline_id": client_id,
                        "full_name": full_name,
                        "phone": norm_phone,
                        "hashed_password": pwd_hash,
                        "age": payload.get("age"),
                        "gender": payload.get("gender", "other"),
                        "village": payload.get("village"),
                        "abha_id": payload.get("abha_id"),
                        "preferred_language": payload.get("preferred_language", "en"),
                        "condition": payload.get("condition"),
                        "status": payload.get("status", "stable"),
                        "asha_worker_id": current_user.get("worker_id") if user_role == "asha" else None,
                        "blood_group": payload.get("blood_group"),
                        "allergies": payload.get("allergies", []),
                        "chronic_conditions": payload.get("chronic_conditions", []),
                        "emergency_contacts": payload.get("emergency_contacts", []),
                        "medical_history": payload.get("medical_history", []),
                        "created_at": client_time,
                        "updated_at": datetime.now(timezone.utc),
                    }
                    await patients_col.insert_one(patient_doc)
                    results.append(SyncItemResult(
                        client_id=client_id,
                        type=item.type,
                        status="synced",
                        server_id=patient_id,
                        message="Patient registered and synchronized successfully.",
                    ))
                    synced_count += 1

            # =========================================================
            # Type 2: Symptom Report / AI Assessment
            # =========================================================
            elif item_type in ["symptom_report", "ai_assessment", "symptom", "symptoms"]:
                # Check deduplication by offline_id
                existing_symptom = await symptoms_col.find_one({"offline_id": client_id})
                if existing_symptom:
                    sid = existing_symptom.get("symptom_id", str(existing_symptom["_id"]))
                    results.append(SyncItemResult(
                        client_id=client_id,
                        type=item.type,
                        status="already_synced",
                        server_id=sid,
                        message=f"Symptom record already synced (ID: {sid}).",
                    ))
                    already_synced_count += 1
                else:
                    target_pid = payload.get("patient_id") or current_user.get("patient_id") or str(current_user.get("_id"))
                    patient_doc = await find_patient_by_id_or_pid(target_pid) if target_pid else None
                    canonical_name = (patient_doc.get("full_name") or patient_doc.get("name") or patient_doc.get("patient_name")) if patient_doc else (payload.get("patient_name") or f"Patient {target_pid}")
                    description = payload.get("description") or payload.get("notes") or "Symptom reported offline"
                    symptoms_list = payload.get("symptoms") or []
                    if isinstance(symptoms_list, str):
                        symptoms_list = [symptoms_list]

                    symptom_id = f"SYM-{random.randint(1000, 9999)}"
                    symptom_doc = {
                        "symptom_id": symptom_id,
                        "offline_id": client_id,
                        "patient_id": target_pid,
                        "patient_name": canonical_name,
                        "symptoms": symptoms_list,
                        "description": description.strip(),
                        "recorded_at": client_time,
                        "status": payload.get("status", "reported"),
                        "severity": payload.get("severity", "moderate"),
                        "duration": payload.get("duration", "today"),
                        "submitted_by": user_role,
                        "submitted_by_id": submitter_id,
                        "notes": payload.get("notes"),
                        "created_at": client_time,
                        "updated_at": datetime.now(timezone.utc),
                    }
                    await symptoms_col.insert_one(symptom_doc)

                    # Create Doctor notification for newly synced symptom
                    symptom_summary = ", ".join(symptoms_list) if symptoms_list else description.strip()

                    from services.notification_service import create_symptom_notification
                    await create_symptom_notification(
                        patient_id=target_pid,
                        patient_name=canonical_name,
                        symptom_text=symptom_summary,
                        symptom_id=symptom_id,
                        offline_id=client_id,
                        created_at=client_time,
                    )

                    # Also update patient condition summary
                    if patients_col is not None and patient_doc:
                        status_val = "critical" if payload.get("severity") == "severe" else "review" if payload.get("severity") == "moderate" else "stable"
                        await patients_col.update_one(
                            {"_id": patient_doc["_id"]},
                            {"$set": {"condition": symptom_summary, "status": status_val, "updated_at": datetime.now(timezone.utc)}},
                        )

                    results.append(SyncItemResult(
                        client_id=client_id,
                        type=item.type,
                        status="synced",
                        server_id=symptom_id,
                        message="Symptom log synchronized successfully.",
                    ))
                    synced_count += 1

            # =========================================================
            # Type 3: Vitals Update / Medical Record Update
            # =========================================================
            elif item_type in ["vitals_update", "medical_info", "vitals"]:
                target_pid = payload.get("patient_id") or current_user.get("patient_id")
                patient_doc = await find_patient_by_id_or_pid(target_pid) if target_pid else None

                if not patient_doc:
                    results.append(SyncItemResult(
                        client_id=client_id,
                        type=item.type,
                        status="error",
                        error=f"Patient '{target_pid}' not found for vitals update.",
                    ))
                    failed_count += 1
                else:
                    # Check if this vitals update client_id was already applied
                    existing_history = any(h.get("id") == client_id for h in patient_doc.get("medical_history", []))
                    if existing_history:
                        pid = patient_doc.get("patient_id", str(patient_doc["_id"]))
                        results.append(SyncItemResult(
                            client_id=client_id,
                            type=item.type,
                            status="already_synced",
                            server_id=pid,
                            message="Patient vitals update already synchronized.",
                        ))
                        already_synced_count += 1
                    else:
                        set_fields = {"updated_at": datetime.now(timezone.utc)}
                        for field in ["blood_group", "condition", "status", "village", "age"]:
                            if payload.get(field) is not None:
                                set_fields[field] = payload.get(field)
                        if payload.get("allergies") is not None:
                            set_fields["allergies"] = payload.get("allergies")
                        if payload.get("chronic_conditions") is not None:
                            set_fields["chronic_conditions"] = payload.get("chronic_conditions")

                        # If vitals note provided, add to history
                        vitals_label = payload.get("vitals_label") or payload.get("notes") or f"Update {client_id}"
                        push_ops = {}
                        if vitals_label:
                            push_ops["medical_history"] = {
                                "id": client_id,
                                "date": client_time.strftime("%d %b %Y"),
                                "reason": f"Vitals Update: {vitals_label}",
                                "updated_by": submitter_id,
                            }

                        update_query: Dict[str, Any] = {"$set": set_fields}
                        if push_ops:
                            update_query["$push"] = push_ops

                        await patients_col.update_one({"_id": patient_doc["_id"]}, update_query)
                        pid = patient_doc.get("patient_id", str(patient_doc["_id"]))
                        results.append(SyncItemResult(
                            client_id=client_id,
                            type=item.type,
                            status="synced",
                            server_id=pid,
                            message="Patient vitals and medical info synchronized successfully.",
                        ))
                        synced_count += 1

            # =========================================================
            # Type 4: Consultation Request
            # =========================================================
            elif item_type in ["consultation_request", "teleconsultation", "consultation"]:
                existing_cons = await cons_col.find_one({"offline_id": client_id})
                if existing_cons:
                    cid = existing_cons.get("consultation_id", str(existing_cons["_id"]))
                    results.append(SyncItemResult(
                        client_id=client_id,
                        type=item.type,
                        status="already_synced",
                        server_id=cid,
                        message=f"Consultation request already synced (ID: {cid}).",
                    ))
                    already_synced_count += 1
                else:
                    target_pid = payload.get("patient_id") or current_user.get("patient_id")
                    patient_doc = await find_patient_by_id_or_pid(target_pid) if target_pid else None
                    canonical_name = (patient_doc.get("full_name") or patient_doc.get("name")) if patient_doc else (payload.get("patient_name") or f"Patient {target_pid}")
                    village = (patient_doc.get("village") if patient_doc else None) or payload.get("village")

                    # Check if an active/pending consultation already exists for this patient
                    existing_active = await cons_col.find_one({
                        "patient_id": target_pid,
                        "status": {"$in": ["requested", "accepted", "in_progress"]},
                    })
                    if existing_active:
                        cid = existing_active.get("consultation_id", str(existing_active["_id"]))
                        results.append(SyncItemResult(
                            client_id=client_id,
                            type=item.type,
                            status="already_synced",
                            server_id=cid,
                            message=f"Active consultation request already exists (ID: {cid}).",
                        ))
                        already_synced_count += 1
                    else:
                        cons_id = f"CONS-{random.randint(1000, 9999)}"
                        cons_doc = {
                            "consultation_id": cons_id,
                            "offline_id": client_id,
                            "patient_id": target_pid,
                            "patient_name": canonical_name,
                            "patient_village": village,
                            "doctor_id": payload.get("doctor_id"),
                            "date_time": client_time,
                            "status": "requested",
                            "urgency": payload.get("urgency", "routine"),
                            "reason": payload.get("reason", "Offline consultation request"),
                            "symptoms": payload.get("symptoms", []),
                            "notes": payload.get("notes"),
                            "requested_by": user_role,
                            "call_session": {
                                "room_id": f"room_{cons_id.lower()}",
                                "session_status": "idle",
                                "meeting_link": f"/teleconsultation/{cons_id}",
                            },
                            "created_at": client_time,
                            "updated_at": datetime.now(timezone.utc),
                        }
                        await cons_col.insert_one(cons_doc)
                        results.append(SyncItemResult(
                            client_id=client_id,
                            type=item.type,
                            status="synced",
                            server_id=cons_id,
                            message="Consultation request synchronized successfully.",
                        ))
                        synced_count += 1

            # =========================================================
            # Type 5: Emergency SOS
            # =========================================================
            elif item_type in ["emergency_sos", "emergency", "sos", "emergency_alert"]:
                alerts_col = get_collection(COLLECTION_EMERGENCY_ALERTS)
                notif_col = get_collection(COLLECTION_NOTIFICATIONS)

                # Deduplication by offline_id
                existing_alert = await alerts_col.find_one({"offline_id": client_id}) if alerts_col is not None else None
                if existing_alert:
                    aid = existing_alert.get("alert_id", str(existing_alert["_id"]))
                    results.append(SyncItemResult(
                        client_id=client_id,
                        type=item.type,
                        status="already_synced",
                        server_id=aid,
                        message=f"Emergency alert already synced (ID: {aid}).",
                    ))
                    already_synced_count += 1
                else:
                    target_pid = payload.get("patient_id") or (current_user.get("patient_id") if current_user.get("role") == "patient" else "P-4559")
                    if not target_pid or str(target_pid).startswith("DOC-") or str(target_pid).startswith("ASHA-"):
                        target_pid = "P-4559"

                    patient_doc = await find_patient_by_id_or_pid(target_pid) if target_pid else None
                    if not patient_doc:
                        patient_doc = await patients_col.find_one({"patient_id": "P-4559"})

                    canonical_name = (patient_doc.get("full_name") or patient_doc.get("name")) if patient_doc else "Shreya"
                    target_pid = (patient_doc.get("patient_id") if patient_doc else None) or "P-4559"
                    patient_phone = (patient_doc.get("phone") if patient_doc else None) or payload.get("patient_phone", "9324998108")
                    village = (patient_doc.get("village") if patient_doc else None) or payload.get("village") or "Chandapur"

                    # Resolve assigned ASHA Worker & PHC
                    from services.lora_emergency_service import find_assigned_asha_for_patient, find_on_duty_doctor, calculate_crc16
                    asha_doc = await find_assigned_asha_for_patient(patient_doc) if patient_doc else None
                    asha_worker_id = asha_doc.get("worker_id") if asha_doc else "ASHA-340"
                    asha_name = asha_doc.get("full_name") if asha_doc else "Pooja Sharma"
                    asha_phone = asha_doc.get("phone") if asha_doc else "9876543210"
                    primary_phc = (asha_doc.get("primary_phc") if asha_doc else None) or "Chandapur PHC"

                    doctor_doc = await find_on_duty_doctor(primary_phc)
                    doctor_id = doctor_doc.get("doctor_id") if doctor_doc else "DOC-501"

                    med_snapshot = {
                        "blood_group": patient_doc.get("blood_group", "Unknown") if patient_doc else "Unknown",
                        "allergies": patient_doc.get("allergies", []) if patient_doc else [],
                        "chronic_conditions": patient_doc.get("chronic_conditions", []) if patient_doc else [],
                        "age": patient_doc.get("age") if patient_doc else None,
                        "gender": patient_doc.get("gender") if patient_doc else None,
                    }

                    rand_num = random.randint(1000, 9999)
                    alert_id = f"SOS-2026-{rand_num}"
                    packet_id = f"LORA-PKT-865-{rand_num}"
                    gateway_id = "GW-CHANDAPUR-PHC-01"
                    now = datetime.now(timezone.utc)
                    em_type = payload.get("emergency_type") or "general_sos"

                    frame_raw = f"{packet_id}|{alert_id}|{target_pid}|{village}|{em_type}|{client_time.isoformat()}".encode("utf-8")
                    crc_hex = calculate_crc16(frame_raw)
                    gps = payload.get("gps_coordinates") or {"lat": 19.9975, "lng": 73.7898}

                    alert_doc = {
                        "alert_id": alert_id,
                        "offline_id": client_id,
                        "patient_id": target_pid,
                        "patient_name": canonical_name,
                        "patient_phone": patient_phone,
                        "village": village,
                        "caller_role": "patient",
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
                        "emergency_type": em_type,
                        "emergency_notes": payload.get("emergency_notes") or "Offline SOS synchronized via AyushLink batch sync",
                        "medical_snapshot": med_snapshot,
                        "gps_coordinates": gps,
                        "packet_id": packet_id,
                        "gateway_id": gateway_id,
                        "frequency": "865.2 MHz (IN865 Band - SIMULATED)",
                        "spreading_factor": "SF10 (SIMULATED)",
                        "bandwidth": "125 kHz (SIMULATED)",
                        "rssi": -98,
                        "snr": -4.5,
                        "packet_size": len(frame_raw),
                        "checksum": crc_hex,
                        "is_simulation": True,
                        "created_at": client_time,
                        "updated_at": now,
                        "acknowledged_at": None,
                        "resolved_at": None,
                    }

                    # Auto-resolve prior active alerts for this patient
                    if alerts_col is not None:
                        await alerts_col.update_many(
                            {"patient_id": target_pid, "status": {"$ne": "RESOLVED"}},
                            {"$set": {
                                "status": "RESOLVED",
                                "resolved_at": now,
                                "resolution_notes": "Superseded by new emergency alert"
                            }}
                        )
                        await alerts_col.insert_one(alert_doc)

                    # Create high-priority notifications
                    if notif_col is not None:
                        med_summary = f"Blood: {med_snapshot['blood_group']}"
                        if med_snapshot.get("allergies"):
                            med_summary += f" | Allergies: {', '.join(med_snapshot['allergies'])}"

                        if asha_worker_id:
                            notif_asha = {
                                "notification_id": f"NOTIF-SOS-{rand_num}-ASHA",
                                "alert_id": alert_id,
                                "patient_id": target_pid,
                                "patient_name": canonical_name,
                                "recipient_role": "asha",
                                "recipient_id": asha_worker_id,
                                "title": f"🚨 EMERGENCY SOS: {canonical_name}",
                                "message": f"EMERGENCY in {village}: {canonical_name} ({patient_phone}) triggered SOS [{em_type.upper()}]. {med_summary}.",
                                "type": "alert",
                                "is_read": False,
                                "created_at": now,
                                "updated_at": now,
                            }
                            await notif_col.insert_one(notif_asha)

                        notif_doc_payload = {
                            "notification_id": f"NOTIF-SOS-{rand_num}-DOC",
                            "alert_id": alert_id,
                            "patient_id": target_pid,
                            "patient_name": canonical_name,
                            "recipient_role": "doctor",
                            "recipient_id": doctor_id or "doctor",
                            "title": f"🚨 High-Priority SOS Alert ({village})",
                            "message": f"Emergency triggered by {canonical_name} in {village}. LoRa Gateway {gateway_id} ACK confirmed.",
                            "type": "alert",
                            "is_read": False,
                            "created_at": now,
                            "updated_at": now,
                        }
                        await notif_col.insert_one(notif_doc_payload)

                    results.append(SyncItemResult(
                        client_id=client_id,
                        type=item.type,
                        status="synced",
                        server_id=alert_id,
                        message="Emergency SOS synchronized and dispatched successfully.",
                    ))
                    synced_count += 1

            # Unknown Type
            else:
                results.append(SyncItemResult(
                    client_id=client_id,
                    type=item.type,
                    status="error",
                    error=f"Unsupported sync item type '{item_type}'.",
                ))
                failed_count += 1

        except Exception as e:
            results.append(SyncItemResult(
                client_id=client_id,
                type=item.type,
                status="error",
                error=str(e),
            ))
            failed_count += 1

    # Log sync batch in MongoDB
    if sync_logs_col is not None:
        await sync_logs_col.insert_one({
            "batch_id": batch_id,
            "user_id": submitter_id,
            "role": user_role,
            "total_items": len(batch.items),
            "synced_count": synced_count,
            "already_synced_count": already_synced_count,
            "failed_count": failed_count,
            "synced_at": datetime.now(timezone.utc),
        })

    return BatchSyncResponse(
        batch_id=batch_id,
        total_items=len(batch.items),
        synced_count=synced_count,
        already_synced_count=already_synced_count,
        failed_count=failed_count,
        results=results,
        synced_at=datetime.now(timezone.utc),
    )
