from typing import List, Dict, Any
from fastapi import APIRouter, Depends, status, HTTPException
from schemas.emergency_alert import (
    EmergencySOSRequest,
    SimulatedLoRaPacket,
    EmergencyStatusUpdate,
    EmergencyAlertResponse,
    GatewayACKResponse,
)
from services.security import (
    get_current_patient,
    get_current_asha_worker,
    get_current_doctor,
    get_current_user_payload,
)
from services.lora_emergency_service import (
    trigger_patient_emergency_sos,
    process_lora_gateway_packet,
    get_active_emergency_alerts,
    update_emergency_status,
)

router = APIRouter(tags=["LoRa Emergency Response (Software Simulation)"])


# ==========================================
# 1. Trigger Patient Emergency SOS
# ==========================================

@router.post(
    "/emergency/sos",
    response_model=EmergencyAlertResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Trigger Emergency SOS (Patient only)",
    description="Authenticates the patient via JWT, creates a real emergency alert in MongoDB, simulates compact LoRa packet transmission, and dispatches high-priority alerts to the assigned ASHA worker and PHC Doctor.",
)
async def trigger_sos(
    body: EmergencySOSRequest,
    current_patient: dict = Depends(get_current_patient),
):
    return await trigger_patient_emergency_sos(body, current_patient)


# ==========================================
# 2. Simulated LoRa Gateway Ingest
# ==========================================

@router.post(
    "/lora/gateway/packet",
    response_model=GatewayACKResponse,
    status_code=status.HTTP_200_OK,
    summary="Simulated LoRa Gateway Packet Ingest",
    description="Simulates reception of a compact LoRa RF uplink packet by a village Gateway node (e.g. GW-CHANDAPUR-PHC-01), verifies CRC16 checksum, updates alert status and RF telemetry in MongoDB, and returns downlink ACK.",
)
async def ingest_gateway_packet(packet: SimulatedLoRaPacket):
    return await process_lora_gateway_packet(packet)


# ==========================================
# 3. Retrieve Active Emergency Alerts
# ==========================================

@router.get(
    "/emergency/alerts/active",
    response_model=List[EmergencyAlertResponse],
    summary="Get active emergency alerts (Role-filtered)",
    description="Retrieves active (unresolved) emergency alerts filtered by the caller's authenticated role (Patient sees own alert, ASHA sees village alerts, Doctor sees regional alerts).",
)
async def get_active_alerts(
    payload: dict = Depends(get_current_user_payload),
):
    role = payload.get("role")
    if role == "patient":
        user_doc = await get_current_patient(payload)
    elif role == "asha":
        user_doc = await get_current_asha_worker(payload)
    elif role == "doctor":
        user_doc = await get_current_doctor(payload)
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized role for emergency alerts.",
        )
    return await get_active_emergency_alerts(user_doc)


# ==========================================
# 4. Update Emergency Workflow Status
# ==========================================

@router.patch(
    "/emergency/alerts/{alert_id}/status",
    response_model=EmergencyAlertResponse,
    summary="Update emergency status (ASHA / Doctor / Patient)",
    description="Advances emergency status along the defined workflow (e.g. ASHA_ACKNOWLEDGED, AMBULANCE_DISPATCHED, PATIENT_REACHED, RESOLVED).",
)
async def update_alert_status(
    alert_id: str,
    body: EmergencyStatusUpdate,
    payload: dict = Depends(get_current_user_payload),
):
    role = payload.get("role")
    if role == "patient":
        user_doc = await get_current_patient(payload)
    elif role == "asha":
        user_doc = await get_current_asha_worker(payload)
    elif role == "doctor":
        user_doc = await get_current_doctor(payload)
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized role.",
        )
    return await update_emergency_status(alert_id, body, user_doc)
