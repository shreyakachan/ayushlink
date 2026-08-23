from typing import List
from fastapi import APIRouter, Depends, status
from schemas.patient import (
    PatientRegisterRequest,
    PatientLoginRequest,
    PatientResponse,
    PatientAuthResponse,
)
from services.patient_service import (
    register_patient,
    login_patient,
    list_patients_for_user,
)
from services.security import (
    get_current_user_payload,
    get_current_asha_worker,
    get_current_patient,
    get_current_doctor,
)

router = APIRouter(tags=["Patient Management & Authentication"])


@router.post(
    "/patient/register",
    response_model=PatientAuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new patient",
    description="Registers a new patient with validated demographic details and phone number, hashes the password with bcrypt, stores the record in MongoDB, and returns a signed JWT access token.",
)
async def register(patient_data: PatientRegisterRequest):
    return await register_patient(patient_data)


@router.post(
    "/patient/login",
    response_model=PatientAuthResponse,
    status_code=status.HTTP_200_OK,
    summary="Patient login",
    description="Authenticates a patient by their registered 10-digit mobile number and password/PIN, returning a signed JWT access token.",
)
async def login(credentials: PatientLoginRequest):
    return await login_patient(credentials)


@router.post(
    "/patients/{patient_id}/assign-asha",
    summary="Assign patient to ASHA worker",
    description="Sets asha_worker_id on the patient MongoDB document.",
)
async def assign_patient_to_asha_endpoint(
    patient_id: str,
    payload: dict = None,
):
    from services.asha_service import assign_patient_to_asha_worker
    worker_id = payload.get("worker_id") if payload and isinstance(payload, dict) else None
    return await assign_patient_to_asha_worker(patient_id, current_asha=None, target_worker_id=worker_id)


@router.get(
    "/patients",
    response_model=List[PatientResponse],
    summary="List patients",
    description="Retrieves a list of patients relevant to the caller's role (ASHA sees assigned village patients, Doctor sees all patients, Patient sees own record).",
)
async def list_patients(payload: dict = Depends(get_current_user_payload)):
    role = payload.get("role")
    if role == "asha":
        user_doc = await get_current_asha_worker(payload)
    elif role == "doctor":
        user_doc = await get_current_doctor(payload)
    elif role == "patient":
        user_doc = await get_current_patient(payload)
    else:
        user_doc = payload
    return await list_patients_for_user(user_doc)


@router.get(
    "/asha/patients",
    response_model=List[PatientResponse],
    include_in_schema=False,
)
async def list_asha_patients(current_asha: dict = Depends(get_current_asha_worker)):
    return await list_patients_for_user(current_asha)


# Convenient plural aliases
@router.post(
    "/patients/register",
    response_model=PatientAuthResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
async def register_alias(patient_data: PatientRegisterRequest):
    return await register_patient(patient_data)


@router.post(
    "/patients/login",
    response_model=PatientAuthResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
async def login_alias(credentials: PatientLoginRequest):
    return await login_patient(credentials)
