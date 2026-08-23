import random
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId
from fastapi import HTTPException, status
from database import (
    get_collection,
    COLLECTION_CONSULTATIONS,
    COLLECTION_PATIENTS,
    COLLECTION_DOCTORS,
)
from schemas.consultation import (
    ConsultationCreateRequest,
    ConsultationDecisionRequest,
    ConsultationStatusUpdateRequest,
    ConsultationResponse,
)
from services.medical_service import (
    find_patient_by_id_or_pid,
    check_asha_patient_access,
)


def doc_to_consultation_response(doc: dict) -> ConsultationResponse:
    """Helper to convert MongoDB consultation document to clean ConsultationResponse."""
    return ConsultationResponse(
        id=str(doc.get("_id")),
        consultation_id=doc.get("consultation_id", f"CONS-{random.randint(1000, 9999)}"),
        patient_id=doc.get("patient_id", ""),
        patient_name=doc.get("patient_name"),
        patient_village=doc.get("patient_village"),
        doctor_id=doc.get("doctor_id"),
        doctor_name=doc.get("doctor_name"),
        date_time=doc.get("date_time", datetime.now(timezone.utc)),
        status=doc.get("status", "requested"),
        urgency=doc.get("urgency", "routine"),
        reason=doc.get("reason"),
        symptoms=doc.get("symptoms", []),
        notes=doc.get("notes"),
        requested_by=doc.get("requested_by", "patient"),
        call_session=doc.get("call_session", {"room_id": None, "session_status": "idle"}),
        created_at=doc.get("created_at"),
        updated_at=doc.get("updated_at"),
    )


async def find_consultation_by_id(identifier: str) -> Optional[dict]:
    """Find a consultation by consultation_id (e.g. CONS-1042) or MongoDB _id."""
    collection = get_collection(COLLECTION_CONSULTATIONS)
    if collection is None:
        return None

    query = {"consultation_id": identifier}
    if ObjectId.is_valid(identifier):
        query = {"$or": [{"consultation_id": identifier}, {"_id": ObjectId(identifier)}]}
    return await collection.find_one(query)


async def create_consultation_request(
    data: ConsultationCreateRequest,
    current_user: dict,
) -> ConsultationResponse:
    """Create a new consultation request (Patient or ASHA worker)."""
    user_role = current_user.get("role") or ("patient" if "patient_id" in current_user else "asha" if "worker_id" in current_user else None)

    if user_role == "patient":
        patient_doc = current_user
        target_pid = current_user.get("patient_id") or str(current_user.get("_id"))
    elif user_role == "asha":
        if not data.patient_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="patient_id is required when creating a consultation request as an ASHA worker.",
            )
        patient_doc = await find_patient_by_id_or_pid(data.patient_id)
        if not patient_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Patient '{data.patient_id}' not found.",
            )
        if not check_asha_patient_access(current_user, patient_doc):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: ASHA Worker is not authorized for patient village '{patient_doc.get('village')}'.",
            )
        target_pid = patient_doc.get("patient_id") or str(patient_doc.get("_id"))
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized role to create consultation requests.",
        )

    # Doctor lookup if specified
    doctor_name = None
    if data.doctor_id:
        doctors_col = get_collection(COLLECTION_DOCTORS)
        if doctors_col is not None:
            doc_record = await doctors_col.find_one({"$or": [{"doctor_id": data.doctor_id}, {"_id": ObjectId(data.doctor_id) if ObjectId.is_valid(data.doctor_id) else None}]})
            if doc_record:
                doctor_name = doc_record.get("full_name")

    consultations_col = get_collection(COLLECTION_CONSULTATIONS)
    patients_col = get_collection(COLLECTION_PATIENTS)

    if consultations_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    cons_num = random.randint(1000, 9999)
    consultation_id = f"CONS-{cons_num}"
    now = datetime.now(timezone.utc)

    # Video-call ready data structure
    room_id = f"room_{consultation_id.lower()}"
    call_session = {
        "room_id": room_id,
        "session_status": "idle",
        "meeting_link": f"/teleconsultation/{consultation_id}",
    }

    cons_doc = {
        "consultation_id": consultation_id,
        "patient_id": target_pid,
        "patient_name": patient_doc.get("full_name"),
        "patient_village": patient_doc.get("village"),
        "doctor_id": data.doctor_id,
        "doctor_name": doctor_name,
        "date_time": data.preferred_time or now,
        "status": "requested",
        "urgency": data.urgency,
        "reason": data.reason.strip(),
        "symptoms": data.symptoms or ([patient_doc.get("condition")] if patient_doc.get("condition") else []),
        "notes": data.notes,
        "requested_by": user_role,
        "call_session": call_session,
        "created_at": now,
        "updated_at": now,
    }

    insert_result = await consultations_col.insert_one(cons_doc)
    cons_doc["_id"] = insert_result.inserted_id

    # Update patient status in consultation queue
    if patients_col is not None:
        queue_status = "urgent" if data.urgency in ["urgent", "emergency"] else "waiting"
        await patients_col.update_one(
            {"_id": patient_doc["_id"]},
            {"$set": {"status": queue_status, "updated_at": now}},
        )

    return doc_to_consultation_response(cons_doc)


