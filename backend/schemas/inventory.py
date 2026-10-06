from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class InventoryItemBase(BaseModel):
    name: str = Field(..., description="Medicine or item name")
    category: str = Field(default="General", description="Medicine category")
    stock: int = Field(default=0, ge=0, description="Available quantity in stock")
    unit: str = Field(default="strips", description="Unit of measurement (strips, sachets, bottles, etc.)")
    threshold: int = Field(default=10, ge=1, description="Minimum safe stock threshold")


class InventoryItemCreate(InventoryItemBase):
    item_id: Optional[str] = Field(default=None, description="Optional custom item ID e.g. M-01")


class InventoryItemUpdate(BaseModel):
    stock: Optional[int] = Field(default=None, ge=0, description="Updated stock value")
    name: Optional[str] = Field(default=None, description="Updated item name")
    category: Optional[str] = Field(default=None, description="Updated category")
    unit: Optional[str] = Field(default=None, description="Updated unit")
    threshold: Optional[int] = Field(default=None, ge=1, description="Updated threshold")


class InventoryStockAdjust(BaseModel):
    delta: int = Field(..., description="Relative stock change (+1, -1, etc.)")


class InventoryItemResponse(BaseModel):
    id: Optional[str] = None
    item_id: str
    asha_worker_id: str
    name: str
    category: str
    stock: int
    unit: str
    threshold: int
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class InventoryListResponse(BaseModel):
    total: int
    low_stock_count: int
    out_of_stock_count: int
    items: List[InventoryItemResponse]
