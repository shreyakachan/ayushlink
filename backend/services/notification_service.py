import random
import logging
from datetime import datetime, timezone
from typing import Optional, List
from database import (
    get_collection,
    COLLECTION_NOTIFICATIONS,
    COLLECTION_CONSULTATIONS,
    COLLECTION_PRESCRIPTIONS,
    COLLECTION_SYMPTOMS,
)
from schemas.notification import NotificationResponse

logger = logging.getLogger("ayushlink.notifications")


def doc_to_notification_response(doc: dict) -> NotificationResponse:
    """Convert MongoDB notification document to clean NotificationResponse schema."""
    return NotificationResponse(
        id=str(doc.get("_id")),
        notification_id=doc.get("notification_id") or str(doc.get("_id")),
        patient_id=doc.get("patient_id"),
        patient_name=doc.get("patient_name"),
        prescription_id=doc.get("prescription_id"),
        consultation_id=doc.get("consultation_id"),
        doctor_id=doc.get("doctor_id"),
        doctor_name=doc.get("doctor_name"),
        title=doc.get("title", "New Notification"),
        message=doc.get("message", ""),
        type=doc.get("type", "prescription"),
        is_read=doc.get("is_read", False),
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
    )


async def create_prescription_notification(
    patient_id: str,
    doctor_name: Optional[str] = None,
    prescription_id: Optional[str] = None,
    consultation_id: Optional[str] = None,
    doctor_id: Optional[str] = None,
) -> Optional[NotificationResponse]:
    """
    Create an in-app notification for a specific patient when a prescription is issued.
    Guarantees idempotency and prevents duplicate notifications for the same prescription.
    """
    notifications_col = get_collection(COLLECTION_NOTIFICATIONS)
    if notifications_col is None:
        logger.warning("Notifications collection unavailable in MongoDB.")
        return None

    if not patient_id:
        logger.warning("Cannot create notification without a patient_id.")
        return None

    # Check for existing notification to avoid duplicates
    dedup_queries = []
    if prescription_id:
        dedup_queries.append({"prescription_id": prescription_id})
    if consultation_id:
        dedup_queries.append({"consultation_id": consultation_id})

    if dedup_queries:
        existing = await notifications_col.find_one({
            "patient_id": patient_id,
            "$or": dedup_queries,
        })
        if existing:
            logger.info(f"Notification already exists for prescription {prescription_id} / consultation {consultation_id}")
            return doc_to_notification_response(existing)

    # Format dynamic doctor message
    doc_display_name = (doctor_name or "").strip()
    if doc_display_name:
        message = f"{doc_display_name} has issued a new prescription for you."
    else:
        message = "A doctor has issued a new prescription for you."

    title = "New Prescription Received"
    now = datetime.now(timezone.utc)
    notif_num = random.randint(1000, 9999)
    notification_id = f"NOTIF-{notif_num}"

    notif_doc = {
        "notification_id": notification_id,
        "patient_id": patient_id,
        "prescription_id": prescription_id,
        "consultation_id": consultation_id,
        "doctor_id": doctor_id,
        "doctor_name": doc_display_name or None,
        "recipient_role": "patient",
        "recipient_id": patient_id,
        "title": title,
        "message": message,
        "type": "prescription",
        "is_read": False,
        "created_at": now,
        "updated_at": now,
    }

    insert_result = await notifications_col.insert_one(notif_doc)
    notif_doc["_id"] = insert_result.inserted_id
    logger.info(f"Notification {notification_id} created for patient {patient_id} by doctor {doc_display_name}")

    return doc_to_notification_response(notif_doc)


async def create_doctor_consultation_notification(
    doctor_id: Optional[str],
    patient_id: str,
    patient_name: Optional[str],
    consultation_id: str,
    urgency: str = "routine",
    reason: Optional[str] = None,
) -> Optional[NotificationResponse]:
    """
    Create an in-app alert for a doctor when a new consultation is requested.
    """
    notifications_col = get_collection(COLLECTION_NOTIFICATIONS)
    if notifications_col is None:
        return None

    # Check for duplicate
    existing = await notifications_col.find_one({
        "consultation_id": consultation_id,
        "recipient_role": "doctor",
    })
    if existing:
        return doc_to_notification_response(existing)

    p_name = patient_name or f"Patient {patient_id}"
    urgency_tag = urgency.capitalize() if urgency in ["urgent", "emergency"] else "New"
    title = f"{urgency_tag} Consultation Requested"
    reason_text = f": '{reason}'" if reason else ""
    message = f"{p_name} requested a {urgency} teleconsultation{reason_text}."

    now = datetime.now(timezone.utc)
    notif_id = f"NOTIF-{random.randint(1000, 9999)}"

    notif_doc = {
        "notification_id": notif_id,
        "patient_id": patient_id,
        "patient_name": p_name,
        "consultation_id": consultation_id,
        "doctor_id": doctor_id,
        "recipient_role": "doctor",
        "recipient_id": doctor_id,
        "title": title,
        "message": message,
        "type": "alert" if urgency in ["urgent", "emergency"] else "consultation",
        "is_read": False,
        "created_at": now,
        "updated_at": now,
    }

    ins = await notifications_col.insert_one(notif_doc)
    notif_doc["_id"] = ins.inserted_id
    return doc_to_notification_response(notif_doc)