async def doctor_decide_consultation(
    consultation_identifier: str,
    decision: ConsultationDecisionRequest,
    current_doctor: dict,
) -> ConsultationResponse:
    """Accept or reject a consultation request (Doctor only)."""
    cons_doc = await find_consultation_by_id(consultation_identifier)
    if not cons_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Consultation '{consultation_identifier}' not found.",
        )

    action = decision.action.strip().lower()
    if action not in ["accept", "reject"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Action must be 'accept' or 'reject'.",
        )

    consultations_col = get_collection(COLLECTION_CONSULTATIONS)
    patients_col = get_collection(COLLECTION_PATIENTS)
    now = datetime.now(timezone.utc)

    doc_id = current_doctor.get("doctor_id", str(current_doctor.get("_id")))
    doc_name = current_doctor.get("full_name")

    if action == "accept":
        new_status = "accepted"
        set_update = {
            "status": new_status,
            "doctor_id": doc_id,
            "doctor_name": doc_name,
            "notes": decision.notes or cons_doc.get("notes"),
            "call_session.session_status": "ready",
            "updated_at": now,
        }
        # Update patient status
        if patients_col is not None:
            await patients_col.update_one(
                {"patient_id": cons_doc["patient_id"]},
                {"$set": {"assigned_doctor_id": doc_id, "status": "review", "updated_at": now}},
            )
    else:  # reject
        new_status = "rejected"
        set_update = {
            "status": new_status,
            "notes": decision.notes or "Consultation request declined by physician.",
            "call_session.session_status": "ended",
            "updated_at": now,
        }

    await consultations_col.update_one({"_id": cons_doc["_id"]}, {"$set": set_update})
    updated_doc = await consultations_col.find_one({"_id": cons_doc["_id"]})
    return doc_to_consultation_response(updated_doc)


async def update_consultation_status(
    consultation_identifier: str,
    status_data: ConsultationStatusUpdateRequest,
    current_user: dict,
) -> ConsultationResponse:
    """Update consultation status (e.g. in_progress, completed, cancelled)."""
    cons_doc = await find_consultation_by_id(consultation_identifier)
    if not cons_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Consultation '{consultation_identifier}' not found.",
        )

    valid_statuses = ["requested", "accepted", "rejected", "in_progress", "completed", "cancelled"]
    new_status = status_data.status.strip().lower()
    if new_status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{new_status}'. Allowed: {valid_statuses}",
        )

    consultations_col = get_collection(COLLECTION_CONSULTATIONS)
    doctors_col = get_collection(COLLECTION_DOCTORS)
    patients_col = get_collection(COLLECTION_PATIENTS)
    now = datetime.now(timezone.utc)

    # Sync session state
    session_status = "idle"
    if new_status == "accepted":
        session_status = "ready"
    elif new_status == "in_progress":
        session_status = "active"
    elif new_status in ["completed", "cancelled", "rejected"]:
        session_status = "ended"

    set_update = {
        "status": new_status,
        "call_session.session_status": session_status,
        "updated_at": now,
    }
    if status_data.notes:
        set_update["notes"] = status_data.notes

    await consultations_col.update_one({"_id": cons_doc["_id"]}, {"$set": set_update})

    # If completed, update doctor consultations counter and patient status
    if new_status == "completed":
        if doctors_col is not None and cons_doc.get("doctor_id"):
            await doctors_col.update_one(
                {"doctor_id": cons_doc["doctor_id"]},
                {"$inc": {"stats.consultations_completed": 1}},
            )
        if patients_col is not None:
            await patients_col.update_one(
                {"patient_id": cons_doc["patient_id"]},
                {"$set": {"status": "stable", "updated_at": now}},
            )

    updated_doc = await consultations_col.find_one({"_id": cons_doc["_id"]})
    return doc_to_consultation_response(updated_doc)


async def get_consultations_history(current_user: dict) -> List[ConsultationResponse]:
    """Retrieve consultation history based on caller's role (Patient, Doctor, or ASHA)."""
    consultations_col = get_collection(COLLECTION_CONSULTATIONS)
    if consultations_col is None:
        return []

    user_role = current_user.get("role") or ("patient" if "patient_id" in current_user else "doctor" if "doctor_id" in current_user else "asha")

    if user_role == "patient":
        pid = current_user.get("patient_id") or str(current_user.get("_id"))
        cursor = consultations_col.find({"patient_id": pid}).sort("date_time", -1)
    elif user_role == "doctor":
        doc_id = current_doctor_id = current_user.get("doctor_id")
        cursor = consultations_col.find({
            "$or": [
                {"doctor_id": doc_id},
                {"doctor_id": None},
                {"status": "requested"},
            ]
        }).sort("date_time", -1)
    elif user_role == "asha":
        assigned_villages = current_user.get("assigned_villages", [])
        cursor = consultations_col.find({
            "patient_village": {"$in": assigned_villages}
        }).sort("date_time", -1)
    else:
        cursor = consultations_col.find().sort("date_time", -1)

    results: List[ConsultationResponse] = []
    async for doc in cursor:
        results.append(doc_to_consultation_response(doc))
    return results
