import random
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId
from fastapi import HTTPException, status
from database import (
    get_collection,
    COLLECTION_PATIENTS,
    COLLECTION_SYMPTOMS,
    COLLECTION_ASHA_WORKERS,
)
from schemas.medical_record import (
    MedicalRecordUpdateRequest,
    SymptomSubmitRequest,
    SymptomResponse,
    PatientMedicalRecordResponse,
)


def doc_to_symptom_response(doc: dict) -> SymptomResponse:
    """Helper to convert MongoDB symptom document to SymptomResponse."""
    return SymptomResponse(
        id=str(doc.get("_id")),
        symptom_id=doc.get("symptom_id", f"SYM-{random.randint(1000, 9999)}"),
        patient_id=doc.get("patient_id", ""),
        symptoms=doc.get("symptoms", []),
        description=doc.get("description", ""),
        recorded_at=doc.get("recorded_at") or doc.get("created_at") or datetime.now(timezone.utc),
        status=doc.get("status", "reported"),
        severity=doc.get("severity") or "moderate",
        duration=doc.get("duration") or "2-3 days",
        submitted_by=doc.get("submitted_by") or "patient",
        offline_id=doc.get("offline_id"),
        created_at=doc.get("created_at"),
    )


async def find_patient_by_id_or_pid(patient_id_or_pid: str) -> Optional[dict]:
    """Find a patient document by either MongoDB _id, patient_id (e.g. P-2041), phone, offline_id, or abha_id."""
    collection = get_collection(COLLECTION_PATIENTS)
    if collection is None or not patient_id_or_pid:
        return None

    pid_str = str(patient_id_or_pid).strip()
    or_clauses: List[Dict[str, Any]] = [
        {"patient_id": pid_str},
        {"phone": pid_str},
        {"offline_id": pid_str},
        {"abha_id": pid_str},
    ]

    if ObjectId.is_valid(pid_str):
        or_clauses.append({"_id": ObjectId(pid_str)})

    return await collection.find_one({"$or": or_clauses})


def check_asha_patient_access(asha_doc: dict, patient_doc: dict) -> bool:
    """
    Verify whether an ASHA worker is authorized to access/modify a patient's record.
    Allowed if:
      1. Patient is explicitly assigned to this ASHA worker (patient.asha_worker_id == asha.worker_id), OR
      2. Patient belongs to one of the ASHA worker's assigned villages or coverage area.
    """
    worker_id = asha_doc.get("worker_id")
    assigned_villages = [v.strip().lower() for v in asha_doc.get("assigned_villages", []) if v]

    # Direct worker assignment
    if patient_doc.get("asha_worker_id") and patient_doc.get("asha_worker_id") == worker_id:
        return True

    # If worker has no village restrictions, permit access
    if not assigned_villages:
        return True

    # Village coverage match
    patient_village = (patient_doc.get("village") or "").strip().lower()
    if not patient_village:
        return True

    for v in assigned_villages:
        if v == patient_village or v in patient_village or patient_village in v:
            return True
        # Handle chandapur <-> chandrapur alias
        if ("chanda" in v or "chandra" in v) and ("chanda" in patient_village or "chandra" in patient_village):
            return True

    # Primary PHC match
    if asha_doc.get("primary_phc") and patient_doc.get("primary_phc"):
        if asha_doc["primary_phc"].strip().lower() == patient_doc["primary_phc"].strip().lower():
            return True

    return False


async def update_patient_medical_info(
    patient_identifier: str,
    update_data: MedicalRecordUpdateRequest,
    current_user: dict,
) -> PatientMedicalRecordResponse:
    """Update a patient's medical information with role-based access control."""
    patient_doc = await find_patient_by_id_or_pid(patient_identifier)
    if not patient_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_identifier}' not found.",
        )

    # Check permissions
    user_role = current_user.get("role") or ("patient" if "patient_id" in current_user else "asha" if "worker_id" in current_user else None)
    if user_role == "patient":
        own_pid = current_user.get("patient_id")
        own_id = str(current_user.get("_id"))
        if patient_doc.get("patient_id") != own_pid and str(patient_doc.get("_id")) != own_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: You cannot modify another patient's records.",
            )
    elif user_role == "asha":
        if not check_asha_patient_access(current_user, patient_doc):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: ASHA Worker '{current_user.get('worker_id')}' is not assigned to village '{patient_doc.get('village')}'.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized role.",
        )

    # Prepare update fields
    set_fields: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
    if update_data.blood_group is not None:
        set_fields["blood_group"] = update_data.blood_group
    if update_data.allergies is not None:
        set_fields["allergies"] = update_data.allergies
    if update_data.chronic_conditions is not None:
        set_fields["chronic_conditions"] = update_data.chronic_conditions
    if update_data.emergency_contacts is not None:
        set_fields["emergency_contacts"] = update_data.emergency_contacts
    if update_data.medical_history is not None:
        set_fields["medical_history"] = update_data.medical_history
    if update_data.condition is not None:
        set_fields["condition"] = update_data.condition
    if update_data.status is not None:
        set_fields["status"] = update_data.status
    if update_data.village is not None:
        set_fields["village"] = update_data.village
    if update_data.age is not None:
        set_fields["age"] = update_data.age

    collection = get_collection(COLLECTION_PATIENTS)
    await collection.update_one({"_id": patient_doc["_id"]}, {"$set": set_fields})

    # Return updated full record
    return await get_patient_medical_record(patient_identifier, current_user)


