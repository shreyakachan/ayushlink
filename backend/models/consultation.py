from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import Field
from models.base import MongoBaseModel


class Consultation(MongoBaseModel):
    """
    MongoDB model representing a doctor-patient teleconsultation.
    """
    consultation_id: Optional[str] = Field(default=None, description="Human-readable ID e.g. CONS-1042")
    offline_id: Optional[str] = Field(default=None, description="Client-side offline sync ID e.g. Q-915")
    patient_id: str = Field(..., description="Patient ID e.g. P-2041")
    patient_name: Optional[str] = Field(default=None, description="Patient full name")
    patient_village: Optional[str] = Field(default=None, description="Patient village")
    doctor_id: Optional[str] = Field(default=None, description="Assigned doctor ID e.g. DOC-501")
    doctor_name: Optional[str] = Field(default=None, description="Doctor full name")
    date_time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Consultation scheduled/requested date and time")
    status: str = Field(default="requested", description="Status: requested | accepted | rejected | in_progress | completed | cancelled")
    notes: Optional[str] = Field(default=None, description="Doctor or clinical notes")
    diagnosis: Optional[str] = Field(default=None, description="Clinical diagnosis")
    advice: Optional[str] = Field(default=None, description="Medical and dietary advice, lifestyle instructions")
    medicines: List[Dict[str, Any]] = Field(default_factory=list, description="Prescribed medicines list")
    reason: Optional[str] = Field(default=None, description="Reason for consultation, e.g. Viral fever follow-up")
    symptoms: List[str] = Field(default_factory=list, description="Associated symptoms")
    urgency: str = Field(default="routine", description="Urgency: routine | urgent | emergency")
    requested_by: str = Field(default="patient", description="Role that initiated the request: patient | asha")
    call_session: Dict[str, Any] = Field(
        default_factory=lambda: {
            "room_id": None,
            "session_status": "idle",  # idle | ready | active | ended
            "meeting_link": None,
        },
        description="Backend data structure to support teleconsultation / video-call sessions",
    )

