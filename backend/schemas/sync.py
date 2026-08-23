from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class SyncItemRequest(BaseModel):
    """An individual record queued offline."""
    client_id: str = Field(..., description="Client-generated unique ID e.g. Q-901 or uuid4")
    type: str = Field(
        ...,
        description="Record type: 'new_patient' | 'patient_registration' | 'symptom_report' | 'ai_assessment' | 'vitals_update' | 'consultation_request'",
    )
    client_created_at: Optional[datetime] = Field(default=None, description="Original local creation time when offline")
    payload: Dict[str, Any] = Field(..., description="Data payload for creating or updating the record")


class BatchSyncRequest(BaseModel):
    """Batch of offline records to be synchronized upon reconnecting."""
    batch_id: Optional[str] = Field(default=None, description="Optional client batch identifier")
    items: List[SyncItemRequest] = Field(..., min_items=1, description="List of offline records to sync")


class SyncItemResult(BaseModel):
    """Result for an individual synchronized item."""
    client_id: str
    type: str
    status: str = Field(..., description="synced | already_synced | error")
    server_id: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None


class BatchSyncResponse(BaseModel):
    """Overall batch sync result summary."""
    batch_id: str
    total_items: int
    synced_count: int
    already_synced_count: int
    failed_count: int
    results: List[SyncItemResult]
    synced_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
