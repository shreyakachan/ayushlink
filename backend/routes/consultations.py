import json
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, status, HTTPException, WebSocket, WebSocketDisconnect, Query
from schemas.consultation import (
    ConsultationCreateRequest,
    ConsultationDecisionRequest,
    ConsultationStatusUpdateRequest,
    DoctorConsultationSubmitRequest,
    ConsultationResponse,
)
from services.security import (
    get_current_user_payload,
    get_current_doctor,
    get_current_patient,
    get_current_asha_worker,
    decode_access_token,
)
from services.consultation_service import (
    create_consultation_request,
    doctor_decide_consultation,
    update_consultation_status,
    submit_doctor_consultation,
    get_patient_consultations_history,
    get_consultations_history,
    get_patient_active_video_request,
    get_doctor_video_requests,
    end_consultation_call,
    find_consultation_by_id,
)
from services.teleconsultation_signaling import signaling_manager

logger = logging.getLogger("ayushlink.consultations")
router = APIRouter(tags=["Doctor-Patient Consultations"])


# ==========================================
# 1. Consultation Request Creation
# ==========================================

@router.post(
    "/consultations/request",
    response_model=ConsultationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create consultation request (Patient or ASHA)",
    description="Initiates a consultation request with urgency, symptoms, reason, and preps video-call room session state.",
)
async def request_consultation(
    data: ConsultationCreateRequest,
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
            detail="Only patients and ASHA workers can create consultation requests.",
        )
    return await create_consultation_request(data, user_doc)


# ==========================================
# 2. Doctor Submit / Complete Consultation
# ==========================================

@router.post(
    "/doctor/consultations",
    response_model=ConsultationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit and save doctor consultation (Doctor only)",
    description="Allows a Doctor to save clinical diagnosis, notes, prescription medicines, advice, and complete a consultation.",
)
async def doctor_submit_consultation(
    consultation_data: DoctorConsultationSubmitRequest,
    current_doctor: dict = Depends(get_current_doctor),
):
    return await submit_doctor_consultation(consultation_data, current_doctor)


