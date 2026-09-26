from datetime import datetime, timezone
from typing import Optional
from pydantic import Field
from models.base import MongoBaseModel


class Notification(MongoBaseModel):
    """
    MongoDB model representing an in-app notification for a patient or healthcare user.
    """
    notification_id: Optional[str] = Field(default=None, description="Unique human-readable notification ID e.g. NOTIF-1042")
    patient_id: str = Field(..., description="Target patient ID e.g. P-4559 or MongoDB _id")
    prescription_id: Optional[str] = Field(default=None, description="Associated prescription ID e.g. RX-1042")
    consultation_id: Optional[str] = Field(default=None, description="Associated consultation ID e.g. CONS-1042")
    doctor_id: Optional[str] = Field(default=None, description="Issuing doctor ID e.g. DOC-501")
    doctor_name: Optional[str] = Field(default=None, description="Doctor full name with title")
    title: str = Field(default="New Prescription Received", description="Notification title")
    message: str = Field(..., description="Notification body content")
    type: str = Field(default="prescription", description="Notification type: prescription | consultation | reminder | alert")
    is_read: bool = Field(default=False, description="Read status of notification")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Creation timestamp")
    updated_at: Optional[datetime] = Field(default=None, description="Last update timestamp")
