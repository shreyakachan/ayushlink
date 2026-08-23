from datetime import datetime, timezone
from typing import Dict, Any
from fastapi import APIRouter, Depends, status, HTTPException
from schemas.sync import (
    BatchSyncRequest,
    BatchSyncResponse,
)
from services.security import (
    get_current_user_payload,
    get_current_patient,
    get_current_asha_worker,
)
from services.sync_service import process_batch_sync

router = APIRouter(tags=["PWA Offline Sync"])


# ==========================================
# 1. Batch Offline Synchronization Endpoint
# ==========================================

@router.post(
    "/sync/batch",
    response_model=BatchSyncResponse,
    status_code=status.HTTP_200_OK,
    summary="Synchronize offline-created records batch",
    description="Synchronizes multiple offline-queued records (patients, symptoms, vitals, consultation requests) when the PWA reconnects. Safe to retry, prevents duplicates with offline_id, and preserves original timestamps.",
)
async def sync_offline_batch(
    batch: BatchSyncRequest,
    payload: dict = Depends(get_current_user_payload),
):
    role = payload.get("role")
    if role == "patient":
        user_doc = await get_current_patient(payload)
    elif role == "asha":
        user_doc = await get_current_asha_worker(payload)
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Offline sync is supported for Patients and ASHA Workers.",
        )
    return await process_batch_sync(batch, user_doc)


# ==========================================
# 2. Sync Connectivity & Time Endpoint
# ==========================================

@router.get(
    "/sync/status",
    summary="Check sync connectivity & server time",
    description="Allows offline devices to verify connectivity and sync server timestamp upon reconnecting.",
)
async def get_sync_status():
    return {
        "status": "online",
        "service": "AyushLink Offline Sync Layer",
        "server_time": datetime.now(timezone.utc).isoformat(),
    }