async def get_patient_notifications(patient_id: str) -> List[NotificationResponse]:
    """Retrieve all notifications for a specific patient sorted newest first."""
    notifications_col = get_collection(COLLECTION_NOTIFICATIONS)
    if notifications_col is None:
        return []

    cursor = notifications_col.find({
        "$or": [
            {"patient_id": patient_id, "recipient_role": {"$ne": "doctor"}},
            {"recipient_id": patient_id},
        ]
    }).sort("created_at", -1)

    results: List[NotificationResponse] = []
    async for doc in cursor:
        results.append(doc_to_notification_response(doc))
    return results


async def get_doctor_notifications(current_doctor: dict) -> List[NotificationResponse]:
    """
    Retrieve all notifications belonging to the currently authenticated doctor from MongoDB.
    Aggregates real events from:
      1. Direct doctor-directed notifications in `notifications` collection
      2. Real consultation requests and updates in `consultations` collection
      3. Digital prescriptions issued by this doctor in `prescriptions` collection
      4. High-risk symptom submissions by patients
    Deduplicates and sorts chronologically descending (newest first).
    """
    notifications_col = get_collection(COLLECTION_NOTIFICATIONS)
    consultations_col = get_collection(COLLECTION_CONSULTATIONS)
    prescriptions_col = get_collection(COLLECTION_PRESCRIPTIONS)
    symptoms_col = get_collection(COLLECTION_SYMPTOMS)

    doc_id = current_doctor.get("doctor_id") or str(current_doctor.get("_id"))
    doc_name = current_doctor.get("full_name")

    results: List[NotificationResponse] = []
    seen_ids = set()

    # Track read status overrides
    read_override_set = set()

    # 1. Stored doctor notifications in notifications collection
    if notifications_col is not None:
        cursor = notifications_col.find({
            "$or": [
                {"doctor_id": doc_id, "recipient_role": "doctor"},
                {"recipient_id": doc_id},
                {"doctor_id": doc_id, "type": "consultation_request"},
            ]
        }).sort("created_at", -1)

        async for doc in cursor:
            nid = doc.get("notification_id") or str(doc.get("_id"))
            if doc.get("is_read"):
                read_override_set.add(nid)
                if doc.get("consultation_id"):
                    read_override_set.add(f"NOTIF-CONS-{doc.get('consultation_id')}")
                if doc.get("prescription_id"):
                    read_override_set.add(f"NOTIF-RX-{doc.get('prescription_id')}")

            if nid not in seen_ids and doc.get("message"):
                seen_ids.add(nid)
                results.append(doc_to_notification_response(doc))

    # 2. Real consultations in consultations collection
    if consultations_col is not None:
        cons_cursor = consultations_col.find({
            "$or": [
                {"doctor_id": doc_id},
                {"doctor_name": doc_name},
                {"status": "requested"},
            ]
        }).sort("created_at", -1).limit(20)

        async for cons in cons_cursor:
            cons_id = cons.get("consultation_id") or str(cons.get("_id"))
            notif_id = f"NOTIF-CONS-{cons_id}"
            if notif_id in seen_ids or cons_id in seen_ids:
                continue
            seen_ids.add(notif_id)

            status_val = cons.get("status", "requested")
            patient_name = cons.get("patient_name") or f"Patient {cons.get('patient_id')}"
            urgency = cons.get("urgency", "routine")
            reason = cons.get("reason") or "Teleconsultation"
            created_time = cons.get("created_at") or cons.get("date_time") or datetime.now(timezone.utc)

            if status_val == "requested":
                title = f"{urgency.capitalize()} Consultation Requested" if urgency in ["urgent", "emergency"] else "New Consultation Request"
                msg = f"{patient_name} requested a consultation: '{reason}'."
                notif_type = "alert" if urgency in ["urgent", "emergency"] else "consultation"
                is_read_flag = notif_id in read_override_set
            elif status_val == "completed":
                title = "Consultation Completed"
                diag = cons.get("diagnosis") or reason
                msg = f"Consultation {cons_id} for {patient_name} completed with diagnosis: '{diag}'."
                notif_type = "prescription"
                is_read_flag = True
            else:
                title = f"Consultation {status_val.capitalize()}"
                msg = f"Consultation with {patient_name} is currently {status_val}."
                notif_type = "consultation"
                is_read_flag = True

            results.append(NotificationResponse(
                id=str(cons.get("_id")),
                notification_id=notif_id,
                patient_id=cons.get("patient_id"),
                patient_name=patient_name,
                consultation_id=cons_id,
                doctor_id=doc_id,
                doctor_name=doc_name,
                title=title,
                message=msg,
                type=notif_type,
                is_read=is_read_flag,
                created_at=created_time,
            ))

    # 3. Real digital prescriptions in prescriptions collection
    if prescriptions_col is not None:
        rx_cursor = prescriptions_col.find({
            "$or": [
                {"doctor_id": doc_id},
                {"doctor_name": doc_name},
            ]
        }).sort("created_at", -1).limit(15)

        async for rx in rx_cursor:
            rx_id = rx.get("prescription_id") or str(rx.get("_id"))
            notif_id = f"NOTIF-RX-{rx_id}"
            if notif_id in seen_ids or rx_id in seen_ids:
                continue
            seen_ids.add(notif_id)

            p_name = rx.get("patient_name") or f"Patient {rx.get('patient_id')}"
            diagnosis = rx.get("diagnosis") or "Clinical Assessment"
            med_count = len(rx.get("medicines") or [])
            med_text = f"{med_count} formulation{'s' if med_count != 1 else ''}"
            created_time = rx.get("created_at") or rx.get("date") or datetime.now(timezone.utc)

            results.append(NotificationResponse(
                id=str(rx.get("_id")),
                notification_id=notif_id,
                patient_id=rx.get("patient_id"),
                patient_name=p_name,
                prescription_id=rx_id,
                doctor_id=doc_id,
                doctor_name=doc_name,
                title="Prescription Issued",
                message=f"Prescription {rx_id} issued for {p_name} ({med_text}) - {diagnosis}.",
                type="prescription",
                is_read=True,
                created_at=created_time,
            ))

    # 4. Severe symptoms submitted in symptoms collection
    if symptoms_col is not None:
        sym_cursor = symptoms_col.find({
            "$or": [
                {"severity": {"$in": ["Severe", "severe", "High", "high"]}},
                {"urgency": {"$in": ["urgent", "emergency"]}},
            ]
        }).sort("created_at", -1).limit(10)

        async for sym in sym_cursor:
            sym_id = sym.get("symptom_id") or str(sym.get("_id"))
            notif_id = f"NOTIF-SYM-{sym_id}"
            if notif_id in seen_ids:
                continue
            seen_ids.add(notif_id)

            p_name = sym.get("patient_name") or f"Patient {sym.get('patient_id')}"
            sym_desc = sym.get("symptom_description") or sym.get("primary_symptom") or "Acute symptoms"
            created_time = sym.get("created_at") or sym.get("date") or datetime.now(timezone.utc)

            results.append(NotificationResponse(
                id=str(sym.get("_id")),
                notification_id=notif_id,
                patient_id=sym.get("patient_id"),
                patient_name=p_name,
                doctor_id=doc_id,
                doctor_name=doc_name,
                title="High-Risk Assessment Flagged",
                message=f"{p_name}'s symptom check flagged severe: '{sym_desc}'. Immediate review recommended.",
                type="alert",
                is_read=notif_id in read_override_set,
                created_at=created_time,
            ))

    # Sort all chronologically descending
    results.sort(key=lambda x: x.created_at, reverse=True)
    return results


