from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class MedicalRecordUpdateRequest(BaseModel):
    """Schema for creating or updating a patient's medical information."""
    blood_group: Optional[str] = Field(default=None, description="e.g. A+, B+, O+, AB-")
    allergies: Optional[List[str]] = Field(default=None, description="List of known allergies e.g. ['Penicillin']")
    chronic_conditions: Optional[List[str]] = Field(default=None, description="List of chronic conditions e.g. ['Diabetes']")
    emergency_contacts: Optional[List[Dict[str, Any]]] = Field(default=None, description="Emergency contact details")
    medical_history: Optional[List[Dict[str, Any]]] = Field(default=None, description="Past medical history / visits")
    condition: Optional[str] = Field(default=None, description="Current primary condition e.g. 'Viral fever'")
    status: Optional[str] = Field(default=None, description="Patient status: 'stable' | 'review' | 'critical'")
    village: Optional[str] = Field(default=None, description="Village or Area")
    age: Optional[int] = Field(default=None, ge=1, le=125, description="Patient age")


class SymptomSubmitRequest(BaseModel):
    """Schema for submitting patient symptoms."""
    symptoms: List[str] = Field(default_factory=list, description="List of symptom tags, e.g. ['Fever', 'Cough']")
    description: str = Field(..., min_length=2, max_length=2000, description="Description of symptoms")
    severity: str = Field(default="moderate", description="mild | moderate | severe")
    duration: str = Field(default="today", description="today | 2-3-days | week | more-than-week")
    notes: Optional[str] = Field(default=None, description="Optional notes or context")
    offline_id: Optional[str] = Field(default=None, description="Client-generated offline UUID for idempotency")
    client_created_at: Optional[datetime] = Field(default=None, description="Original timestamp when recorded offline")


class SymptomResponse(BaseModel):
    """Schema for returning a symptom record."""
    id: str
    symptom_id: str
    patient_id: str
    symptoms: List[str] = []
    description: str
    recorded_at: datetime
    status: str
    severity: Optional[str] = None
    duration: Optional[str] = None
    submitted_by: Optional[str] = None
    offline_id: Optional[str] = None
    created_at: Optional[datetime] = None


class PatientMedicalRecordResponse(BaseModel):
    """Complete medical record profile response for a patient."""
    patient_id: str
    full_name: str
    phone: str
    age: Optional[int] = None
    gender: Optional[str] = None
    village: Optional[str] = None
    abha_id: Optional[str] = None
    preferred_language: str = "en"
    blood_group: Optional[str] = None
    allergies: List[str] = []
    chronic_conditions: List[str] = []
    condition: Optional[str] = None
    status: Optional[str] = "stable"
    asha_worker_id: Optional[str] = None
    emergency_contacts: List[Dict[str, Any]] = []
    medical_history: List[Dict[str, Any]] = []
    recent_symptoms: List[SymptomResponse] = []
    updated_at: Optional[datetime] = None