@router.post(
    "/consultations/submit",
    response_model=ConsultationResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
async def doctor_submit_consultation_alias(
    consultation_data: DoctorConsultationSubmitRequest,
    current_doctor: dict = Depends(get_current_doctor),
):
    return await submit_doctor_consultation(consultation_data, current_doctor)


# ==========================================
# 3. Patient Consultation History for Doctor
# ==========================================

@router.get(
    "/doctor/patients/{patient_id}/consultations",
    response_model=List[ConsultationResponse],
    summary="View patient consultation history (Doctor only)",
    description="Retrieves previous consultation records, diagnoses, and notes for a specific patient.",
)
async def view_patient_consultations(
    patient_id: str,
    current_doctor: dict = Depends(get_current_doctor),
):
    return await get_patient_consultations_history(patient_id, current_doctor)


@router.get(
    "/consultations/patient/{patient_id}",
    response_model=List[ConsultationResponse],
    include_in_schema=False,
)
async def view_patient_consultations_alias(
    patient_id: str,
    current_doctor: dict = Depends(get_current_doctor),
):
    return await get_patient_consultations_history(patient_id, current_doctor)


# ==========================================
# 4. Doctor Accept / Reject Decision
# ==========================================

@router.post(
    "/consultations/{consultation_id}/decision",
    response_model=ConsultationResponse,
    summary="Accept or Reject consultation request (Doctor only)",
    description="Allows a Doctor to accept or decline a pending consultation request, assigns doctor ID, and readies the video session.",
)
async def decide_consultation(
    consultation_id: str,
    decision: ConsultationDecisionRequest,
    current_doctor: dict = Depends(get_current_doctor),
):
    return await doctor_decide_consultation(consultation_id, decision, current_doctor)


# ==========================================
# 5. Status Progress Update
# ==========================================

@router.patch(
    "/consultations/{consultation_id}/status",
    response_model=ConsultationResponse,
    summary="Update consultation status (in_progress, completed, cancelled)",
    description="Updates the progress status of a consultation and syncs call session state.",
)
async def update_status(
    consultation_id: str,
    status_data: ConsultationStatusUpdateRequest,
    payload: dict = Depends(get_current_user_payload),
):
    return await update_consultation_status(consultation_id, status_data, payload)


# ==========================================
# 6. Consultation History & Queue Retrieval
# ==========================================

@router.get(
    "/consultations/history",
    response_model=List[ConsultationResponse],
    summary="Retrieve consultation history & queue",
    description="Returns consultation history relevant to the caller's role (Patient sees own, Doctor sees assigned/queue, ASHA sees assigned villages).",
)
async def get_history(
    payload: dict = Depends(get_current_user_payload),
):
    role = payload.get("role")
    if role == "patient":
        user_doc = await get_current_patient(payload)
    elif role == "doctor":
        user_doc = await get_current_doctor(payload)
    elif role == "asha":
        user_doc = await get_current_asha_worker(payload)
    else:
        user_doc = payload
    return await get_consultations_history(user_doc)


@router.get(
    "/consultations",
    response_model=List[ConsultationResponse],
    include_in_schema=False,
)
async def get_history_alias(payload: dict = Depends(get_current_user_payload)):
    return await get_history(payload)


# ==========================================
# 7. Active Video Request & Doctor Video Triage
# ==========================================

@router.get(
    "/consultations/active-request",
    response_model=Optional[ConsultationResponse],
    summary="Get patient's active video consultation request (Patient only)",
    description="Retrieves any currently requested, accepted, or active video consultation request for the authenticated patient without creating new records.",
)
async def get_my_active_video_request(
    current_patient: dict = Depends(get_current_patient),
):
    return await get_patient_active_video_request(current_patient)


@router.get(
    "/doctor/video-requests",
    response_model=List[ConsultationResponse],
    summary="Get pending video consultation requests (Doctor only)",
    description="Retrieves all pending or accepted video consultation requests for doctor review and acceptance.",
)
async def doctor_get_video_requests(
    current_doctor: dict = Depends(get_current_doctor),
):
    return await get_doctor_video_requests(current_doctor)


@router.post(
    "/consultations/{consultation_id}/end-call",
    response_model=ConsultationResponse,
    summary="End an active video consultation call",
    description="Updates consultation status to completed and records call ended timestamps.",
)
async def end_call_endpoint(
    consultation_id: str,
    payload: dict = Depends(get_current_user_payload),
):
    return await end_consultation_call(consultation_id, payload)


# ==========================================
# 8. WebRTC WebSocket Signaling Endpoint
# ==========================================

@router.websocket("/ws/teleconsultation/{session_id}")
async def teleconsultation_signaling_ws(
    websocket: WebSocket,
    session_id: str,
    token: Optional[str] = Query(None),
):
    """
    Secure WebRTC signaling WebSocket endpoint.
    Handles SDP offer, answer, and ICE candidate exchange between authorized Patient and Doctor.
    """
    # 1. Authenticate user from JWT token parameter
    if not token:
        logger.warning(f"[WebRTC WS] Connection rejected: No token provided for session '{session_id}'")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    payload = decode_access_token(token)
    if not payload:
        logger.warning(f"[WebRTC WS] Connection rejected: Invalid token for session '{session_id}'")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_role = payload.get("role", "patient")
    user_id = payload.get("patient_id") or payload.get("doctor_id") or payload.get("sub") or str(payload.get("user_id", ""))
    user_name = payload.get("full_name") or payload.get("name") or ("Doctor" if user_role == "doctor" else "Patient")

    # 2. Authorization check against MongoDB consultation record
    # Support lookup by consultation_id (CONS-1234) or room_id (room_cons-1234)
    cons_id_lookup = session_id
    if session_id.startswith("room_"):
        cons_id_lookup = session_id[5:].upper()

    cons_doc = await find_consultation_by_id(cons_id_lookup)
    if not cons_doc and session_id != cons_id_lookup:
        cons_doc = await find_consultation_by_id(session_id)

    # If consultation found, verify that caller is the assigned patient or doctor
    if cons_doc:
        doc_patient_id = cons_doc.get("patient_id")
        doc_doctor_id = cons_doc.get("doctor_id")
        
        is_authorized = False
        if user_role == "patient" and (user_id == doc_patient_id or payload.get("patient_id") == doc_patient_id or payload.get("full_name") == cons_doc.get("patient_name")):
            is_authorized = True
        elif user_role == "doctor" and (not doc_doctor_id or user_id == doc_doctor_id or payload.get("doctor_id") == doc_doctor_id):
            is_authorized = True
        elif user_role in ["admin", "asha"]:
            is_authorized = True

        if not is_authorized:
            logger.warning(f"[WebRTC WS] Connection rejected: User '{user_name}' ({user_role}) not authorized for consultation '{session_id}'")
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
                logger.warning(f"[WebRTC WS] Malformed JSON from {user_name}: {raw_text[:100]}")
                continue

            msg_type = message.get("type")

            # Relay WebRTC signaling payloads to peer
            if msg_type in ["offer", "answer", "ice-candidate", "media-toggle", "call-ended"]:
                # Attach sender metadata
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
                    "role": disconnected_peer["role"],
                    "name": disconnected_peer["name"],
                },
            )
    except Exception as e:
        logger.warning(f"[WebRTC WS] Session error in '{session_id}': {e}")
        signaling_manager.disconnect(session_id, websocket)


