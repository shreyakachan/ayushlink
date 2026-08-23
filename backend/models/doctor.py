from typing import Optional, List, Dict, Any
from pydantic import Field
from models.base import MongoBaseModel


class Doctor(MongoBaseModel):
    """
    MongoDB model representing a doctor in AyushLink.
    """
    doctor_id: Optional[str] = Field(default=None, description="Human-readable ID e.g. DOC-501")
    full_name: str
    phone: str
    hashed_password: Optional[str] = Field(default=None, description="Bcrypt-hashed password/PIN")
    email: Optional[str] = None
    specialization: str = "General Physician"
    qualification: Optional[str] = None  # e.g. "MBBS, MD"
    registration_number: Optional[str] = None  # Medical Council Registration
    assigned_facility: Optional[str] = None  # Hospital / PHC Name
    preferred_language: str = "en"  # "en" | "hi" | "mr"
    is_on_duty: bool = True
    helpline_number: Optional[str] = None
    stats: Dict[str, Any] = Field(
        default_factory=lambda: {
            "consultations_completed": 0,
            "active_cases": 0,
            "prescriptions_signed": 0,
        }
    )
