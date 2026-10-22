import json
import logging
from typing import Optional, List, Dict, Any
from fastapi import (
    APIRouter,
    Depends,
    WebSocket,
    WebSocketDisconnect,
    Query,
    status,
)
from schemas.asha_call import (
    AshaCallCreateRequest,
    AshaCallDecisionRequest,
    AshaCallResponse,
)
from services.asha_call_service import (
    create_asha_audio_call,
    get_patient_active_call,
    get_asha_active_call,
    decide_asha_call,
    cancel_asha_call,
    end_asha_call,
    get_available_asha_workers,
    find_call_by_session_id,
    get_call_details,
)
from services.security import (
    get_current_patient,
    get_current_asha_worker,
    get_current_user_payload,
    decode_access_token,
)
from services.teleconsultation_signaling import signaling_manager

logger = logging.getLogger("ayushlink.asha_calls")

router = APIRouter(tags=["Patient-to-ASHA Audio Calls"])


# ==========================================
# 1. Available ASHA Workers for Call Selection
# ==========================================

@router.get(
    "/asha-calls/workers",
    response_model=List[Dict[str, Any]],
    summary="List available ASHA workers for audio call selection",
    description="Returns active ASHA workers with assigned villages for patient selection.",
)
async def list_available_workers(
    current_user: dict = Depends(get_current_user_payload),
):
    return await get_available_asha_workers()


# ==========================================
# 2. Request Audio Call (Patient only)
# ==========================================

@router.post(
    "/asha-calls/request",
    response_model=AshaCallResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Request a 2-way audio call with an ASHA worker (Patient only)",
    description="Initiates an audio call session in 'requested' state with the target ASHA worker.",
)
async def request_audio_call(
    request: AshaCallCreateRequest,
    current_patient: dict = Depends(get_current_patient),
):
    return await create_asha_audio_call(current_patient, request)


# ==========================================
# 3. Patient Active Call Polling (Patient only)
# ==========================================

@router.get(
    "/asha-calls/active-patient",
    response_model=Optional[AshaCallResponse],
    summary="Get patient's active or pending audio call (Patient only)",
    description="Retrieves the current requested or accepted audio call for the authenticated patient.",
)
async def get_patient_active(
    current_patient: dict = Depends(get_current_patient),
):
    return await get_patient_active_call(current_patient)


# ==========================================
# 4. ASHA Incoming / Active Call Polling (ASHA only)
# ==========================================

@router.get(
    "/asha-calls/active-asha",
    response_model=Optional[AshaCallResponse],
    summary="Get ASHA worker's incoming or active audio call (ASHA only)",
    description="Retrieves incoming requested or active audio call for the authenticated ASHA worker.",
)
async def get_asha_active(
    current_asha: dict = Depends(get_current_asha_worker),
):
    return await get_asha_active_call(current_asha)


# ==========================================
# 5. ASHA Call Decision: Accept or Reject (ASHA only)
# ==========================================

@router.post(
    "/asha-calls/{call_id}/decision",
    response_model=AshaCallResponse,
    summary="Accept or Reject an incoming audio call (ASHA only)",
    description="Allows the target ASHA worker to accept or decline the pending call request.",
)
async def decide_call(
    call_id: str,
    decision: AshaCallDecisionRequest,
    current_asha: dict = Depends(get_current_asha_worker),
):
    return await decide_asha_call(call_id, decision, current_asha)


# ==========================================
# 6. Cancel Audio Call (Patient only)
# ==========================================

@router.post(
    "/asha-calls/{call_id}/cancel",
    response_model=AshaCallResponse,
    summary="Cancel a requested audio call (Patient only)",
    description="Allows the initiating patient to cancel a call while it is still in 'requested' status.",
)
async def cancel_call(
    call_id: str,
    current_patient: dict = Depends(get_current_patient),
):
    return await cancel_asha_call(call_id, current_patient)


# ==========================================
# 7. End Audio Call (Patient or ASHA)
# ==========================================

