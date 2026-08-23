from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, status
from schemas.asha_worker import (
    AshaRegisterRequest,
    AshaLoginRequest,
    AshaAuthResponse,
)
from services.asha_service import (
    register_asha_worker,
    login_asha_worker,
    get_asha_cases_for_worker,
    assign_patient_to_asha_worker,
)
from services.security import get_current_asha_worker

router = APIRouter(tags=["ASHA Worker Management & Authentication"])


@router.get(
    "/asha/cases",
    response_model=List[Dict[str, Any]],
    summary="Get patient cases and latest submissions for ASHA Worker",
    description="Returns list of all assigned village patient cases with their latest submitted symptoms, urgency, and consultation status.",
)
async def get_cases(current_asha: dict = Depends(get_current_asha_worker)):
    return await get_asha_cases_for_worker(current_asha)


@router.post(
    "/asha/patients/{patient_id}/assign",
    summary="Assign patient to ASHA worker",
    description="Explicitly assigns a patient to the authenticated ASHA worker or specified worker_id, storing asha_worker_id on the patient MongoDB document.",
)
async def assign_patient(
    patient_id: str,
    body: Optional[Dict[str, Any]] = None,
    current_asha: dict = Depends(get_current_asha_worker),
):
    target_worker_id = body.get("worker_id") if body and isinstance(body, dict) else None
    return await assign_patient_to_asha_worker(patient_id, current_asha=current_asha, target_worker_id=target_worker_id)


@router.post(
    "/asha/register",
    response_model=AshaAuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new ASHA worker",
    description="Registers a new ASHA worker with assigned villages and PHC, hashes password with bcrypt, stores the record in the MongoDB 'asha_workers' collection, and returns a signed JWT access token.",
)
async def register(worker_data: AshaRegisterRequest):
    return await register_asha_worker(worker_data)


@router.post(
    "/asha/login",
    response_model=AshaAuthResponse,
    status_code=status.HTTP_200_OK,
    summary="ASHA worker login",
    description="Authenticates an ASHA worker by their registered 10-digit mobile number and password/PIN, returning a signed JWT access token.",
)
async def login(credentials: AshaLoginRequest):
    return await login_asha_worker(credentials)


# Aliases for flexibility
@router.post(
    "/asha-workers/register",
    response_model=AshaAuthResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
async def register_alias(worker_data: AshaRegisterRequest):
    return await register_asha_worker(worker_data)


@router.post(
    "/asha-workers/login",
    response_model=AshaAuthResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
async def login_alias(credentials: AshaLoginRequest):
    return await login_asha_worker(credentials)
