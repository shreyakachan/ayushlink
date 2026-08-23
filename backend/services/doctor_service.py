import random
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import HTTPException, status
from database import (
    get_collection,
    COLLECTION_DOCTORS,
    COLLECTION_PATIENTS,
    COLLECTION_SYMPTOMS,
    COLLECTION_ASHA_WORKERS,
)
from schemas.doctor import (
    DoctorRegisterRequest,
    DoctorLoginRequest,
    DoctorResponse,
    DoctorAuthResponse,
    DoctorPatientCaseResponse,
)
from schemas.asha_worker import AshaWorkerResponse
from schemas.medical_record import PatientMedicalRecordResponse, SymptomResponse
from services.security import hash_password, verify_password, create_access_token
from services.asha_service import doc_to_asha_response
from services.medical_service import (
    find_patient_by_id_or_pid,
    doc_to_symptom_response,
    get_patient_medical_record,
)


def doc_to_doctor_response(doc: dict) -> DoctorResponse:
    """Helper to convert MongoDB document to clean DoctorResponse."""
    default_stats = {
        "consultations_completed": 0,
        "active_cases": 0,
        "prescriptions_signed": 0,
    }
    return DoctorResponse(
        id=str(doc.get("_id")),
        doctor_id=doc.get("doctor_id", f"DOC-{random.randint(100, 999)}"),
        full_name=doc.get("full_name", ""),
        phone=doc.get("phone", ""),
        email=doc.get("email"),
        specialization=doc.get("specialization", "General Physician"),
        qualification=doc.get("qualification", "MBBS"),
        registration_number=doc.get("registration_number"),
        assigned_facility=doc.get("assigned_facility"),
        preferred_language=doc.get("preferred_language", "en"),
        is_on_duty=doc.get("is_on_duty", True),
        stats=doc.get("stats", default_stats),
        created_at=doc.get("created_at"),
    )


async def register_doctor(data: DoctorRegisterRequest) -> DoctorAuthResponse:
    """Register a new Doctor, hash password, insert into MongoDB, return JWT token."""
    collection = get_collection(COLLECTION_DOCTORS)
    if collection is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is not available.",
        )

    # Check if phone already registered
    existing = await collection.find_one({"phone": data.phone})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Doctor with mobile number +91 {data.phone} is already registered.",
        )

    # Generate unique human-readable ID e.g. DOC-501
    random_num = random.randint(100, 999)
    doctor_id = f"DOC-{random_num}"

    # Hash the password
    pwd_hash = hash_password(data.password)

    now = datetime.now(timezone.utc)
    stats = {
        "consultations_completed": 0,
        "active_cases": 0,
        "prescriptions_signed": 0,
    }

    doctor_doc = {
        "doctor_id": doctor_id,
        "full_name": data.full_name.strip(),
        "phone": data.phone,
        "hashed_password": pwd_hash,
        "email": data.email.strip() if data.email else None,
        "specialization": data.specialization.strip(),
        "qualification": data.qualification.strip() if data.qualification else "MBBS",
        "registration_number": data.registration_number.strip() if data.registration_number else None,
        "assigned_facility": data.assigned_facility.strip() if data.assigned_facility else "District Hospital",
        "preferred_language": data.preferred_language,
        "is_on_duty": data.is_on_duty,
        "stats": stats,
        "created_at": now,
        "updated_at": now,
    }

    # Insert into MongoDB
    insert_result = await collection.insert_one(doctor_doc)
    doctor_doc["_id"] = insert_result.inserted_id

    # Generate JWT token with role="doctor"
    token_data = {
        "sub": doctor_id,
        "role": "doctor",
        "phone": data.phone,
        "name": data.full_name.strip(),
    }
    access_token = create_access_token(token_data)

    doc_res = doc_to_doctor_response(doctor_doc)
    return DoctorAuthResponse(
        access_token=access_token,
        token_type="bearer",
        doctor=doc_res,
        message="Doctor registered successfully",
    )


async def login_doctor(data: DoctorLoginRequest) -> DoctorAuthResponse:
    """Authenticate Doctor by phone and password/PIN, return JWT token."""
    collection = get_collection(COLLECTION_DOCTORS)
    if collection is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is not available.",
        )

    # Find doctor by phone or doctor_id
    doctor_doc = await collection.find_one({
        "$or": [
            {"phone": data.phone},
            {"phone": f"+91 {data.phone}"},
            {"phone": f"+91{data.phone}"},
            {"doctor_id": data.phone},
        ]
    })
    if not doctor_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No doctor account found with this mobile number.",
        )

    # Verify password against hashed_password
    stored_hash = doctor_doc.get("hashed_password")
    if not stored_hash or not verify_password(data.password, stored_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password or PIN. Please verify your details and try again.",
        )

    # Generate JWT token
    doctor_id = doctor_doc.get("doctor_id", str(doctor_doc["_id"]))
    token_data = {
        "sub": doctor_id,
        "role": "doctor",
        "phone": doctor_doc.get("phone"),
        "name": doctor_doc.get("full_name"),
    }
    access_token = create_access_token(token_data)

    doc_res = doc_to_doctor_response(doctor_doc)
    return DoctorAuthResponse(
        access_token=access_token,
        token_type="bearer",
        doctor=doc_res,
        message="Login successful",
    )


