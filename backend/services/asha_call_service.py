import logging
import random
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from fastapi import HTTPException, status
from database import (
    get_collection,
    COLLECTION_ASHA_CALLS,
    COLLECTION_ASHA_WORKERS,
    COLLECTION_PATIENTS,
    COLLECTION_NOTIFICATIONS,
)
from schemas.asha_call import (
    AshaCallCreateRequest,
    AshaCallDecisionRequest,
    AshaCallResponse,
)

logger = logging.getLogger("ayushlink.asha_calls")

CALL_TIMEOUT_SECONDS = 45


def parse_datetime(val: Any) -> Optional[datetime]:
    """Parse string or datetime to UTC datetime."""
    if isinstance(val, datetime):
        if val.tzinfo is None:
            return val.replace(tzinfo=timezone.utc)
        return val
    if isinstance(val, str):
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except Exception:
            return None
    return None


def doc_to_asha_call_response(doc: dict) -> AshaCallResponse:
    """Convert MongoDB asha_calls document to clean AshaCallResponse schema."""
    created_at = parse_datetime(doc.get("created_at")) or datetime.now(timezone.utc)
    started_at = parse_datetime(doc.get("started_at"))
    ended_at = parse_datetime(doc.get("ended_at"))

    # Calculate duration
    duration = doc.get("duration_seconds")
    if duration is None or duration == 0:
        if started_at and ended_at:
            duration = max(0, int((ended_at - started_at).total_seconds()))
        elif started_at and doc.get("status") == "accepted":
            duration = max(0, int((datetime.now(timezone.utc) - started_at).total_seconds()))
        else:
            duration = 0

    return AshaCallResponse(
        id=str(doc.get("_id")),
        call_id=doc.get("call_id", ""),
        patient_id=doc.get("patient_id", ""),
        patient_name=doc.get("patient_name", "Patient"),
        patient_village=doc.get("patient_village"),
        asha_worker_id=doc.get("asha_worker_id", ""),
        asha_worker_name=doc.get("asha_worker_name", "ASHA Worker"),
        status=doc.get("status", "requested"),
        call_type=doc.get("call_type", "audio"),
        reason=doc.get("reason"),
        call_session=doc.get("call_session", {}),
        created_at=created_at,
        started_at=started_at,
        ended_at=ended_at,
        duration_seconds=duration,
    )


async def check_and_expire_unanswered_calls(
    patient_id: Optional[str] = None,
    asha_worker_id: Optional[str] = None,
) -> int:
    """
    Safely expire calls unanswered after 45 seconds to 'missed'.
    Creates an ASHA notification for each missed call.
    Deterministic, robust, and zero fragile background threads.
    """
    calls_col = get_collection(COLLECTION_ASHA_CALLS)
    notifs_col = get_collection(COLLECTION_NOTIFICATIONS)
    if calls_col is None:
        return 0

    cutoff = datetime.now(timezone.utc) - timedelta(seconds=CALL_TIMEOUT_SECONDS)
    cutoff_iso = cutoff.isoformat()
    time_condition = {
        "$or": [
            {"created_at": {"$lt": cutoff}},
            {"created_at": {"$lt": cutoff_iso}},
        ]
    }
    query: Dict[str, Any] = {
        "status": "requested",
        **time_condition,
    }
    if patient_id:
        query["patient_id"] = patient_id
    if asha_worker_id:
        query["asha_worker_id"] = asha_worker_id

    now = datetime.now(timezone.utc)
    expired_count = 0

    cursor = calls_col.find(query)
    async for call_doc in cursor:
        res = await calls_col.update_one(
            {"_id": call_doc["_id"], "status": "requested"},
            {
                "$set": {
                    "status": "missed",
                    "ended_at": now,
                    "call_session.session_status": "ended",
                    "updated_at": now,
                }
            },
        )
        if res.modified_count > 0:
            expired_count += 1
            logger.info(
                f"[ASHA Call] Call {call_doc.get('call_id')} exceeded {CALL_TIMEOUT_SECONDS}s. Transitioned to 'missed'."
            )
            # Create in-app missed-call notification for the ASHA worker
            if notifs_col is not None:
                worker_id = call_doc.get("asha_worker_id")
                p_name = call_doc.get("patient_name", "Patient")
                p_id = call_doc.get("patient_id", "")
                notif_id = f"NOTIF-{random.randint(1000, 9999)}"
                await notifs_col.insert_one(
                    {
                        "notification_id": notif_id,
                        "recipient_role": "asha",
                        "recipient_id": worker_id,
                        "worker_id": worker_id,
                        "asha_worker_id": worker_id,
                        "patient_id": p_id,
                        "patient_name": p_name,
                        "call_id": call_doc.get("call_id"),
                        "title": "Missed Voice Call",
                        "message": f"Missed voice call from {p_name} ({p_id}).",
                        "type": "audio_call_missed",
                        "is_read": False,
                        "created_at": now,
                    }
                )

    return expired_count


