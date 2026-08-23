from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class MongoBaseModel(BaseModel):
    """
    Base model for all MongoDB documents.
    Supports MongoDB's _id <-> id mapping and ISO UTC timestamps.
    """
    id: Optional[str] = Field(default=None, alias="_id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={datetime: lambda v: v.isoformat()},
        arbitrary_types_allowed=True,
    )
