from typing import Dict, Any
from fastapi import APIRouter, Depends, status
from schemas.inventory import (
    InventoryListResponse,
    InventoryItemResponse,
    InventoryStockAdjust,
    InventoryItemUpdate,
)
from services.inventory_service import (
    get_asha_inventory,
    adjust_inventory_stock,
    update_inventory_item,
)
from services.security import get_current_asha_worker

router = APIRouter(tags=["ASHA Worker Medicine Inventory"])


@router.get(
    "/asha/inventory",
    response_model=InventoryListResponse,
    summary="Get medicine inventory for authenticated ASHA worker",
    description="Fetches medicine stocks, threshold levels, and supply status from MongoDB for the logged-in ASHA worker.",
)
async def get_inventory(current_asha: dict = Depends(get_current_asha_worker)):
    return await get_asha_inventory(current_asha)


@router.post(
    "/asha/inventory/{item_id}/adjust",
    response_model=InventoryItemResponse,
    summary="Increase or decrease medicine stock",
    description="Adjusts stock quantity by delta (+1, -1, etc.) in MongoDB for the logged-in ASHA worker.",
)
async def adjust_stock(
    item_id: str,
    body: InventoryStockAdjust,
    current_asha: dict = Depends(get_current_asha_worker),
):
    return await adjust_inventory_stock(item_id, body.delta, current_asha)


@router.patch(
    "/asha/inventory/{item_id}",
    response_model=InventoryItemResponse,
    summary="Update medicine item details or stock directly",
    description="Updates stock level or medicine parameters in MongoDB.",
)
async def update_item(
    item_id: str,
    body: InventoryItemUpdate,
    current_asha: dict = Depends(get_current_asha_worker),
):
    return await update_inventory_item(item_id, body, current_asha)


# Aliases for flexible routing
@router.get(
    "/inventory",
    response_model=InventoryListResponse,
    include_in_schema=False,
)
async def get_inventory_alias(current_asha: dict = Depends(get_current_asha_worker)):
    return await get_asha_inventory(current_asha)


@router.post(
    "/inventory/{item_id}/adjust",
    response_model=InventoryItemResponse,
    include_in_schema=False,
)
async def adjust_stock_alias(
    item_id: str,
    body: InventoryStockAdjust,
    current_asha: dict = Depends(get_current_asha_worker),
):
    return await adjust_inventory_stock(item_id, body.delta, current_asha)


@router.patch(
    "/inventory/{item_id}",
    response_model=InventoryItemResponse,
    include_in_schema=False,
)
async def update_item_alias(
    item_id: str,
    body: InventoryItemUpdate,
    current_asha: dict = Depends(get_current_asha_worker),
):
    return await update_inventory_item(item_id, body, current_asha)