@router.post(
    "/asha-calls/{call_id}/end",
    response_model=AshaCallResponse,
    summary="End an active audio call (Patient or ASHA)",
    description="Allows either authorized participant to terminate the call and record duration.",
)
async def end_call(
    call_id: str,
    user_payload: dict = Depends(get_current_user_payload),
):
    return await end_asha_call(call_id, user_payload)


# ==========================================
# 8. Call Details by Call ID
# ==========================================

@router.get(
    "/asha-calls/{call_id}",
    response_model=AshaCallResponse,
    summary="Get audio call status and session details by call ID",
    description="Allows participants or admin to query full call record and current status.",
)
async def get_call_by_id(
    call_id: str,
    user_payload: dict = Depends(get_current_user_payload),
):
    return await get_call_details(call_id, user_payload)


# ==========================================
# 8. WebRTC Audio Signaling WebSocket
# ==========================================

@router.websocket("/ws/asha-call/{session_id}")
async def asha_call_signaling_ws(
    websocket: WebSocket,
    session_id: str,
    token: Optional[str] = Query(None),
):
    """
    Authenticated WebSocket signaling endpoint for 2-way audio calls.
    Relays SDP offer, answer, and ICE candidate exchange between authorized Patient and ASHA worker.
    Reuses the global signaling_manager room connection infrastructure.
    """
    # 1. Authenticate user from JWT token parameter
    if not token:
        logger.warning(f"[ASHA Audio WS] Connection rejected: No token provided for session '{session_id}'")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    payload = decode_access_token(token)
    if not payload:
        logger.warning(f"[ASHA Audio WS] Connection rejected: Invalid token for session '{session_id}'")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_role = payload.get("role", "patient")
    user_id = payload.get("patient_id") or payload.get("worker_id") or payload.get("sub") or str(payload.get("user_id", ""))
    user_name = payload.get("full_name") or payload.get("name") or ("ASHA Worker" if user_role == "asha" else "Patient")

    # 2. Authorization check against MongoDB asha_calls record
    call_doc = await find_call_by_session_id(session_id)
    if not call_doc:
        logger.warning(
            f"[ASHA Audio WS] Connection rejected: Call session '{session_id}' not found."
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    doc_patient_id = call_doc.get("patient_id")
    doc_asha_id = call_doc.get("asha_worker_id")

    is_authorized = False
    if user_role == "patient" and (user_id == doc_patient_id or payload.get("patient_id") == doc_patient_id or payload.get("sub") == doc_patient_id):
        is_authorized = True
    elif user_role == "asha" and (user_id == doc_asha_id or payload.get("worker_id") == doc_asha_id or payload.get("sub") == doc_asha_id):
        is_authorized = True
    elif user_role == "admin":
        is_authorized = True

    if not is_authorized:
        logger.warning(
            f"[ASHA Audio WS] Connection rejected: User '{user_name}' ({user_role}) not authorized for session '{session_id}'"
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 3. Connect and register in signaling room
    user_info = {
        "user_id": user_id,
        "role": user_role,
        "name": user_name,
    }
    await signaling_manager.connect(session_id, websocket, user_info)

    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                message = json.loads(raw_text)
            except Exception:
                logger.warning(f"[ASHA Audio WS] Malformed JSON from {user_name}: {raw_text[:100]}")
                continue

            msg_type = message.get("type")

            # Relay WebRTC signaling payloads to peer
            if msg_type in ["offer", "answer", "ice-candidate", "media-toggle", "call-ended"]:
                message["sender_role"] = user_role
                message["sender_name"] = user_name
                await signaling_manager.broadcast_to_peer(session_id, websocket, message)

            elif msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

    except WebSocketDisconnect:
        disconnected_peer = signaling_manager.disconnect(session_id, websocket)
        if disconnected_peer:
            await signaling_manager.broadcast_to_peer(
                session_id,
                websocket,
                {
                    "type": "peer-left",
                    "role": user_role,
                    "name": user_name,
                },
            )
    except Exception as e:
        logger.error(f"[ASHA Audio WS] Unexpected error in session '{session_id}': {e}")
        signaling_manager.disconnect(session_id, websocket)
