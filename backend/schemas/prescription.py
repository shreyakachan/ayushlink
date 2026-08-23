from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class MedicineItemSchema(BaseModel):
    """Schema for an individual medicine in a prescription."""
    name: str = Field(..., min_length=2, max_length=150, description="Name & strength, e.g. Paracetamol 650mg")
    dosage: str = Field(..., min_length=1, max_length=100, description="Dosage amount, e.g. 1 tablet, 5ml")
    frequency: str = Field(default="Twice daily", max_length=100, description="e.g. Twice daily, Once daily at night")
    duration: str = Field(..., min_length=1, max_length=100, description="e.g. 5 days, 30 days")
    instructions: Optional[str] = Field(default=None, max_length=500, description="e.g. Take after food with warm water")


class PrescriptionCreateRequest(BaseModel):
    """Schema for a doctor creating a new digital prescription."""
    patient_id: str = Field(..., description="Target patient ID e.g. P-2041")
    diagnosis: Optional[str] = Field(default=None, max_length=500, description="Clinical diagnosis")
    medicines: List[MedicineItemSchema] = Field(..., min_items=1, description="List of prescribed medicines")
    instructions: Optional[str] = Field(default=None, max_length=2000, description="General doctor advice/diet instructions")
    status: str = Field(default="active", description="active | completed | requested")


class PrescriptionResponse(BaseModel):
    """Schema for returning prescription details."""
    id: str
    prescription_id: str
    patient_id: str
    patient_name: Optional[str] = None
    patient_village: Optional[str] = None
    doctor_id: str
    doctor_name: Optional[str] = None
    diagnosis: Optional[str] = None
    medicines: List[MedicineItemSchema] = []
    instructions: Optional[str] = None
    date: datetime
    status: str = "active"
    created_at: Optional[datetime] = None
