from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from schemas.symptom_analysis import (
    SymptomAnalysisRequest,
    SymptomAnalysisResponse,
)
from services.symptom_analysis_service import evaluate_symptom_triage
from services.security import decode_access_token

router = APIRouter(tags=["AI Symptom Checker & Clinical Triage"])

optional_security_bearer = HTTPBearer(auto_error=False)


async def get_auth_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security_bearer),
) -> Optional[Dict[str, Any]]:
    """Extract authenticated user payload if Bearer token is provided."""
    if not credentials or not credentials.credentials:
        return None
    return decode_access_token(credentials.credentials)


@router.post(
    "/asha/analyze-symptoms",
    response_model=SymptomAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Analyze symptoms and generate preliminary clinical triage (ASHA Worker)",
    description="Processes patient symptoms, scans for emergency red flags, integrates patient medical history if patient_id is provided, and returns structured triage risk level, clinical summary, recommended actions, and safe supportive care in the requested language (EN/HI/MR).",
)
async def asha_analyze_symptoms(
    request: SymptomAnalysisRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_auth_user_optional),
):
    return await evaluate_symptom_triage(request, current_user=current_user)


@router.post(
    "/asha/patients/{patient_id}/analyze-symptoms",
    response_model=SymptomAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Analyze symptoms for a specific registered patient (ASHA Worker)",
    description="Convenience endpoint to analyze symptoms with the target patient_id specified in the URL route.",
)
async def asha_analyze_patient_symptoms(
    patient_id: str,
    request: SymptomAnalysisRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_auth_user_optional),
):
    request.patient_id = patient_id
    return await evaluate_symptom_triage(request, current_user=current_user)


@router.post(
    "/symptoms/analyze",
    response_model=SymptomAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="General symptom triage and risk assessment endpoint",
    description="Universal endpoint for clinical symptom triage and risk evaluation.",
)
async def general_analyze_symptoms(
    request: SymptomAnalysisRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_auth_user_optional),
):
    return await evaluate_symptom_triage(request, current_user=current_user)