async def mark_doctor_notification_read(notification_id: str, doctor_id: str) -> bool:
    """Mark a doctor notification as read."""
    notifications_col = get_collection(COLLECTION_NOTIFICATIONS)
    if notifications_col is None:
        return True

    res = await notifications_col.update_one(
        {"$or": [{"notification_id": notification_id}, {"_id": notification_id}]},
        {"$set": {"is_read": True, "updated_at": datetime.now(timezone.utc)}},
    )
    if res.matched_count == 0:
        await notifications_col.update_one(
            {"notification_id": notification_id, "doctor_id": doctor_id},
            {
                "$set": {
                    "notification_id": notification_id,
                    "doctor_id": doctor_id,
                    "recipient_role": "doctor",
                    "is_read": True,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )
    return True


async def mark_all_doctor_notifications_read(doctor_id: str) -> bool:
    """Mark all notifications for this doctor as read."""
    notifications_col = get_collection(COLLECTION_NOTIFICATIONS)
    if notifications_col is not None:
        await notifications_col.update_many(
            {"$or": [{"doctor_id": doctor_id}, {"recipient_id": doctor_id}]},
            {"$set": {"is_read": True, "updated_at": datetime.now(timezone.utc)}},
        )
    return True


async def mark_notification_read(notification_id: str, patient_id: str) -> bool:
    """Mark a patient notification as read."""
    notifications_col = get_collection(COLLECTION_NOTIFICATIONS)
    if notifications_col is None:
        return False

    res = await notifications_col.update_one(
        {"$or": [{"notification_id": notification_id}, {"_id": notification_id}], "patient_id": patient_id},
        {"$set": {"is_read": True, "updated_at": datetime.now(timezone.utc)}},
    )
    return res.modified_count > 0
