from typing import List
from fastapi import APIRouter, Depends, status, HTTPException
from schemas.consultation import (
    ConsultationCreateRequest,
    ConsultationDecisionRequest,
    ConsultationStatusUpdateRequest,
    ConsultationResponse,
)
from services.security import (
    get_current_user_payload,
    get_current_doctor,
    get_current_patient,
    get_current_asha_worker,
)
from services.consultation_service import (
    create_consultation_request,
    doctor_decide_consultation,
    update_consultation_status,
    get_consultations_history,
)

router = APIRouter(tags=["Doctor-Patient Consultations"])


# ==========================================
# 1. Consultation Request Creation
# ==========================================

@router.post(
    "/consultations/request",
    response_model=ConsultationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create consultation request (Patient or ASHA)",
    description="Initiates a consultation request with urgency, symptoms, reason, and preps video-call room session state.",
)
async def request_consultation(
    data: ConsultationCreateRequest,
    payload: dict = Depends(get_current_user_payload),
):
    role = payload.get("role")
    if role == "patient":
        user_doc = await get_current_patient(payload)
    elif role == "asha":
        user_doc = await get_current_asha_worker(payload)
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only patients and ASHA workers can create consultation requests.",
        )
    return await create_consultation_request(data, user_doc)


# ==========================================
# 2. Doctor Accept / Reject Decision
# ==========================================

@router.post(
    "/consultations/{consultation_id}/decision",
    response_model=ConsultationResponse,
    summary="Accept or Reject consultation request (Doctor only)",
    description="Allows a Doctor to accept or decline a pending consultation request, assigns doctor ID, and readies the video session.",
)
async def decide_consultation(
    consultation_id: str,
    decision: ConsultationDecisionRequest,
    current_doctor: dict = Depends(get_current_doctor),
):
    return await doctor_decide_consultation(consultation_id, decision, current_doctor)


# ==========================================
# 3. Status Progress Update
# ==========================================

@router.patch(
    "/consultations/{consultation_id}/status",
    response_model=ConsultationResponse,
    summary="Update consultation status (in_progress, completed, cancelled)",
    description="Updates the progress status of a consultation and syncs call session state.",
)
async def update_status(
    consultation_id: str,
    status_data: ConsultationStatusUpdateRequest,
    payload: dict = Depends(get_current_user_payload),
):
    return await update_consultation_status(consultation_id, status_data, payload)


# ==========================================
# 4. Consultation History & Queue Retrieval
# ==========================================

@router.get(
    "/consultations/history",
    response_model=List[ConsultationResponse],
    summary="Retrieve consultation history & queue",
    description="Returns consultation history relevant to the caller's role (Patient sees own, Doctor sees assigned/queue, ASHA sees assigned villages).",
)
async def get_history(
    payload: dict = Depends(get_current_user_payload),
):
    role = payload.get("role")
    if role == "patient":
        user_doc = await get_current_patient(payload)
    elif role == "doctor":
        user_doc = await get_current_doctor(payload)
    elif role == "asha":
        user_doc = await get_current_asha_worker(payload)
    else:
        user_doc = payload
    return await get_consultations_history(user_doc)


@router.get(
    "/consultations",
    response_model=List[ConsultationResponse],
    include_in_schema=False,
)
async def get_history_alias(payload: dict = Depends(get_current_user_payload)):
    return await get_history(payload)
