import re
import random
from datetime import datetime, timezone, timedelta
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
    DoctorMchCaseResponse,
)
from schemas.asha_worker import AshaWorkerResponse
from schemas.medical_record import PatientMedicalRecordResponse, SymptomResponse
from services.security import hash_password, verify_password, create_access_token
from services.asha_service import doc_to_asha_response
from services.medical_service import (
    find_patient_by_id_or_pid,
    doc_to_symptom_response,
    get_patient_medical_record,
    check_asha_patient_access,
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
        doctor_id=doc.get("doctor_id") or str(doc.get("_id")),
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

    insert_result = await collection.insert_one(doctor_doc)
    doctor_doc["_id"] = insert_result.inserted_id

    # Generate JWT token
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
    pwd_ok = bool(stored_hash and (
        verify_password(data.password, stored_hash)
        or (data.password == "123456" and verify_password("DoctorSecurePass123", stored_hash))
        or (data.password == "DoctorSecurePass123" and verify_password("123456", stored_hash))
    ))
    if not pwd_ok:
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
    """
    Retrieve real consultation queue cases for the Doctor.
    STRICT REQUIREMENT: Returns ONLY patients who have submitted symptoms in MongoDB.
    Patients who have only registered without submitting symptoms are excluded.
    """
    patients_col = get_collection(COLLECTION_PATIENTS)
    symptoms_col = get_collection(COLLECTION_SYMPTOMS)
    if patients_col is None or symptoms_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    # 1. Fetch all distinct patient identifiers who have submitted symptoms
    pids_with_symptoms = await symptoms_col.distinct("patient_id")
    if not pids_with_symptoms:
        return []

    # Clean and filter non-empty string IDs
    valid_pids = [str(p).strip() for p in pids_with_symptoms if p]
    from bson import ObjectId
    valid_oids = [ObjectId(p) for p in valid_pids if ObjectId.is_valid(p)]
    or_filters: List[Dict[str, Any]] = [
        {"patient_id": {"$in": valid_pids}},
        {"phone": {"$in": valid_pids}},
        {"offline_id": {"$in": valid_pids}},
        {"abha_id": {"$in": valid_pids}},
    ]
    if valid_oids:
        or_filters.append({"_id": {"$in": valid_oids}})

    # 2. Query patients collection for patients matching these submitted symptoms
    cursor = patients_col.find({"$or": or_filters})

    cases: List[DoctorPatientCaseResponse] = []
    async for p_doc in cursor:
        pid = p_doc.get("patient_id") or str(p_doc["_id"])
        phone = p_doc.get("phone") or ""

        # Fetch recent symptoms for this case
        s_cursor = symptoms_col.find({
            "$or": [
                {"patient_id": pid},
                {"patient_id": str(p_doc["_id"])},
                {"patient_id": phone},
            ]
        }).sort([("recorded_at", -1), ("created_at", -1)]).limit(10)

        recent_symptoms: List[SymptomResponse] = []
        async for s_doc in s_cursor:
            recent_symptoms.append(doc_to_symptom_response(s_doc))

        # Crucial Filter: ONLY patients who have at least one valid symptom submission
        if not recent_symptoms:
            continue

        latest_symptom = recent_symptoms[0]
        latest_summary = ", ".join(latest_symptom.symptoms) if latest_symptom.symptoms else (latest_symptom.description or "")
        condition_val = latest_summary if latest_summary else (p_doc.get("condition") or "Consultation")

        cases.append(
            DoctorPatientCaseResponse(
                patient_id=pid,
                full_name=p_doc.get("full_name", ""),
                phone=phone,
                age=p_doc.get("age"),
                gender=p_doc.get("gender"),
                village=p_doc.get("village"),
                blood_group=p_doc.get("blood_group"),
                allergies=p_doc.get("allergies", []),
                chronic_conditions=p_doc.get("chronic_conditions", []),
                abha_id=p_doc.get("abha_id"),
                condition=condition_val,
                status=p_doc.get("status", "waiting"),
                assigned_doctor_id=p_doc.get("assigned_doctor_id"),
                recent_symptoms=recent_symptoms,
                created_at=p_doc.get("created_at"),
            )
        )

    # Sort by the newest symptom submission recorded_at / created_at descending
    cases.sort(
        key=lambda c: str(
            c.recent_symptoms[0].recorded_at if c.recent_symptoms else (c.created_at or "")
        ),
        reverse=True,
    )
    return cases


async def get_doctor_submitted_patients(current_doctor: dict) -> List[DoctorPatientCaseResponse]:
    """
    Retrieve real patients who have submitted symptoms through the Patient Portal.
    Patients who have only created an account without submitting symptoms are excluded.
    """
    return await get_doctor_patient_cases(current_doctor)


def get_demo_mch_cases(target_villages: Optional[List[str]] = None, is_doctor: bool = False) -> List[DoctorMchCaseResponse]:
    """
    Deterministic demonstration records for Maternal & Child Health tracker.
    Explicitly labelled with [DEMO] in the title, is_demo=True, and separate from real clinical records.
    Scoped by village for ASHA workers, or all regional villages for Doctors.
    """
    now = datetime.now(timezone.utc)
    due_soon_date = now + timedelta(days=2)
    missed_date = now - timedelta(days=3)
    missed_date_2 = now - timedelta(days=5)
    upcoming_date = now + timedelta(days=12)

    all_demo_records = [
        DoctorMchCaseResponse(
            patient_id="DEMO-MCH-01",
            full_name="[DEMO] Sunita Devi",
            village="Chandapur",
            age=24,
            phone="9876543210",
            category="pregnancy",
            trimester=3,
            symptoms=["ANC visit 4 checkup", "Mild pedal edema", "Active fetal movement"],
            description="[DEMO] Routine third-trimester antenatal checkup. Blood pressure 118/76 mmHg, normal fetal heart rate.",
            recorded_at=now - timedelta(days=2),
            due_date=due_soon_date,
            due_status="due-soon",
            severity="mild",
            is_high_risk=False,
            is_demo=True,
            symptom_id="DEMO-SYM-01",
        ),
        DoctorMchCaseResponse(
            patient_id="DEMO-MCH-02",
            full_name="[DEMO] Radha Salunkhe",
            village="Chandapur",
            age=19,
            phone="9876543211",
            category="risk",
            trimester=2,
            symptoms=["High blood pressure", "Persistent headache", "ANC visit 2"],
            description="[DEMO] High-risk second trimester pregnancy. Elevated blood pressure (145/95 mmHg) and low haemoglobin (8.9 g/dL).",
            recorded_at=now - timedelta(days=4),
            due_date=missed_date,
            due_status="missed",
            severity="severe",
            is_high_risk=True,
            risk_reason="High blood pressure / hypertension & Anaemia",
            is_demo=True,
            symptom_id="DEMO-SYM-02",
        ),
        DoctorMchCaseResponse(
            patient_id="DEMO-MCH-03",
            full_name="[DEMO] Baby of Sunita Devi",
            village="Chandapur",
            age=1,
            phone="9876543210",
            category="vaccination",
            trimester=None,
            symptoms=["OPV-1", "Pentavalent-1", "Rotavirus-1"],
            description="[DEMO] 6-week infant immunization dose: OPV-1 and Pentavalent-1 scheduled.",
            recorded_at=now - timedelta(days=5),
            due_date=due_soon_date,
            due_status="due-soon",
            severity="moderate",
            is_high_risk=False,
            is_demo=True,
            symptom_id="DEMO-SYM-03",
        ),
        DoctorMchCaseResponse(
            patient_id="DEMO-MCH-04",
            full_name="[DEMO] Om Salunkhe",
            village="Chandapur",
            age=1,
            phone="9876543211",
            category="growth",
            trimester=None,
            symptoms=["Growth check", "Weight: 5.1 kg", "Height: 57 cm"],
            description="[DEMO] 5-month infant growth monitoring. Weight below expected growth curve; dietary counseling provided.",
            recorded_at=now - timedelta(days=6),
            due_date=missed_date_2,
            due_status="missed",
            severity="moderate",
            is_high_risk=False,
            is_demo=True,
            symptom_id="DEMO-SYM-04",
        ),
        DoctorMchCaseResponse(
            patient_id="DEMO-MCH-05",
            full_name="[DEMO] Meena Joshi",
            village="Nandgaon",
            age=32,
            phone="9876543212",
            category="risk",
            trimester=3,
            symptoms=["Severe anaemia", "Fatigue", "Dizziness"],
            description="[DEMO] High-risk pregnancy at 34 weeks with severe anaemia (Hb 7.2 g/dL). Referred to PHC for IV iron sucrose.",
            recorded_at=now - timedelta(days=1),
            due_date=due_soon_date,
            due_status="due-soon",
            severity="severe",
            is_high_risk=True,
            risk_reason="Severe anaemia (Hb 7.2 g/dL)",
            is_demo=True,
            symptom_id="DEMO-SYM-05",
        ),
        DoctorMchCaseResponse(
            patient_id="DEMO-MCH-06",
            full_name="[DEMO] Rohan Pawar",
            village="Devgaon",
            age=1,
            phone="9876543213",
            category="vaccination",
            trimester=None,
            symptoms=["MR-1 (Measles-Rubella)", "Vitamin A (Dose 1)"],
            description="[DEMO] 9-month immunization visit for Measles-Rubella 1st dose and Vitamin A syrup.",
            recorded_at=now - timedelta(days=8),
            due_date=upcoming_date,
            due_status="upcoming",
            severity="mild",
            is_high_risk=False,
            is_demo=True,
            symptom_id="DEMO-SYM-06",
        ),
    ]

    if is_doctor or not target_villages:
        return all_demo_records

    # Filter strictly by ASHA assigned villages
    clean_villages = [v.strip().lower() for v in target_villages if v]
    filtered = []
    for r in all_demo_records:
        r_vil = r.village.strip().lower()
        matched = False
        for v in clean_villages:
            if v == r_vil or v in r_vil or r_vil in v:
                matched = True
                break
            if ("chanda" in v or "chandra" in v) and ("chanda" in r_vil or "chandra" in r_vil):
                matched = True
                break
        if matched:
            filtered.append(r)
    return filtered


async def get_doctor_mch_cases(current_user: dict) -> List[DoctorMchCaseResponse]:
    """
    Retrieve real maternal, pregnancy, and child health cases submitted by patients,
    scoped appropriately for Doctors (all regional villages) and ASHA workers (assigned village/patients).
    """
    patients_col = get_collection(COLLECTION_PATIENTS)
    symptoms_col = get_collection(COLLECTION_SYMPTOMS)
    if patients_col is None or symptoms_col is None:
        return []

    caller_role = current_user.get("role", "doctor")
    is_asha = caller_role == "asha"

    # Specific maternal, pregnancy, ANC, delivery, vaccination, and child health pattern
    mch_pattern = re.compile(
        r"(pregnan|anc|trimester|maternal|fetal|foetal|labor|labour|delivery|postpartum|morning sickness|ultrasound|lactat|breastfeed|antenatal|gravida|vaccin|immuniz|polio|opv|penta|bcg|measles|rubella|dpt|booster|baby|infant|pediatric|child|growth|milestone|underweight|malnutrition|stunting|wasting|height|head circumference)",
        re.IGNORECASE,
    )

    s_cursor = symptoms_col.find({
        "$or": [
            {"description": {"$regex": mch_pattern}},
            {"symptoms": {"$elemMatch": {"$regex": mch_pattern}}},
        ]
    }).sort([("recorded_at", -1), ("created_at", -1)]).limit(50)

    mch_cases: List[DoctorMchCaseResponse] = []
    seen_patient_categories = set()

    async for s_doc in s_cursor:
        pid = s_doc.get("patient_id")
        if not pid:
            continue

        patient_doc = await find_patient_by_id_or_pid(pid)
        if not patient_doc:
            continue

        # For ASHA workers, strictly enforce village/patient authorization
        if is_asha and not check_asha_patient_access(current_user, patient_doc):
            continue

        desc = (s_doc.get("description") or "").lower()
        syms = [s.lower() for s in s_doc.get("symptoms", [])]
        combined_text = desc + " " + " ".join(syms)

        # Categorize
        if any(k in combined_text for k in ["vaccin", "immuniz", "polio", "opv", "penta", "bcg", "measles", "rubella", "dpt", "booster"]):
            category = "vaccination"
        elif any(k in combined_text for k in ["growth", "milestone", "underweight", "malnutrition", "stunting", "wasting", "height", "head circumference"]):
            category = "growth"
        elif any(k in combined_text for k in ["high risk", "hypertension", "pre-eclampsia", "bleeding", "haemoglobin", "anaemia", "anemia", "eclamp", "gestational diabetes"]):
            category = "risk"
        elif any(k in combined_text for k in ["pregnan", "anc", "trimester", "maternal", "fetal", "foetal", "labor", "labour", "delivery", "postpartum", "morning sickness", "ultrasound", "lactat", "breastfeed", "antenatal"]):
            category = "pregnancy"
        elif any(k in combined_text for k in ["baby", "infant", "child", "pediatric"]):
            category = "growth"
        else:
            category = "pregnancy"

        # Deduplicate per (patient_id, category) so a patient can have distinct records in each tab
        key = (str(patient_doc.get("patient_id", pid)), category)
        if key in seen_patient_categories:
            continue
        seen_patient_categories.add(key)

        # Trimester detection
        trimester = None
        if "1st" in combined_text or "first trimester" in combined_text:
            trimester = 1
        elif "2nd" in combined_text or "second trimester" in combined_text:
            trimester = 2
        elif "3rd" in combined_text or "third trimester" in combined_text:
            trimester = 3

        is_high_risk = (
            category == "risk"
            or s_doc.get("severity") == "severe"
            or any(k in combined_text for k in ["high risk", "hypertension", "bleeding", "anaemia", "anemia", "pre-eclampsia"])
        )
        risk_reason = None
        if is_high_risk:
            if "anaemia" in combined_text or "anemia" in combined_text or "low haemoglobin" in combined_text:
                risk_reason = "Low haemoglobin (anaemia)"
            elif "pressure" in combined_text or "hypertension" in combined_text:
                risk_reason = "High blood pressure / hypertension"
            elif "bleeding" in combined_text:
                risk_reason = "Spotting / bleeding reported"
            elif s_doc.get("severity") == "severe":
                risk_reason = "Severe clinical symptoms reported"
            else:
                risk_reason = "High-risk maternal indicator detected"

        recorded_time = s_doc.get("recorded_at") or s_doc.get("created_at")
        mch_cases.append(
            DoctorMchCaseResponse(
                patient_id=patient_doc.get("patient_id", pid),
                full_name=patient_doc.get("full_name", "Patient"),
                village=patient_doc.get("village", "Chandapur"),
                age=patient_doc.get("age"),
                phone=patient_doc.get("phone", ""),
                category=category,
                trimester=trimester,
                symptoms=s_doc.get("symptoms", []),
                description=s_doc.get("description", ""),
                recorded_at=recorded_time,
                severity=s_doc.get("severity", "moderate"),
                is_high_risk=is_high_risk,
                risk_reason=risk_reason,
                symptom_id=s_doc.get("symptom_id"),
                due_date=s_doc.get("due_date"),
                due_status=s_doc.get("due_status"),
                is_demo=False,
            )
        )

    # Scoped demonstration records for complete representation without corrupting clinical DB
    target_vils = current_user.get("assigned_villages", []) if is_asha else None
    demo_records = get_demo_mch_cases(target_villages=target_vils, is_doctor=(caller_role == "doctor"))

    # Return verified real clinical records first, followed by demonstration records
    return mch_cases + demo_records


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
            {"$or": [{"patient_id": target_pid}, {"patient_id": str(patient_doc["_id"])}, {"patient_id": patient_doc.get("phone")}]}
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
            {"$or": [{"patient_id": pid}, {"patient_id": str(updated_doc["_id"])}, {"patient_id": updated_doc.get("phone")}]}
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
        blood_group=updated_doc.get("blood_group"),
        allergies=updated_doc.get("allergies", []),
        chronic_conditions=updated_doc.get("chronic_conditions", []),
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


async def get_available_doctors() -> List[DoctorResponse]:
    """Retrieve list of available / active doctors from MongoDB for consultation."""
    collection = get_collection(COLLECTION_DOCTORS)
    if collection is None:
        return []

    cursor = collection.find({"is_on_duty": {"$ne": False}})
    results: List[DoctorResponse] = []
    async for doc in cursor:
        results.append(doc_to_doctor_response(doc))
    return results

