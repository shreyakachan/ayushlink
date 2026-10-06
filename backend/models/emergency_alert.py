from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from pydantic import Field
from models.base import MongoBaseModel


class EmergencyAlert(MongoBaseModel):
    """
    MongoDB document model for Emergency SOS Alerts and software-simulated LoRa transmissions.
    Tracks real emergency lifecycle from patient trigger to ASHA/PHC acknowledgment and resolution.
    """
    alert_id: str = Field(..., description="Unique Emergency ID e.g. SOS-2026-1001")
    patient_id: str = Field(..., description="Patient ID who triggered the emergency")
    patient_name: str = Field(..., description="Full name of the patient")
    patient_phone: str = Field(..., description="Contact phone of the patient")
    village: str = Field(default="Chandapur", description="Village where emergency is located")
    asha_worker_id: Optional[str] = Field(default=None, description="Assigned ASHA Worker ID")
    phc_id: Optional[str] = Field(default=None, description="Assigned PHC ID or name")
    primary_phc: Optional[str] = Field(default=None, description="Primary Health Centre responsible")
    assigned_doctor_id: Optional[str] = Field(default=None, description="Doctor on duty at PHC")
    
    # Workflow Status
    # Progression: SOS_TRIGGERED -> LORA_TRANSMITTED -> GATEWAY_RECEIVED -> ASHA_NOTIFIED -> ASHA_ACKNOWLEDGED -> PHC_NOTIFIED -> AMBULANCE_DISPATCHED -> PATIENT_REACHED -> RESOLVED
    status: str = Field(default="SOS_TRIGGERED", description="High level emergency workflow status")
    lora_status: str = Field(default="TRANSMITTED", description="Simulated LoRa RF status (TRANSMITTED, RECEIVED, ACK_SENT)")
    asha_status: str = Field(default="PENDING", description="ASHA response status (PENDING, NOTIFIED, ACKNOWLEDGED, DISPATCHED)")
    phc_status: str = Field(default="PENDING", description="PHC response status (PENDING, NOTIFIED, ACKNOWLEDGED)")
    ambulance_status: str = Field(default="NOT_REQUESTED", description="Ambulance dispatch status (NOT_REQUESTED, REQUESTED, DISPATCHED, ARRIVED)")
    
    # Emergency Details
    emergency_type: str = Field(default="general_sos", description="Emergency category (general_sos, maternal_emergency, cardiac_sos, trauma, etc.)")
    emergency_notes: Optional[str] = Field(default=None, description="Additional context or notes from patient or responder")
    medical_snapshot: Dict[str, Any] = Field(default_factory=dict, description="Snapshot of blood group, allergies, chronic conditions")
    gps_coordinates: Optional[Dict[str, float]] = Field(default=None, description="Simulated/Device GPS coordinates {'lat': float, 'lng': float}")
    
    # Simulated LoRa RF Telemetry (Pure Software Simulation, No Physical Radio)
    packet_id: str = Field(default="", description="Simulated LoRa uplink packet ID e.g. LORA-PKT-1001")
    gateway_id: str = Field(default="GW-CHANDAPUR-PHC-01", description="Simulated LoRa Gateway Identifier")
    frequency: str = Field(default="865.2 MHz (IN865 - SIMULATED)", description="Simulated RF carrier frequency")
    spreading_factor: str = Field(default="SF10 (SIMULATED)", description="Simulated LoRa spreading factor")
    bandwidth: str = Field(default="125 kHz (SIMULATED)", description="Simulated LoRa channel bandwidth")
    rssi: int = Field(default=-104, description="Simulated Received Signal Strength Indicator in dBm")
    snr: float = Field(default=-6.5, description="Simulated Signal-to-Noise Ratio in dB")
    packet_size: int = Field(default=48, description="Simulated payload byte size")
    checksum: str = Field(default="0xA73F", description="Simulated CRC16 packet checksum")
    is_simulation: bool = Field(default=True, description="Explicit flag denoting software simulation")
    
    # Timestamps
    acknowledged_at: Optional[datetime] = Field(default=None, description="Timestamp when ASHA/Doctor acknowledged")
    resolved_at: Optional[datetime] = Field(default=None, description="Timestamp when emergency was marked resolved")
    resolution_notes: Optional[str] = Field(default=None, description="Final outcome notes upon resolution")
