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
