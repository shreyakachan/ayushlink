import re
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, field_validator


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


class PatientRegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100, description="Patient full name")
    phone: str = Field(..., description="10-digit mobile number")
    password: str = Field(default="123456", min_length=4, max_length=128, description="Password or 4-6 digit PIN")
    age: int = Field(..., ge=1, le=125, description="Patient age")
    gender: str = Field(..., description="Gender: male, female, other")
    village: str = Field(..., min_length=2, max_length=100, description="Village or Area")
    preferred_language: str = Field(default="en", description="Preferred language (en, hi, mr)")
    abha_id: Optional[str] = Field(default=None, description="Optional 14-digit ABHA ID")
    blood_group: Optional[str] = Field(default=None, description="Optional blood group")
    allergies: List[str] = Field(default_factory=list)
    chronic_conditions: List[str] = Field(default_factory=list)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return normalize_phone(v)

    @field_validator("gender")
    @classmethod
    def validate_gender(cls, v: str) -> str:
        v_lower = str(v).strip().lower()
        if v_lower not in ["male", "female", "other"]:
            if "m" in v_lower and "f" not in v_lower:
                return "male"
            elif "f" in v_lower:
                return "female"
            return "other"
        return v_lower

    @field_validator("abha_id")
    @classmethod
    def validate_abha_id(cls, v: Optional[str]) -> Optional[str]:
        if not v or not str(v).strip():
            return None
        clean = re.sub(r"\D", "", str(v))
        if not clean:
            return None
        if len(clean) != 14:
            raise ValueError("ABHA ID must be exactly 14 digits.")
        return f"{clean[0:2]}-{clean[2:6]}-{clean[6:10]}-{clean[10:14]}"


class PatientLoginRequest(BaseModel):
    phone: str = Field(..., description="10-digit mobile number")
    password: str = Field(..., min_length=1, description="Password, PIN, or OTP")

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return normalize_phone(v)


class PatientResponse(BaseModel):
    id: str
    patient_id: str
    full_name: str
    phone: str
    age: Optional[int] = None
    gender: Optional[str] = None
    village: Optional[str] = None
    abha_id: Optional[str] = None
    preferred_language: str = "en"
    condition: Optional[str] = None
    status: Optional[str] = "stable"
    blood_group: Optional[str] = None
    allergies: List[str] = []
    chronic_conditions: List[str] = []
    created_at: Optional[datetime] = None


class PatientAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    patient: PatientResponse
    message: str = "Authentication successful"
