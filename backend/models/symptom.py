from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import Field
from models.base import MongoBaseModel


class SymptomRecord(MongoBaseModel):
    """
    MongoDB model representing submitted patient symptoms.
    """
    symptom_id: Optional[str] = Field(default=None, description="Human-readable ID e.g. SYM-1001")
    offline_id: Optional[str] = Field(default=None, description="Client-side offline sync ID e.g. Q-905")
    patient_id: str = Field(..., description="ID of the patient, e.g. P-2041 or patient MongoDB _id")
    symptoms: List[str] = Field(default_factory=list, description="List of primary symptom tags")
    description: str = Field(..., description="Detailed description of symptoms")
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Date and time of submission")
    status: str = Field(default="reported", description="Status: reported | under_review | resolved | escalated")
    severity: Optional[str] = Field(default="moderate", description="Severity: mild | moderate | severe")
    duration: Optional[str] = Field(default="today", description="Duration: today | 2-3-days | week | more-than-week")
    submitted_by: str = Field(default="patient", description="Role that submitted the symptom: patient | asha")
    submitted_by_id: Optional[str] = Field(default=None, description="User ID of the submitter")
    notes: Optional[str] = None
