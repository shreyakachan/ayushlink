from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class AshaCallCreateRequest(BaseModel):
    """Schema for a patient requesting an audio call with an ASHA worker."""
    target_worker_id: str = Field(..., min_length=2, max_length=50, description="Target ASHA worker ID e.g. ASHA-340")
    reason: Optional[str] = Field(default="Audio consultation", max_length=500, description="Reason or context for call")


class AshaCallDecisionRequest(BaseModel):
    """Schema for an ASHA worker accepting or rejecting an incoming audio call."""
    action: str = Field(..., description="Decision action: 'accept' or 'reject'")
    reason: Optional[str] = Field(default=None, max_length=500, description="Optional note or explanation")


class AshaCallResponse(BaseModel):
    """Schema returning audio call session state and participants."""
    id: str
    call_id: str
    patient_id: str
    patient_name: str
    patient_village: Optional[str] = None
    asha_worker_id: str
    asha_worker_name: Optional[str] = None
    status: str = "requested"  # requested | accepted | rejected | cancelled | missed | ended
    call_type: str = "audio"
    reason: Optional[str] = None
    call_session: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_seconds: int = 0
