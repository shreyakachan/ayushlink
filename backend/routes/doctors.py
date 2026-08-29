from typing import List
from fastapi import APIRouter, Depends, status
from schemas.doctor import (
    DoctorRegisterRequest,
    DoctorLoginRequest,
    DoctorAuthResponse,
    DoctorPatientCaseResponse,
    DoctorMchCaseResponse,
)
from schemas.asha_worker import AshaWorkerResponse
from schemas.medical_record import PatientMedicalRecordResponse
from services.security import get_current_doctor
from services.doctor_service import (
    register_doctor,
    login_doctor,
    get_doctor_patient_cases,
    get_doctor_submitted_patients,
    get_doctor_mch_cases,
    get_patient_records_for_doctor,
    assign_patient_to_doctor,
    get_asha_workers_for_doctor,
)

router = APIRouter(tags=["Doctor Management & Consultations"])


# ==========================================
# 1. Doctor Authentication Endpoints
# ==========================================

@router.post(
    "/doctor/register",
    response_model=DoctorAuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new Doctor",
    description="Registers a new Doctor with medical credentials, specialization, and facility, hashes the password with bcrypt, stores the record in the 'doctors' collection, and returns a signed JWT access token.",
)
async def register(doctor_data: DoctorRegisterRequest):
    return await register_doctor(doctor_data)


@router.post(
    "/doctor/login",
    response_model=DoctorAuthResponse,
    status_code=status.HTTP_200_OK,
    summary="Doctor login",
    description="Authenticates a Doctor by their registered mobile number and password/PIN, returning a signed JWT access token.",
)
async def login(credentials: DoctorLoginRequest):
    return await login_doctor(credentials)


# ==========================================
# 2. Doctor Consultation & Patient Cases (Protected)
# ==========================================

@router.get(
    "/doctor/cases",
    response_model=List[DoctorPatientCaseResponse],
    summary="View assigned patient cases and consultation queue (Doctor only)",
    description="Allows an authenticated Doctor to view real consultation queue cases with symptom summaries from MongoDB.",
)
async def view_assigned_cases(
    current_doctor: dict = Depends(get_current_doctor),
):
    return await get_doctor_patient_cases(current_doctor)


@router.get(
    "/doctor/patients",
    response_model=List[DoctorPatientCaseResponse],
    summary="View real patients who submitted symptoms (Doctor only)",
    description="Returns only patients who have submitted symptoms through the Patient Portal, excluding accounts without symptoms.",
)
async def view_doctor_patients(
    current_doctor: dict = Depends(get_current_doctor),
):
    return await get_doctor_submitted_patients(current_doctor)


@router.get(
    "/doctor/mch-cases",
    response_model=List[DoctorMchCaseResponse],
    summary="View real maternal and child health submissions (Doctor only)",
    description="Returns real maternal, pregnancy, and pediatric symptom submissions from MongoDB.",
)
async def view_doctor_mch_cases(
    current_doctor: dict = Depends(get_current_doctor),
):
    return await get_doctor_mch_cases(current_doctor)


@router.get(
    "/doctor/patients/{patient_id}/records",
    response_model=PatientMedicalRecordResponse,
    summary="View patient medical history and symptoms (Doctor only)",
    description="Allows an authenticated Doctor to view a patient's complete medical history, vitals, demographics, and all submitted symptoms.",
)
async def view_patient_medical_history(
    patient_id: str,
    current_doctor: dict = Depends(get_current_doctor),
):
    return await get_patient_records_for_doctor(patient_id, current_doctor)


@router.post(
    "/doctor/cases/{patient_id}/assign",
    response_model=DoctorPatientCaseResponse,
    summary="Assign a patient case to the current doctor (Doctor only)",
    description="Assigns an unassigned or waiting patient case to the currently logged-in Doctor.",
)
async def assign_case(
    patient_id: str,
    current_doctor: dict = Depends(get_current_doctor),
):
    return await assign_patient_to_doctor(patient_id, current_doctor)


@router.get(
    "/doctor/asha-workers",
    response_model=List[AshaWorkerResponse],
    summary="View all active ASHA workers (Doctor only)",
    description="Allows an authenticated Doctor to view active ASHA workers in the system with their assigned villages and PHCs.",
)
async def view_asha_workers(
    current_doctor: dict = Depends(get_current_doctor),
):
    return await get_asha_workers_for_doctor(current_doctor)


# Plural aliases
@router.post("/doctors/register", response_model=DoctorAuthResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def register_alias(doctor_data: DoctorRegisterRequest):
    return await register_doctor(doctor_data)


@router.post("/doctors/login", response_model=DoctorAuthResponse, status_code=status.HTTP_200_OK, include_in_schema=False)
async def login_alias(credentials: DoctorLoginRequest):
    return await login_doctor(credentials)


@router.get("/doctors/cases", response_model=List[DoctorPatientCaseResponse], include_in_schema=False)
async def view_cases_alias(current_doctor: dict = Depends(get_current_doctor)):
    return await get_doctor_patient_cases(current_doctor)


@router.get("/doctors/patients", response_model=List[DoctorPatientCaseResponse], include_in_schema=False)
async def view_patients_alias(current_doctor: dict = Depends(get_current_doctor)):
    return await get_doctor_submitted_patients(current_doctor)


@router.get("/doctors/mch-cases", response_model=List[DoctorMchCaseResponse], include_in_schema=False)
async def view_mch_cases_alias(current_doctor: dict = Depends(get_current_doctor)):
    return await get_doctor_mch_cases(current_doctor)


@router.get("/doctors/asha-workers", response_model=List[AshaWorkerResponse], include_in_schema=False)
async def view_asha_workers_alias(current_doctor: dict = Depends(get_current_doctor)):
    return await get_asha_workers_for_doctor(current_doctor)
