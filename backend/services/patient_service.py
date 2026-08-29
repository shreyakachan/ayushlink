import random
from datetime import datetime, timezone
from fastapi import HTTPException, status
from database import get_collection, COLLECTION_PATIENTS
from schemas.patient import (
    PatientRegisterRequest,
    PatientLoginRequest,
    PatientResponse,
    PatientAuthResponse,
)
from services.security import hash_password, verify_password, create_access_token


def doc_to_patient_response(doc: dict) -> PatientResponse:
    """Helper to convert MongoDB document to clean PatientResponse."""
    return PatientResponse(
        id=str(doc.get("_id")),
        patient_id=doc.get("patient_id") or str(doc.get("_id")),
        full_name=doc.get("full_name", ""),
        phone=doc.get("phone", ""),
        age=doc.get("age"),
        gender=doc.get("gender"),
        village=doc.get("village"),
        abha_id=doc.get("abha_id"),
        preferred_language=doc.get("preferred_language", "en"),
        condition=doc.get("condition"),
        status=doc.get("status", "stable"),
        blood_group=doc.get("blood_group"),
        allergies=doc.get("allergies", []),
        chronic_conditions=doc.get("chronic_conditions", []),
        created_at=doc.get("created_at"),
    )


async def register_patient(data: PatientRegisterRequest) -> PatientAuthResponse:
    """Register a new patient, hash password, insert into MongoDB, return JWT token."""
    collection = get_collection(COLLECTION_PATIENTS)
    if collection is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is not available.",
        )

    # Check if patient phone number already exists
    existing = await collection.find_one({"phone": data.phone})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Patient with mobile number +91 {data.phone} is already registered.",
        )

    # Generate a unique human-friendly patient ID like P-2041
    random_num = random.randint(1000, 9999)
    patient_id = f"P-{random_num}"

    # Hash the password
    pwd_hash = hash_password(data.password)

    # Build the document
    now = datetime.now(timezone.utc)
    patient_doc = {
        "patient_id": patient_id,
        "full_name": data.full_name.strip(),
        "phone": data.phone,
        "hashed_password": pwd_hash,
        "age": data.age,
        "gender": data.gender,
        "village": data.village.strip(),
        "preferred_language": data.preferred_language,
        "abha_id": data.abha_id,
        "blood_group": data.blood_group,
        "condition": None,
        "status": "stable",
        "allergies": data.allergies,
        "chronic_conditions": data.chronic_conditions,
        "created_at": now,
        "updated_at": now,
    }

    # Insert into MongoDB
    insert_result = await collection.insert_one(patient_doc)
    patient_doc["_id"] = insert_result.inserted_id

    # Generate JWT token
    token_data = {
        "sub": patient_id,
        "role": "patient",
        "phone": data.phone,
        "name": data.full_name.strip(),
    }
    access_token = create_access_token(token_data)

    patient_res = doc_to_patient_response(patient_doc)
    return PatientAuthResponse(
        access_token=access_token,
        token_type="bearer",
        patient=patient_res,
        message="Patient registered successfully",
    )


async def login_patient(data: PatientLoginRequest) -> PatientAuthResponse:
    """Authenticate patient by phone and password/PIN/OTP, return JWT token."""
    collection = get_collection(COLLECTION_PATIENTS)
    if collection is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is not available.",
        )

    # Find patient by phone or patient_id
    patient_doc = await collection.find_one({
        "$or": [
            {"phone": data.phone},
            {"phone": f"+91 {data.phone}"},
            {"phone": f"+91{data.phone}"},
            {"patient_id": data.phone},
        ]
    })
    if not patient_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No patient account found with this mobile number.",
        )

    # Verify password against hashed_password
    stored_hash = patient_doc.get("hashed_password")
    if not stored_hash or not verify_password(data.password, stored_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password or PIN. Please verify your details and try again.",
        )

    # Generate JWT token
    patient_id = patient_doc.get("patient_id", str(patient_doc["_id"]))
    token_data = {
        "sub": patient_id,
        "role": "patient",
        "phone": patient_doc.get("phone"),
        "name": patient_doc.get("full_name"),
    }
    access_token = create_access_token(token_data)

    patient_res = doc_to_patient_response(patient_doc)
    return PatientAuthResponse(
        access_token=access_token,
        token_type="bearer",
        patient=patient_res,
        message="Login successful",
    )


async def list_patients_for_user(current_user: dict) -> list[PatientResponse]:
    """Retrieve list of patients for ASHA workers, Doctors, or Patients."""
    collection = get_collection(COLLECTION_PATIENTS)
    if collection is None:
        return []

    user_role = current_user.get("role") or ("patient" if "patient_id" in current_user else "asha")

    if user_role == "patient":
        pid = current_user.get("patient_id") or str(current_user.get("_id"))
        cursor = collection.find({"$or": [{"patient_id": pid}, {"phone": current_user.get("phone")}]})
    elif user_role == "asha":
        assigned_villages = current_user.get("assigned_villages", [])
        worker_id = current_user.get("worker_id")
        query: dict = {}
        if assigned_villages:
            village_queries = []
            for v in assigned_villages:
                v_clean = v.strip()
                if not v_clean:
                    continue
                if "chanda" in v_clean.lower():
                    village_queries.append({"village": {"$regex": r"chand[r]?apur", "$options": "i"}})
                else:
                    village_queries.append({"village": {"$regex": f"^{v_clean}$", "$options": "i"}})
            if worker_id:
                query = {"$or": [{"asha_worker_id": worker_id}] + village_queries}
            else:
                query = {"$or": village_queries} if village_queries else {}
        elif worker_id:
            query = {"asha_worker_id": worker_id}
        cursor = collection.find(query).sort("created_at", -1)
    else:
        # Doctor sees all patients
        cursor = collection.find().sort("created_at", -1)

    results = []
    async for doc in cursor:
        results.append(doc_to_patient_response(doc))
    return results

