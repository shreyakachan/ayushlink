from typing import List, Dict, Any
from fastapi import APIRouter, Depends, status
from schemas.medical_record import (
    MedicalRecordUpdateRequest,
    SymptomSubmitRequest,
    SymptomResponse,
    PatientMedicalRecordResponse,
)
from services.security import (
    get_current_patient,
    get_current_asha_worker,
    get_current_user_payload,
)
from services.medical_service import (
    update_patient_medical_info,
    submit_patient_symptom,
    get_patient_medical_record,
    get_patient_symptoms_list,
)

router = APIRouter(tags=["Patient Medical Records & Symptoms"])


# ==========================================
# 1. Patient Self-Service Endpoints
# ==========================================

@router.get(
    "/patient/medical-record",
    response_model=PatientMedicalRecordResponse,
    summary="Get own medical record (Patient)",
    description="Retrieves the authenticated patient's medical profile, demographics, allergies, chronic conditions, and recent symptom submissions.",
)
async def get_my_medical_record(
    current_patient: dict = Depends(get_current_patient),
):
    pid = current_patient.get("patient_id") or str(current_patient["_id"])
    return await get_patient_medical_record(pid, current_patient)


@router.put(
    "/patient/medical-record",
    response_model=PatientMedicalRecordResponse,
    summary="Update own medical record (Patient)",
    description="Updates the authenticated patient's basic medical info (blood group, allergies, chronic conditions, emergency contacts, medical history, etc.).",
)
async def update_my_medical_record(
    update_data: MedicalRecordUpdateRequest,
    current_patient: dict = Depends(get_current_patient),
):
    pid = current_patient.get("patient_id") or str(current_patient["_id"])
    return await update_patient_medical_info(pid, update_data, current_patient)


@router.post(
    "/patient/symptoms",
    response_model=SymptomResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit patient symptoms (Patient)",
    description="Allows an authenticated patient to submit their current symptoms, severity, and description.",
)
async def submit_my_symptoms(
    symptom_data: SymptomSubmitRequest,
    current_patient: dict = Depends(get_current_patient),
):
    return await submit_patient_symptom(symptom_data, current_patient)


@router.get(
    "/patient/symptoms",
    response_model=List[SymptomResponse],
    summary="Get own submitted symptoms (Patient)",
    description="Returns the list of all recorded symptoms for the authenticated patient.",
)
async def get_my_symptoms(
    current_patient: dict = Depends(get_current_patient),
):
    pid = current_patient.get("patient_id") or str(current_patient["_id"])
    return await get_patient_symptoms_list(pid, current_patient)


# ==========================================
# 2. ASHA Worker Access Endpoints (Role-Based)
# ==========================================

@router.get(
    "/asha/patients/{patient_id}/records",
    response_model=PatientMedicalRecordResponse,
    summary="Get patient record (ASHA Worker)",
    description="Allows an authorized ASHA worker to view a patient's medical records if the patient is assigned to the worker or resides in their assigned village. Returns 403 Forbidden otherwise.",
)
async def asha_get_patient_record(
    patient_id: str,
    current_asha: dict = Depends(get_current_asha_worker),
):
    return await get_patient_medical_record(patient_id, current_asha)


@router.put(
    "/asha/patients/{patient_id}/records",
    response_model=PatientMedicalRecordResponse,
    summary="Update patient medical record (ASHA Worker)",
    description="Allows an authorized ASHA worker to update a patient's medical records if assigned to them or their village.",
)
async def asha_update_patient_record(
    patient_id: str,
    update_data: MedicalRecordUpdateRequest,
    current_asha: dict = Depends(get_current_asha_worker),
):
    return await update_patient_medical_info(patient_id, update_data, current_asha)


@router.post(
    "/asha/patients/{patient_id}/symptoms",
    response_model=SymptomResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit symptoms on behalf of patient (ASHA Worker)",
    description="Allows an authorized ASHA worker to submit symptoms on behalf of a patient in their assigned area.",
)
async def asha_submit_patient_symptoms(
    patient_id: str,
    symptom_data: SymptomSubmitRequest,
    current_asha: dict = Depends(get_current_asha_worker),
):
    return await submit_patient_symptom(symptom_data, current_asha, target_patient_identifier=patient_id)