async def get_doctor_patient_cases(current_doctor: dict) -> List[DoctorPatientCaseResponse]:
    """Retrieve patient cases assigned to the doctor or pending in the consultation queue."""
    patients_col = get_collection(COLLECTION_PATIENTS)
    symptoms_col = get_collection(COLLECTION_SYMPTOMS)
    if patients_col is None or symptoms_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    doc_id = current_doctor.get("doctor_id")

    # Match patients assigned to this doctor or active in queue
    cursor = patients_col.find({
        "$or": [
            {"assigned_doctor_id": doc_id},
            {"assigned_doctor_id": None},
            {"status": {"$in": ["waiting", "urgent", "review", "stable", "critical"]}},
        ]
    }).sort("updated_at", -1).limit(50)

    cases: List[DoctorPatientCaseResponse] = []
    async for p_doc in cursor:
        pid = p_doc.get("patient_id") or str(p_doc["_id"])

        # Fetch recent symptoms for this case
        s_cursor = symptoms_col.find({"patient_id": pid}).sort("recorded_at", -1).limit(5)
        recent_symptoms: List[SymptomResponse] = []
        async for s_doc in s_cursor:
            recent_symptoms.append(doc_to_symptom_response(s_doc))

        cases.append(
            DoctorPatientCaseResponse(
                patient_id=pid,
                full_name=p_doc.get("full_name", ""),
                phone=p_doc.get("phone", ""),
                age=p_doc.get("age"),
                gender=p_doc.get("gender"),
                village=p_doc.get("village"),
                abha_id=p_doc.get("abha_id"),
                condition=p_doc.get("condition"),
                status=p_doc.get("status", "waiting"),
                assigned_doctor_id=p_doc.get("assigned_doctor_id"),
                recent_symptoms=recent_symptoms,
                created_at=p_doc.get("created_at"),
            )
        )

    return cases


async def get_patient_records_for_doctor(
    patient_identifier: str,
    current_doctor: dict,
) -> PatientMedicalRecordResponse:
    """Allow an authenticated doctor to view a patient's complete medical history and submitted symptoms."""
    patient_doc = await find_patient_by_id_or_pid(patient_identifier)
    if not patient_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_identifier}' not found.",
        )

    # Retrieve all symptoms history
    symptoms_col = get_collection(COLLECTION_SYMPTOMS)
    recent_symptoms: List[SymptomResponse] = []
    if symptoms_col is not None:
        target_pid = patient_doc.get("patient_id") or str(patient_doc["_id"])
        cursor = symptoms_col.find(
            {"$or": [{"patient_id": target_pid}, {"patient_id": str(patient_doc["_id"])}]}
        ).sort([("created_at", -1), ("recorded_at", -1)]).limit(50)
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
        emergency_contacts=patient_doc.get("emergency_contacts", []),
        medical_history=patient_doc.get("medical_history", []),
        recent_symptoms=recent_symptoms,
        updated_at=patient_doc.get("updated_at"),
    )


async def assign_patient_to_doctor(
    patient_identifier: str,
    current_doctor: dict,
) -> DoctorPatientCaseResponse:
    """Assign a patient case to the authenticated doctor."""
    patients_col = get_collection(COLLECTION_PATIENTS)
    patient_doc = await find_patient_by_id_or_pid(patient_identifier)
    if not patient_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_identifier}' not found.",
        )

    doc_id = current_doctor.get("doctor_id")
    now = datetime.now(timezone.utc)
    await patients_col.update_one(
        {"_id": patient_doc["_id"]},
        {"$set": {"assigned_doctor_id": doc_id, "status": "review", "updated_at": now}},
    )

    # Return updated case
    updated_doc = await patients_col.find_one({"_id": patient_doc["_id"]})
    pid = updated_doc.get("patient_id", str(updated_doc["_id"]))

    symptoms_col = get_collection(COLLECTION_SYMPTOMS)
    recent_symptoms: List[SymptomResponse] = []
    if symptoms_col is not None:
        cursor = symptoms_col.find(
            {"$or": [{"patient_id": pid}, {"patient_id": str(updated_doc["_id"])}]}
        ).sort([("created_at", -1), ("recorded_at", -1)]).limit(5)
        async for s_doc in cursor:
            recent_symptoms.append(doc_to_symptom_response(s_doc))

    return DoctorPatientCaseResponse(
        patient_id=pid,
        full_name=updated_doc.get("full_name", ""),
        phone=updated_doc.get("phone", ""),
        age=updated_doc.get("age"),
        gender=updated_doc.get("gender"),
        village=updated_doc.get("village"),
        abha_id=updated_doc.get("abha_id"),
        condition=updated_doc.get("condition"),
        status=updated_doc.get("status", "review"),
        assigned_doctor_id=doc_id,
        recent_symptoms=recent_symptoms,
        created_at=updated_doc.get("created_at"),
    )


async def get_asha_workers_for_doctor(current_doctor: dict) -> List[AshaWorkerResponse]:
    """Retrieve list of all active ASHA workers in MongoDB for authenticated doctors."""
    collection = get_collection(COLLECTION_ASHA_WORKERS)
    if collection is None:
        return []

    cursor = collection.find({}).sort("created_at", -1)
    results: List[AshaWorkerResponse] = []
    async for doc in cursor:
        results.append(doc_to_asha_response(doc))
    return results