async def create_asha_audio_call(
    patient: dict,
    request: AshaCallCreateRequest,
) -> AshaCallResponse:
    """
    Patient initiates an audio-only call to an assigned or selected ASHA worker.
    Enforces authentication, checks worker existence, and prevents duplicate active calls.
    """
    calls_col = get_collection(COLLECTION_ASHA_CALLS)
    workers_col = get_collection(COLLECTION_ASHA_WORKERS)
    if calls_col is None or workers_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    # 1. Clean up any expired calls
    await check_and_expire_unanswered_calls()

    # 2. Validate target ASHA worker exists
    target_id = request.target_worker_id.strip()
    worker = await workers_col.find_one({
        "$or": [{"worker_id": target_id}, {"phone": target_id}],
        "is_active": {"$ne": False},
    })
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ASHA worker '{target_id}' not found or currently inactive.",
        )

    # 3. Prevent duplicate active calls for this patient
    pat_id = patient.get("patient_id")
    if not pat_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid patient credentials.",
        )

    existing_active = await calls_col.find_one({
        "patient_id": pat_id,
        "status": {"$in": ["requested", "accepted"]},
    })
    if existing_active:
        # If it's already requested for the same worker, return it idempotently
        if existing_active.get("asha_worker_id") == worker.get("worker_id") and existing_active.get("status") == "requested":
            return doc_to_asha_call_response(existing_active)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An audio call is already active. Please finish or cancel the current call first.",
        )

    # Prevent calling worker who is already engaged in an active call
    worker_busy = await calls_col.find_one({
        "asha_worker_id": worker.get("worker_id"),
        "status": "accepted",
    })
    if worker_busy:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"ASHA worker '{worker.get('full_name')}' is currently on another call. Please try again shortly.",
        )

    # 4. Generate unique call ID and room session
    now = datetime.now(timezone.utc)
    for _ in range(5):
        num = random.randint(1000, 9999)
        call_id = f"CALL-{num}"
        if not await calls_col.find_one({"call_id": call_id}):
            break

    room_id = f"room_asha_{call_id.lower()}"

    doc = {
        "call_id": call_id,
        "patient_id": pat_id,
        "patient_name": patient.get("full_name") or "Patient",
        "patient_village": patient.get("village") or "Chandapur",
        "asha_worker_id": worker.get("worker_id"),
        "asha_worker_name": worker.get("full_name") or "Pooja Sharma",
        "status": "requested",
        "call_type": "audio",
        "reason": request.reason or "Audio consultation",
        "call_session": {
            "room_id": room_id,
            "session_status": "idle",
        },
        "created_at": now,
        "started_at": None,
        "ended_at": None,
        "duration_seconds": 0,
    }

    res = await calls_col.insert_one(doc)
    doc["_id"] = res.inserted_id
    logger.info(f"[ASHA Call] Created call request {call_id} from {pat_id} to {worker.get('worker_id')}")
    return doc_to_asha_call_response(doc)


async def get_patient_active_call(patient: dict) -> Optional[AshaCallResponse]:
    """Retrieve the currently active or pending audio call for the authenticated patient."""
    calls_col = get_collection(COLLECTION_ASHA_CALLS)
    if calls_col is None:
        return None

    pat_id = patient.get("patient_id")
    if not pat_id:
        return None

    await check_and_expire_unanswered_calls(patient_id=pat_id)

    doc = await calls_col.find_one(
        {
            "patient_id": pat_id,
            "status": {"$in": ["requested", "accepted"]},
        },
        sort=[("created_at", -1)],
    )
    if doc:
        return doc_to_asha_call_response(doc)
    return None


