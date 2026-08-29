from typing import List
from fastapi import APIRouter, Depends, status
from schemas.prescription import (
    PrescriptionCreateRequest,
    PrescriptionResponse,
)
from services.security import (
    get_current_doctor,
    get_current_patient,
    get_current_asha_worker,
)
from services.prescription_service import (
    create_prescription,
    get_patient_prescriptions,
    get_asha_patient_prescriptions,
    get_doctor_created_prescriptions,
    get_patient_prescriptions_for_doctor,
)

router = APIRouter(tags=["Digital Prescriptions"])


# ==========================================
# 1. Doctor Endpoints (Create & View)
# ==========================================

@router.post(
    "/doctor/prescriptions",
    response_model=PrescriptionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create digital prescription (Doctor only)",
    description="Allows an authenticated Doctor to issue a new digital prescription for a patient with medicines, dosages, frequencies, duration, instructions, and diagnosis.",
)
async def doctor_create_prescription(
    prescription_data: PrescriptionCreateRequest,
    current_doctor: dict = Depends(get_current_doctor),
):
    return await create_prescription(prescription_data, current_doctor)


@router.get(
    "/doctor/prescriptions",
    response_model=List[PrescriptionResponse],
    summary="View issued prescriptions (Doctor only)",
    description="Retrieves all prescriptions created and issued by the authenticated doctor.",
)
async def doctor_get_my_prescriptions(
    current_doctor: dict = Depends(get_current_doctor),
):
    return await get_doctor_created_prescriptions(current_doctor)


@router.get(
    "/doctor/patients/{patient_id}/prescriptions",
    response_model=List[PrescriptionResponse],
    summary="View prescriptions for a specific patient (Doctor only)",
    description="Retrieves all digital prescriptions issued for the specified patient.",
)
async def doctor_get_patient_prescriptions(
    patient_id: str,
    current_doctor: dict = Depends(get_current_doctor),
):
    return await get_patient_prescriptions_for_doctor(patient_id, current_doctor)



# Generic alias for doctor create
@router.post(
    "/prescriptions",
    response_model=PrescriptionResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
async def create_prescription_alias(
    prescription_data: PrescriptionCreateRequest,
    current_doctor: dict = Depends(get_current_doctor),
):
    return await create_prescription(prescription_data, current_doctor)


# ==========================================
# 2. Patient Endpoints (Retrieve Own)
# ==========================================

@router.get(
    "/patient/prescriptions",
    response_model=List[PrescriptionResponse],
    summary="Retrieve own prescriptions (Patient only)",
    description="Allows an authenticated Patient to retrieve all digital prescriptions issued to them, sorted newest first.",
)
async def patient_get_prescriptions(
    current_patient: dict = Depends(get_current_patient),
):
    return await get_patient_prescriptions(current_patient)


# ==========================================
# 3. ASHA Worker Endpoints (Retrieve for Assigned Patient)
# ==========================================

@router.get(
    "/asha/patients/{patient_id}/prescriptions",
    response_model=List[PrescriptionResponse],
    summary="Retrieve patient prescriptions (ASHA Worker only)",
    description="Allows an authorized ASHA worker to view prescriptions for a patient in their assigned village or directly assigned to them. Returns 403 Forbidden for unauthorized villages.",
)
async def asha_get_patient_prescriptions(
    patient_id: str,
    current_asha: dict = Depends(get_current_asha_worker),
):
    return await get_asha_patient_prescriptions(patient_id, current_asha)
