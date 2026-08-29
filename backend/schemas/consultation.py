from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from schemas.prescription import MedicineItemSchema


class ConsultationCreateRequest(BaseModel):
    """Schema for requesting a consultation (Patient or ASHA on behalf of patient)."""
    patient_id: Optional[str] = Field(default=None, description="Patient ID e.g. P-2041 (Required when requested by ASHA)")
    doctor_id: Optional[str] = Field(default=None, description="Preferred doctor ID (Optional)")
    reason: str = Field(..., min_length=2, max_length=500, description="Reason for consultation, e.g. Fever follow-up")
    symptoms: List[str] = Field(default_factory=list, description="Primary symptoms reported")
    urgency: str = Field(default="routine", description="Urgency: routine | urgent | emergency")
    notes: Optional[str] = Field(default=None, max_length=2000, description="Additional notes or context")
    preferred_time: Optional[datetime] = Field(default=None, description="Optional preferred consultation date/time")


class ConsultationDecisionRequest(BaseModel):
    """Schema for a doctor accepting or rejecting a consultation request."""
    action: str = Field(..., description="Action: 'accept' or 'reject'")
    notes: Optional[str] = Field(default=None, max_length=1000, description="Doctor decision notes or reason")


class ConsultationStatusUpdateRequest(BaseModel):
    """Schema for updating consultation progress status."""
    status: str = Field(..., description="Status: 'accepted' | 'rejected' | 'in_progress' | 'completed' | 'cancelled'")
    notes: Optional[str] = Field(default=None, max_length=2000, description="Updated notes")


class DoctorConsultationSubmitRequest(BaseModel):
    """Schema for a doctor submitting/saving a complete consultation."""
    patient_id: str = Field(..., description="Target patient ID e.g. P-4559")
    consultation_id: Optional[str] = Field(default=None, description="Optional consultation ID to resolve/update")
    date_time: Optional[datetime] = Field(default=None, description="Date & time of consultation")
    diagnosis: Optional[str] = Field(default=None, max_length=500, description="Primary clinical diagnosis")
    notes: Optional[str] = Field(default=None, max_length=4000, description="Doctor's clinical notes, observations, examination")
    advice: Optional[str] = Field(default=None, max_length=2000, description="Advice, dietary instructions, precautions, follow-up")
    medicines: List[MedicineItemSchema] = Field(default_factory=list, description="Prescribed medicines list")
    urgency: Optional[str] = Field(default="routine", description="Urgency: routine | urgent | emergency")
    status: str = Field(default="completed", description="Consultation status: completed | active")


class ConsultationResponse(BaseModel):
    """Schema for returning consultation details."""
    id: str
    consultation_id: str
    patient_id: str
    patient_name: Optional[str] = None
    patient_village: Optional[str] = None
    doctor_id: Optional[str] = None
    doctor_name: Optional[str] = None
    date_time: datetime
    status: str = "requested"
    urgency: str = "routine"
    reason: Optional[str] = None
    symptoms: List[str] = []
    notes: Optional[str] = None
    diagnosis: Optional[str] = None
    advice: Optional[str] = None
    medicines: List[MedicineItemSchema] = []
    requested_by: Optional[str] = "patient"
    call_session: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