async def submit_patient_symptom(
    data: SymptomSubmitRequest,
    current_user: dict,
    target_patient_identifier: Optional[str] = None,
) -> SymptomResponse:
    """Submit a symptom record for a patient."""
    user_role = current_user.get("role") or ("patient" if "patient_id" in current_user else "asha" if "worker_id" in current_user else None)

    if user_role == "patient":
        target_pid = current_user.get("patient_id") or str(current_user.get("_id"))
        patient_doc = current_user
    elif user_role == "asha":
        if not target_patient_identifier:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Patient identifier is required when submitting symptoms as an ASHA worker.",
            )
        patient_doc = await find_patient_by_id_or_pid(target_patient_identifier)
        if not patient_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Patient '{target_patient_identifier}' not found.",
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
            detail="Unauthorized role.",
        )

    # Check idempotency if offline_id is provided
    symptoms_collection = get_collection(COLLECTION_SYMPTOMS)
    if symptoms_collection is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    if data.offline_id:
        existing_doc = await symptoms_collection.find_one({"offline_id": data.offline_id})
        if existing_doc:
            return doc_to_symptom_response(existing_doc)

    # Generate unique symptom ID e.g. SYM-1024
    symptom_id = f"SYM-{random.randint(1000, 9999)}"
    now = datetime.now(timezone.utc)
    recorded_at = data.client_created_at or now

    symptom_doc = {
        "symptom_id": symptom_id,
        "patient_id": target_pid,
        "symptoms": data.symptoms,
        "description": data.description.strip(),
        "recorded_at": recorded_at,
        "status": "reported",
        "severity": data.severity,
        "duration": data.duration,
        "submitted_by": user_role,
        "submitted_by_id": current_user.get("worker_id") or current_user.get("patient_id"),
        "notes": data.notes,
        "offline_id": data.offline_id,
        "created_at": now,
        "updated_at": now,
    }

    insert_res = await symptoms_collection.insert_one(symptom_doc)
    symptom_doc["_id"] = insert_res.inserted_id

    # Update patient condition summary & review status
    patients_collection = get_collection(COLLECTION_PATIENTS)
    if patients_collection is not None:
        summary = ", ".join(data.symptoms) if data.symptoms else data.description[:40]
        status_val = "critical" if data.severity == "severe" else "review" if data.severity == "moderate" else "stable"
        await patients_collection.update_one(
            {"_id": patient_doc["_id"]},
            {"$set": {"condition": summary, "status": status_val, "updated_at": now}},
        )

    return doc_to_symptom_response(symptom_doc)


async def get_patient_medical_record(
    patient_identifier: str,
    current_user: dict,
) -> PatientMedicalRecordResponse:
    """Retrieve full medical record profile and recent symptoms for a patient."""
    patient_doc = await find_patient_by_id_or_pid(patient_identifier)
    if not patient_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_identifier}' not found.",
        )

    # Enforce Authorization
    user_role = current_user.get("role") or ("patient" if "patient_id" in current_user else "asha" if "worker_id" in current_user else None)
    if user_role == "patient":
        own_pid = current_user.get("patient_id")
        own_id = str(current_user.get("_id"))
        if patient_doc.get("patient_id") != own_pid and str(patient_doc.get("_id")) != own_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: You cannot view another patient's medical records.",
            )
    elif user_role == "asha":
        if not check_asha_patient_access(current_user, patient_doc):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: ASHA Worker is not authorized for patient village '{patient_doc.get('village')}'.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized role.",
        )

    # Retrieve symptoms history
    symptoms_collection = get_collection(COLLECTION_SYMPTOMS)
    recent_symptoms: List[SymptomResponse] = []
    if symptoms_collection is not None:
        target_pid = patient_doc.get("patient_id") or str(patient_doc["_id"])
        cursor = symptoms_collection.find(
            {"$or": [{"patient_id": target_pid}, {"patient_id": str(patient_doc["_id"])}]}
        ).sort([("created_at", -1), ("recorded_at", -1)]).limit(20)
        async for s_doc in cursor:
            recent_symptoms.append(doc_to_symptom_response(s_doc))

    return PatientMedicalRecordResponse(
        patient_id=patient_doc.get("patient_id", str(patient_doc["_id"])),
        full_name=patient_doc.get("full_name", ""),
        phone=patient_doc.get("phone", ""),
        age=patient_doc.get("age"),
        gender=patient_doc.get("gender"),
        village=patient_doc.get("village"),
        abha_id=patient_doc.get("abha_id"),
        preferred_language=patient_doc.get("preferred_language", "en"),
        blood_group=patient_doc.get("blood_group"),
        allergies=patient_doc.get("allergies", []),
        chronic_conditions=patient_doc.get("chronic_conditions", []),
        condition=patient_doc.get("condition"),
        status=patient_doc.get("status", "stable"),
        asha_worker_id=patient_doc.get("asha_worker_id"),
        emergency_contacts=patient_doc.get("emergency_contacts", []),
        medical_history=patient_doc.get("medical_history", []),
        recent_symptoms=recent_symptoms,
        updated_at=patient_doc.get("updated_at"),
    )


async def get_patient_symptoms_list(
    patient_identifier: str,
    current_user: dict,
) -> List[SymptomResponse]:
    """Retrieve submitted symptoms list for a patient."""
    record = await get_patient_medical_record(patient_identifier, current_user)
    return record.recent_symptoms
