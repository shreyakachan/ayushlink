from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class SymptomAnalysisRequest(BaseModel):
    """Schema for submitting symptoms for clinical triage and risk assessment."""
    symptoms: str = Field(..., min_length=2, max_length=3000, description="Symptoms description or comma-separated symptoms list")
    duration: Optional[str] = Field(default="", description="Duration string e.g. '<1d', '1-3d', '4-7d', '1-2w', '>2w', 'today'")
    severity: Optional[str] = Field(default="mild", description="Self-reported severity: 'mild' | 'moderate' | 'severe'")
    language: Optional[str] = Field(default="en", description="Preferred response language: 'en' | 'hi' | 'mr'")
    patient_id: Optional[str] = Field(default=None, description="Optional patient ID e.g. 'P-4559' if assessing a registered patient")
    notes: Optional[str] = Field(default=None, description="Optional context or voice note metadata")
    offline_id: Optional[str] = Field(default=None, description="Optional offline idempotency ID")


class SymptomAnalysisResponse(BaseModel):
    """Schema for the preliminary symptom-triage assessment response."""
    analysis_id: str = Field(..., description="Unique triage assessment identifier e.g. 'TRIAGE-8231'")
    level: str = Field(..., description="Risk level string: 'Low Risk' | 'Medium Risk' | 'High Risk' (localized)")
    severity: str = Field(..., description="Clinical severity level: 'mild' | 'moderate' | 'severe'")
    accent: str = Field(..., description="UI accent color token: 'emerald' | 'amber' | 'red'")
    confidence: int = Field(..., ge=50, le=100, description="Confidence percentage e.g. 85")
    summary: str = Field(..., description="Clinical summary of the symptoms assessment")
    action: str = Field(..., description="Recommended clinical action for the ASHA worker")
    medicines: List[str] = Field(default_factory=list, description="Suggested supportive care and safe OTC measures")
    refer: bool = Field(..., description="Whether referral to Primary Health Centre (PHC) is recommended")
    emergency: bool = Field(..., description="Whether urgent emergency escalation is recommended")
    urgent_care_guidance: Optional[str] = Field(default=None, description="Urgent medical advice for emergency or critical cases")
    disclaimer: str = Field(..., description="Medical disclaimer stating results are preliminary triage guidance")
    patient_id: Optional[str] = Field(default=None, description="Associated patient ID if provided")
    patient_name: Optional[str] = Field(default=None, description="Associated patient name if found")
    village: Optional[str] = Field(default=None, description="Associated patient village if found")
    engine: str = Field(default="rule_based_clinical_triage", description="Triage engine used: 'rule_based_clinical_triage' or external AI")
    external_ai_configured: bool = Field(default=False, description="Whether an external AI model / API key was used")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Assessment timestamp")
