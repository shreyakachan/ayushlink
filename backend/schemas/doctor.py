import re
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, field_validator
from schemas.medical_record import SymptomResponse


def normalize_phone(value: str) -> str:
    """Normalize phone number to 10 digits, stripping +91, 0 prefix, spaces, dashes."""
    digits = re.sub(r"\D", "", str(value))
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    elif len(digits) > 10:
        digits = digits[-10:]
    if len(digits) != 10:
        raise ValueError("Phone number must be a valid 10-digit mobile number.")
    return digits


class DoctorRegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100, description="Doctor full name with title, e.g. Dr. Anjali Rao")
    phone: str = Field(..., description="10-digit mobile number")
    password: str = Field(default="123456", min_length=4, max_length=128, description="Password or PIN")
    email: Optional[str] = Field(default=None, description="Doctor email address")
    specialization: str = Field(default="General Physician", description="e.g. General Physician, Pediatrics, OB/GYN")
    qualification: Optional[str] = Field(default="MBBS", description="e.g. MBBS, MD, MS")
    registration_number: Optional[str] = Field(default=None, description="Medical Council Registration ID e.g. MCI-2024-8812")
    assigned_facility: Optional[str] = Field(default="District Hospital", description="Assigned Hospital / PHC name")
    preferred_language: str = Field(default="en", description="Preferred language (en, hi, mr)")
    is_on_duty: bool = Field(default=True, description="On-duty status")

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return normalize_phone(v)


class DoctorLoginRequest(BaseModel):
    phone: str = Field(..., description="10-digit mobile number")
    password: str = Field(..., min_length=1, description="Password or PIN")

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return normalize_phone(v)


class DoctorResponse(BaseModel):
    id: str
    doctor_id: str
    full_name: str
    phone: str
    email: Optional[str] = None
    specialization: str = "General Physician"
    qualification: Optional[str] = None
    registration_number: Optional[str] = None
    assigned_facility: Optional[str] = None
    preferred_language: str = "en"
    is_on_duty: bool = True
    stats: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None


class DoctorAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    doctor: DoctorResponse
    message: str = "Authentication successful"


class DoctorPatientCaseResponse(BaseModel):
    """Schema representing a real patient with submitted symptoms in the Doctor's queue / patient list."""
    patient_id: str
    full_name: str
    phone: str
    age: Optional[int] = None
    gender: Optional[str] = None
    village: Optional[str] = None
    blood_group: Optional[str] = None
    allergies: List[str] = []
    chronic_conditions: List[str] = []
    abha_id: Optional[str] = None
    condition: Optional[str] = None
    status: str = "waiting"
    assigned_doctor_id: Optional[str] = None
    recent_symptoms: List[SymptomResponse] = []
    created_at: Optional[datetime] = None


class DoctorMchCaseResponse(BaseModel):
    """Schema representing a real patient with maternal / pregnancy / child health submissions."""
    patient_id: str
    full_name: str
    village: str = "Chandapur"
    age: Optional[int] = None
    phone: str = ""
    category: str = "pregnancy"  # pregnancy | vaccination | growth | risk
    trimester: Optional[int] = None
    symptoms: List[str] = []
    description: str = ""
    recorded_at: Optional[datetime] = None
    severity: str = "moderate"
    is_high_risk: bool = False
    risk_reason: Optional[str] = None
