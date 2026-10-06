from typing import Optional, Dict, Any, List
from datetime import datetime
from pydantic import BaseModel, Field


class EmergencySOSRequest(BaseModel):
    """Payload sent by patient or field worker to trigger an emergency SOS."""
    emergency_type: str = Field(default="general_sos", description="Type of emergency (general_sos, maternal_emergency, cardiac_sos, trauma, etc.)")
    emergency_notes: Optional[str] = Field(default=None, description="Optional brief notes or context")
    gps_coordinates: Optional[Dict[str, float]] = Field(default=None, description="Optional latitude/longitude {'lat': 19.9975, 'lng': 73.7898}")
    simulated_telemetry: Optional[Dict[str, Any]] = Field(default=None, description="Optional custom simulation parameters (SF, frequency, etc.)")


class SimulatedLoRaPacket(BaseModel):
    """Software-simulated LoRa RF packet structure forwarded by virtual Gateway."""
    packet_id: str = Field(..., description="Unique simulated packet identifier")
    alert_id: str = Field(..., description="Target Emergency Alert identifier")
    patient_id: str = Field(..., description="Patient identifier")
    gateway_id: str = Field(default="GW-CHANDAPUR-PHC-01", description="Simulated Gateway ID")
    frequency: str = Field(default="865.2 MHz (IN865 Band - SIMULATED)", description="Simulated RF carrier frequency")
    spreading_factor: str = Field(default="SF10 (SIMULATED)", description="Simulated LoRa spreading factor")
    bandwidth: str = Field(default="125 kHz (SIMULATED)", description="Simulated channel bandwidth")
    rssi: int = Field(default=-104, description="Simulated RSSI in dBm")
    snr: float = Field(default=-6.5, description="Simulated SNR in dB")
    packet_size: int = Field(default=48, description="Simulated payload byte size")
    checksum: str = Field(default="0xA73F", description="Simulated CRC16 checksum")
    is_simulation: bool = Field(default=True, description="Flag explicitly declaring software simulation")
    raw_payload_hex: Optional[str] = Field(default=None, description="Simulated raw hexadecimal frame")


class EmergencyStatusUpdate(BaseModel):
    """Payload for updating emergency progression lifecycle by ASHA/Doctor."""
    status: str = Field(
        ...,
        description="Target status: SOS_TRIGGERED, LORA_TRANSMITTED, GATEWAY_RECEIVED, ASHA_NOTIFIED, ASHA_ACKNOWLEDGED, PHC_NOTIFIED, AMBULANCE_DISPATCHED, PATIENT_REACHED, RESOLVED"
    )
    asha_status: Optional[str] = Field(default=None, description="Updated ASHA response status (PENDING, ACKNOWLEDGED, DISPATCHED)")
    phc_status: Optional[str] = Field(default=None, description="Updated PHC response status (PENDING, ACKNOWLEDGED)")
    ambulance_status: Optional[str] = Field(default=None, description="Updated ambulance status (NOT_REQUESTED, REQUESTED, DISPATCHED, ARRIVED)")
    notes: Optional[str] = Field(default=None, description="Responder notes or resolution remarks")


class EmergencyAlertResponse(BaseModel):
    """Comprehensive response object representing an active or historic emergency alert."""
    id: Optional[str] = None
    alert_id: str
    patient_id: str
    patient_name: str
    patient_phone: str
    village: str
    asha_worker_id: Optional[str] = None
    asha_worker_name: Optional[str] = None
    asha_worker_phone: Optional[str] = None
    phc_id: Optional[str] = None
    primary_phc: Optional[str] = None
    assigned_doctor_id: Optional[str] = None
    status: str
    lora_status: str
    asha_status: str
    phc_status: str
    ambulance_status: str
    emergency_type: str
    emergency_notes: Optional[str] = None
    medical_snapshot: Dict[str, Any] = Field(default_factory=dict)
    gps_coordinates: Optional[Dict[str, float]] = None
    lora_telemetry: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    resolution_notes: Optional[str] = None


class GatewayACKResponse(BaseModel):
    """Simulated LoRa Downlink Acknowledgment (ACK) packet returned by village Gateway."""
    ack: bool = Field(default=True, description="Acknowledgment confirmation flag")
    packet_id: str = Field(..., description="Uplink packet ID that is acknowledged")
    alert_id: str = Field(..., description="Associated Emergency Alert identifier")
    gateway_id: str = Field(default="GW-CHANDAPUR-PHC-01", description="Gateway that processed the uplink")
    timestamp: datetime = Field(..., description="Timestamp of ACK generation")
    status: str = Field(default="GATEWAY_RECEIVED", description="Current emergency status")
    dispatch_ticket_id: str = Field(..., description="Emergency dispatch ticket code e.g. TKT-SOS-1001")
    ack_checksum: str = Field(..., description="Simulated CRC16 for downlink ACK")
    is_simulation: bool = Field(default=True, description="Flag explicitly declaring software simulation")
    rssi: int = Field(default=-104, description="Gateway measured RSSI")
    snr: float = Field(default=-6.5, description="Gateway measured SNR")
    estimated_arrival_minutes: Optional[int] = Field(default=8, description="Estimated responder ETA in minutes")
    alert: Optional[EmergencyAlertResponse] = Field(default=None, description="Updated full emergency alert object")
