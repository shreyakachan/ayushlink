from datetime import datetime, timezone
from typing import Optional
from pydantic import Field
from models.base import MongoBaseModel


class InventoryItem(MongoBaseModel):
    """
    MongoDB document model for ASHA Worker Medicine Inventory items.
    Scoped per ASHA Worker identity via `asha_worker_id`.
    """
    item_id: str = Field(..., description="Unique item code e.g. M-01")
    asha_worker_id: str = Field(..., description="Worker ID or unique identifier of the owning ASHA worker")
    name: str = Field(..., description="Medicine or supply name")
    category: str = Field(default="General", description="Category e.g. Analgesic, Rehydration, Antibiotic")
    stock: int = Field(default=0, ge=0, description="Available stock quantity")
    unit: str = Field(default="strips", description="Unit of measurement e.g. strips, sachets, bottles")
    threshold: int = Field(default=10, ge=1, description="Minimum recommended stock threshold")
