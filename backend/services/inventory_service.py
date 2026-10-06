import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import HTTPException, status
from database import get_collection, COLLECTION_INVENTORY
from schemas.inventory import (
    InventoryItemResponse,
    InventoryListResponse,
    InventoryItemUpdate,
)

logger = logging.getLogger("ayushlink.inventory")

DEFAULT_MEDICINE_KIT = [
    {"item_id": "M-01", "name": "Paracetamol 500mg", "category": "Analgesic", "stock": 6, "unit": "strips", "threshold": 20},
    {"item_id": "M-02", "name": "ORS Sachets", "category": "Rehydration", "stock": 42, "unit": "sachets", "threshold": 30},
    {"item_id": "M-03", "name": "Amoxicillin 500mg", "category": "Antibiotic", "stock": 9, "unit": "strips", "threshold": 15},
    {"item_id": "M-04", "name": "Cetirizine 10mg", "category": "Antihistamine", "stock": 28, "unit": "strips", "threshold": 20},
    {"item_id": "M-05", "name": "Metformin 500mg", "category": "Antidiabetic", "stock": 4, "unit": "strips", "threshold": 15},
    {"item_id": "M-06", "name": "Iron & Folic Acid", "category": "Supplement", "stock": 55, "unit": "strips", "threshold": 25},
    {"item_id": "M-07", "name": "Oral Rehydration Salts (kids)", "category": "Rehydration", "stock": 3, "unit": "sachets", "threshold": 20},
    {"item_id": "M-08", "name": "Cough Syrup", "category": "Respiratory", "stock": 18, "unit": "bottles", "threshold": 10},
    {"item_id": "M-09", "name": "Antiseptic Solution", "category": "First Aid", "stock": 12, "unit": "bottles", "threshold": 10},
    {"item_id": "M-10", "name": "Vitamin D3 Drops", "category": "Supplement", "stock": 30, "unit": "bottles", "threshold": 15},
]


def calculate_status(stock: int, threshold: int) -> str:
    """Determine stock status based on stock and threshold values."""
    if stock <= 0:
        return "critical"
    ratio = stock / threshold if threshold > 0 else 1.0
    if ratio <= 0.5:
        return "critical"
    if ratio < 1.0:
        return "low"
    return "ok"


def doc_to_response(doc: dict) -> InventoryItemResponse:
    """Convert MongoDB document to Pydantic InventoryItemResponse."""
    stock = doc.get("stock", 0)
    threshold = doc.get("threshold", 10)
    status_label = calculate_status(stock, threshold)

    return InventoryItemResponse(
        id=str(doc.get("_id")),
        item_id=doc.get("item_id", ""),
        asha_worker_id=doc.get("asha_worker_id", ""),
        name=doc.get("name", ""),
        category=doc.get("category", "General"),
        stock=stock,
        unit=doc.get("unit", "strips"),
        threshold=threshold,
        status=status_label,
        created_at=doc.get("created_at"),
        updated_at=doc.get("updated_at"),
    )


def extract_worker_id(current_asha: dict) -> str:
    """Extract authoritative ASHA worker ID from authenticated identity."""
    worker_id = current_asha.get("worker_id")
    if not worker_id and "_id" in current_asha:
        worker_id = str(current_asha["_id"])
    if not worker_id:
        worker_id = current_asha.get("sub", "ASHA-DEFAULT")
    return str(worker_id).strip()


async def initialize_worker_inventory_in_db(worker_id: str) -> List[dict]:
    """Seed initial medicine stock for an ASHA worker in MongoDB if none exists."""
    col = get_collection(COLLECTION_INVENTORY)
    if col is None:
        return []

    now = datetime.now(timezone.utc)
    docs_to_insert = []
    for item in DEFAULT_MEDICINE_KIT:
        doc = {
            "item_id": item["item_id"],
            "asha_worker_id": worker_id,
            "name": item["name"],
            "category": item["category"],
            "stock": item["stock"],
            "unit": item["unit"],
            "threshold": item["threshold"],
            "created_at": now,
            "updated_at": now,
        }
        docs_to_insert.append(doc)

    if docs_to_insert:
        await col.insert_many(docs_to_insert)
        logger.info(f"Initialized {len(docs_to_insert)} inventory records in MongoDB for ASHA {worker_id}")

    cursor = col.find({"asha_worker_id": worker_id}).sort("item_id", 1)
    return await cursor.to_list(length=100)


async def get_asha_inventory(current_asha: dict) -> InventoryListResponse:
    """Retrieve full medicine inventory for authenticated ASHA worker from MongoDB."""
    col = get_collection(COLLECTION_INVENTORY)
    if col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is not available.",
        )

    worker_id = extract_worker_id(current_asha)
    cursor = col.find({"asha_worker_id": worker_id}).sort("item_id", 1)
    docs = await cursor.to_list(length=100)

    # If no records exist for this worker yet, initialize database records
    if not docs:
        docs = await initialize_worker_inventory_in_db(worker_id)

    items = [doc_to_response(d) for d in docs]
    low_stock_count = sum(1 for i in items if i.status in ("critical", "low"))
    out_of_stock_count = sum(1 for i in items if i.stock <= 0)

    return InventoryListResponse(
        total=len(items),
        low_stock_count=low_stock_count,
        out_of_stock_count=out_of_stock_count,
        items=items,
    )


async def adjust_inventory_stock(
    item_id: str,
    delta: int,
    current_asha: dict,
) -> InventoryItemResponse:
    """Increase or decrease medicine stock by delta, persisted to MongoDB."""
    col = get_collection(COLLECTION_INVENTORY)
    if col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is not available.",
        )

    worker_id = extract_worker_id(current_asha)
    query = {"asha_worker_id": worker_id, "item_id": item_id}
    doc = await col.find_one(query)

    if not doc:
        # Check if worker needs initialization first
        existing_count = await col.count_documents({"asha_worker_id": worker_id})
        if existing_count == 0:
            await initialize_worker_inventory_in_db(worker_id)
            doc = await col.find_one(query)

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Medicine item '{item_id}' not found in inventory for worker {worker_id}.",
        )

    current_stock = doc.get("stock", 0)
    new_stock = max(0, current_stock + delta)
    now = datetime.now(timezone.utc)

    update_result = await col.find_one_and_update(
        query,
        {"$set": {"stock": new_stock, "updated_at": now}},
        return_document=True,
    )

    if not update_result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update inventory stock in MongoDB.",
        )

    return doc_to_response(update_result)


async def update_inventory_item(
    item_id: str,
    update_data: InventoryItemUpdate,
    current_asha: dict,
) -> InventoryItemResponse:
    """Update stock or details for a medicine item in MongoDB."""
    col = get_collection(COLLECTION_INVENTORY)
    if col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is not available.",
        )

    worker_id = extract_worker_id(current_asha)
    query = {"asha_worker_id": worker_id, "item_id": item_id}
    doc = await col.find_one(query)

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Medicine item '{item_id}' not found in inventory.",
        )

    update_dict: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
    if update_data.stock is not None:
        update_dict["stock"] = max(0, update_data.stock)
    if update_data.name is not None:
        update_dict["name"] = update_data.name.strip()
    if update_data.category is not None:
        update_dict["category"] = update_data.category.strip()
    if update_data.unit is not None:
        update_dict["unit"] = update_data.unit.strip()
    if update_data.threshold is not None:
        update_dict["threshold"] = max(1, update_data.threshold)

    updated_doc = await col.find_one_and_update(
        query,
        {"$set": update_dict},
        return_document=True,
    )

    return doc_to_response(updated_doc)
