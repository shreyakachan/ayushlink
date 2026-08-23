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


class AshaRegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100, description="ASHA Worker full name")
    phone: str = Field(..., description="10-digit mobile number")
    password: str = Field(default="123456", min_length=4, max_length=128, description="Password or 4-6 digit PIN")
    email: Optional[str] = Field(default=None, description="Optional email address")
    assigned_villages: List[str] = Field(default_factory=list, description="List of assigned villages")
    primary_phc: Optional[str] = Field(default=None, description="Assigned Primary Health Centre (PHC)")
    preferred_language: str = Field(default="en", description="Preferred language (en, hi, mr)")

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return normalize_phone(v)


class AshaLoginRequest(BaseModel):
    phone: str = Field(..., description="10-digit mobile number")
    password: str = Field(..., min_length=1, description="Password or PIN")

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return normalize_phone(v)


class AshaWorkerResponse(BaseModel):
    id: str
    worker_id: str
    full_name: str
    phone: str
    email: Optional[str] = None
    assigned_villages: List[str] = []
    primary_phc: Optional[str] = None
    preferred_language: str = "en"
    is_active: bool = True
    stats: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None


class AshaAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    asha_worker: AshaWorkerResponse
    message: str = "Authentication successful"
