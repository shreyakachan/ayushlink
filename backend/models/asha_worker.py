from typing import Optional, List, Dict, Any
from pydantic import Field
from models.base import MongoBaseModel


class AshaWorker(MongoBaseModel):
    """
    MongoDB model representing an ASHA worker in AyushLink.
    """
    worker_id: Optional[str] = Field(default=None, description="Human-readable ID e.g. ASHA-101")
    full_name: str
    phone: str
    hashed_password: Optional[str] = Field(default=None, description="Bcrypt-hashed password/PIN")
    email: Optional[str] = None
    assigned_villages: List[str] = Field(default_factory=list)  # e.g. ["Chandapur", "Nandgaon", "Kharwadi"]
    primary_phc: Optional[str] = None  # Primary Health Centre name
    preferred_language: str = "en"  # "en" | "hi" | "mr"
    is_active: bool = True
    stats: Dict[str, Any] = Field(
        default_factory=lambda: {
            "patients_seen": 0,
            "prescriptions_issued": 0,
            "villages_covered": 0,
            "months_active": 0,
        }
    )