async def get_asha_active_call(worker: dict) -> Optional[AshaCallResponse]:
    """Retrieve the incoming or active audio call for the authenticated ASHA worker."""
    calls_col = get_collection(COLLECTION_ASHA_CALLS)
    if calls_col is None:
        return None

    worker_id = worker.get("worker_id")
    if not worker_id:
        return None

    await check_and_expire_unanswered_calls(asha_worker_id=worker_id)

    doc = await calls_col.find_one(
        {
            "asha_worker_id": worker_id,
            "status": {"$in": ["requested", "accepted"]},
        },
        sort=[("created_at", -1)],
    )
    if doc:
        return doc_to_asha_call_response(doc)
    return None


async def decide_asha_call(
    call_id: str,
    decision: AshaCallDecisionRequest,
    worker: dict,
) -> AshaCallResponse:
    """ASHA worker accepts or rejects an incoming audio call request."""
    calls_col = get_collection(COLLECTION_ASHA_CALLS)
    if calls_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    await check_and_expire_unanswered_calls()

    worker_id = worker.get("worker_id")
    action = decision.action.strip().lower()
    if action not in ["accept", "reject"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Action must be 'accept' or 'reject'.",
        )

    now = datetime.now(timezone.utc)
    set_update = {
        "updated_at": now,
    }

    if action == "accept":
        # Guard against ASHA worker accepting multiple calls simultaneously
        already_in_call = await calls_col.find_one({
            "asha_worker_id": worker_id,
            "status": "accepted",
            "call_id": {"$ne": call_id},
        })
        if already_in_call:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You already have an active call in progress. Please end it before accepting another call.",
            )
        set_update["status"] = "accepted"
        set_update["started_at"] = now
        set_update["call_session.session_status"] = "ready"
    else:  # reject
        set_update["status"] = "rejected"
        set_update["ended_at"] = now
        set_update["call_session.session_status"] = "ended"
        if decision.reason:
            set_update["decision_reason"] = decision.reason

    # Atomic state transition from 'requested'
    res = await calls_col.find_one_and_update(
        {
            "call_id": call_id,
            "asha_worker_id": worker_id,
            "status": "requested",
        },
        {"$set": set_update},
        return_document=True,
    )

    if not res:
        # Check why it couldn't be updated
        existing = await calls_col.find_one({"call_id": call_id})
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Call '{call_id}' not found.",
            )
        if existing.get("asha_worker_id") != worker_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to answer this call.",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Call cannot be answered because its status is already '{existing.get('status')}'.",
        )

    logger.info(f"[ASHA Call] Worker {worker_id} {action}ed call {call_id}")
    return doc_to_asha_call_response(res)


async def cancel_asha_call(call_id: str, patient: dict) -> AshaCallResponse:
    """Patient cancels their pending audio call before ASHA answers."""
    calls_col = get_collection(COLLECTION_ASHA_CALLS)
    if calls_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    await check_and_expire_unanswered_calls()

    pat_id = patient.get("patient_id")
    now = datetime.now(timezone.utc)

    res = await calls_col.find_one_and_update(
        {
            "call_id": call_id,
            "patient_id": pat_id,
            "status": "requested",
        },
        {
            "$set": {
                "status": "cancelled",
                "ended_at": now,
                "call_session.session_status": "ended",
                "updated_at": now,
            }
        },
        return_document=True,
    )

    if not res:
        existing = await calls_col.find_one({"call_id": call_id})
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Call '{call_id}' not found.",
            )
        if existing.get("patient_id") != pat_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to cancel this call.",
            )
        if existing.get("status") in ["cancelled", "missed", "rejected"]:
            return doc_to_asha_call_response(existing)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel call in '{existing.get('status')}' state.",
        )

    logger.info(f"[ASHA Call] Patient {pat_id} cancelled call {call_id}")
    return doc_to_asha_call_response(res)


