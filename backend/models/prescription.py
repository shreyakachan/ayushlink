from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from models.base import MongoBaseModel


class MedicineItem(BaseModel):
    """Details of a prescribed medicine."""
    name: str = Field(..., description="Medicine name and strength, e.g. Paracetamol 650mg")
    dosage: str = Field(..., description="Dosage quantity, e.g. 1 tablet, 1 capsule, 5ml")
    frequency: str = Field(default="Twice daily", description="Frequency, e.g. Twice daily, Once daily at night")
    duration: str = Field(..., description="Duration, e.g. 5 days, 30 days")
    instructions: Optional[str] = Field(default=None, description="Specific instructions, e.g. Take after food with water")


class Prescription(MongoBaseModel):
    """
    MongoDB model representing an issued digital prescription.
    """
    prescription_id: Optional[str] = Field(default=None, description="Human-readable ID e.g. RX-1042")
    patient_id: str = Field(..., description="Patient ID e.g. P-2041 or MongoDB _id")
    patient_name: Optional[str] = Field(default=None, description="Cached patient full name")
    patient_village: Optional[str] = Field(default=None, description="Cached patient village")
    doctor_id: str = Field(..., description="Doctor ID e.g. DOC-501 or MongoDB _id")
    doctor_name: Optional[str] = Field(default=None, description="Doctor full name with title")
    diagnosis: Optional[str] = Field(default=None, description="Clinical diagnosis e.g. Viral fever with dehydration")
    medicines: List[MedicineItem] = Field(default_factory=list, description="List of prescribed medicines")
    instructions: Optional[str] = Field(default=None, description="General doctor advice and diet instructions")
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Issue date and time")
    status: str = Field(default="active", description="Status: active | completed | cancelled | requested")
    facility: Optional[str] = Field(default=None, description="Hospital or clinic name")
