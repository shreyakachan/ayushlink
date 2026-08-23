from typing import Optional, List, Dict, Any
from pydantic import Field
from models.base import MongoBaseModel


class Patient(MongoBaseModel):
    """
    MongoDB model representing a registered patient in AyushLink.
    """
    patient_id: Optional[str] = Field(default=None, description="Human-readable ID e.g. P-2041")
    offline_id: Optional[str] = Field(default=None, description="Client-side offline sync ID e.g. Q-901")
    full_name: str
    phone: str
    hashed_password: Optional[str] = Field(default=None, description="Bcrypt-hashed password/PIN")
    age: Optional[int] = None
    gender: Optional[str] = None  # "male" | "female" | "other"
    village: Optional[str] = None
    abha_id: Optional[str] = None  # e.g. "14-2233-9981-0021"
    preferred_language: str = "en"  # "en" | "hi" | "mr"
    condition: Optional[str] = None  # e.g. "Viral fever", "Type 2 Diabetes"
    status: Optional[str] = "stable"  # "stable" | "review" | "critical" | "waiting" | "urgent"
    asha_worker_id: Optional[str] = None
    assigned_doctor_id: Optional[str] = None  # e.g. "DOC-501"
    blood_group: Optional[str] = None
    allergies: List[str] = Field(default_factory=list)
    chronic_conditions: List[str] = Field(default_factory=list)
    emergency_contacts: List[Dict[str, Any]] = Field(default_factory=list)
    medical_history: List[Dict[str, Any]] = Field(default_factory=list)