async def end_asha_call(call_id: str, user_payload: dict) -> AshaCallResponse:
    """Either authorized participant (patient or ASHA) ends an ongoing audio call."""
    calls_col = get_collection(COLLECTION_ASHA_CALLS)
    if calls_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    caller_role = user_payload.get("role")
    caller_sub = user_payload.get("sub") or user_payload.get("patient_id") or user_payload.get("worker_id")

    existing = await calls_col.find_one({"call_id": call_id})
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Call '{call_id}' not found.",
        )

    # Authorize caller
    is_patient = (
        caller_role == "patient"
        and (caller_sub == existing.get("patient_id") or user_payload.get("patient_id") == existing.get("patient_id"))
    )
    is_asha = (
        caller_role == "asha"
        and (caller_sub == existing.get("asha_worker_id") or user_payload.get("worker_id") == existing.get("asha_worker_id"))
    )

    if not (is_patient or is_asha or caller_role == "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to terminate this call.",
        )

    if existing.get("status") == "ended":
        return doc_to_asha_call_response(existing)

    now = datetime.now(timezone.utc)
    started_at = parse_datetime(existing.get("started_at"))
    duration = 0
    if started_at:
        duration = max(0, int((now - started_at).total_seconds()))

    res = await calls_col.find_one_and_update(
        {"call_id": call_id},
        {
            "$set": {
                "status": "ended",
                "ended_at": now,
                "duration_seconds": duration,
                "call_session.session_status": "ended",
                "updated_at": now,
            }
        },
        return_document=True,
    )

    logger.info(f"[ASHA Call] Call {call_id} ended by {caller_role} (Duration: {duration}s)")
    return doc_to_asha_call_response(res)


async def find_call_by_session_id(session_id: str) -> Optional[dict]:
    """Find call by call_id or call_session.room_id."""
    calls_col = get_collection(COLLECTION_ASHA_CALLS)
    if calls_col is None:
        return None

    # Try direct call_id
    doc = await calls_col.find_one({"call_id": session_id})
    if doc:
        return doc

    # Try room_id
    doc = await calls_col.find_one({"call_session.room_id": session_id})
    if doc:
        return doc

    # Try stripped room_asha_ prefix
    if session_id.startswith("room_asha_"):
        raw_call_id = session_id[10:].upper()
        doc = await calls_col.find_one({"call_id": raw_call_id})
        if doc:
            return doc

    return None


async def get_available_asha_workers() -> List[Dict[str, Any]]:
    """Retrieve active ASHA workers for patient selection."""
    workers_col = get_collection(COLLECTION_ASHA_WORKERS)
    if workers_col is None:
        return []

    cursor = workers_col.find({"is_active": {"$ne": False}}).sort("full_name", 1)
    results = []
    async for w in cursor:
        results.append({
            "worker_id": w.get("worker_id"),
            "full_name": w.get("full_name"),
            "phone": w.get("phone"),
            "assigned_villages": w.get("assigned_villages", []),
            "primary_phc": w.get("primary_phc"),
            "is_active": w.get("is_active", True),
        })
    return results


async def get_call_details(call_id: str, user_payload: dict) -> AshaCallResponse:
    """Retrieve full details of a specific audio call. Authorized for participants and admin only."""
    calls_col = get_collection(COLLECTION_ASHA_CALLS)
    if calls_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    await check_and_expire_unanswered_calls()

    doc = await calls_col.find_one({"call_id": call_id})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Call '{call_id}' not found.",
        )

    caller_role = user_payload.get("role")
    caller_sub = user_payload.get("sub") or user_payload.get("patient_id") or user_payload.get("worker_id")

    is_patient = (
        caller_role == "patient"
        and (caller_sub == doc.get("patient_id") or user_payload.get("patient_id") == doc.get("patient_id"))
    )
    is_asha = (
        caller_role == "asha"
        and (caller_sub == doc.get("asha_worker_id") or user_payload.get("worker_id") == doc.get("asha_worker_id"))
    )

    if not (is_patient or is_asha or caller_role == "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this call.",
        )

    return doc_to_asha_call_response(doc)
