from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


class NotificationResponse(BaseModel):
    """Schema for returning in-app notifications (patient, doctor, asha)."""
    id: str
    notification_id: str
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    prescription_id: Optional[str] = None
    consultation_id: Optional[str] = None
    symptom_id: Optional[str] = None
    symptom: Optional[str] = None
    offline_id: Optional[str] = None
    doctor_id: Optional[str] = None
    doctor_name: Optional[str] = None
    title: str = Field(default="Notification")
    message: str
    type: str = "prescription"
    is_read: bool = False
    created_at: datetime
