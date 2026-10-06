/**
 * AyushLink — Software-Only LoRa Emergency Simulator
 * 
 * IMPORTANT:
 * This is a 100% SOFTWARE SIMULATION for rural healthcare emergency response.
 * There is NO physical LoRa/RF hardware (no SX1278, ESP32, Bluetooth, or serial).
 * All telemetry fields are explicitly flagged with `is_simulation: true`.
 * 
 * It interacts with the real FastAPI + MongoDB backend:
 * - POST /api/emergency/sos
 * - POST /api/lora/gateway/packet
 * - GET /api/emergency/alerts/active
 * - PATCH /api/emergency/alerts/{alert_id}/status
 */

import { sendLoRaGatewayPacket } from "./api.js"

/**
 * Standard CRC16-CCITT implementation for software-simulated packet validation.
 * Polynomial: 0x1021, Initial: 0xFFFF. Matches backend calculate_crc16().
 *
 * @param {string|Uint8Array|Array<number>} data
 * @returns {string} Hex formatted string e.g. "0x4A1F"
 */
export function calculateCrc16(data) {
  let bytes = []
  if (typeof data === "string") {
    // UTF-8 string encoding
    for (let i = 0; i < data.length; i++) {
      const code = data.charCodeAt(i)
      if (code < 128) {
        bytes.push(code)
      } else {
        const encoded = unescape(encodeURIComponent(data[i]))
        for (let j = 0; j < encoded.length; j++) {
          bytes.push(encoded.charCodeAt(j))
        }
      }
    }
  } else if (Array.isArray(data) || data instanceof Uint8Array) {
    bytes = Array.from(data)
  }

  let crc = 0xffff
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff
      } else {
        crc = (crc << 1) & 0xffff
      }
    }
  }
  const hex = (crc >>> 0).toString(16).toUpperCase().padStart(4, "0")
  return `0x${hex}`
}

/**
 * Generate a unique simulated LoRa RF packet identifier.
 * Example format: "LORA-PKT-865-4821"
 *
 * @returns {string}
 */
export function generatePacketId() {
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `LORA-PKT-865-${rand}`
}

/**
 * Generate realistic simulated LoRa RF telemetry in the Indian 865-867 MHz band (IN865).
 *
 * @param {Object} [overrides={}] - Optional telemetry overrides
 * @returns {Object} Simulated telemetry dictionary
 */
export function generateTelemetry(overrides = {}) {
  // Realistic simulated RSSI: -92 dBm (near PHC) down to -112 dBm (remote edge)
  const simulatedRssi = overrides.rssi !== undefined 
    ? overrides.rssi 
    : Math.floor(-94 - Math.random() * 16)

  // Realistic simulated SNR: -3.5 dB to -8.5 dB
  const simulatedSnr = overrides.snr !== undefined 
    ? overrides.snr 
    : Number((-4.0 - Math.random() * 4.5).toFixed(1))

  return {
    frequency: overrides.frequency || "865.2 MHz (IN865 Band - SIMULATED)",
    band: "IN865",
    spreadingFactor: overrides.spreadingFactor || overrides.spreading_factor || "SF10 (SIMULATED)",
    bandwidth: overrides.bandwidth || "125 kHz (SIMULATED)",
    rssi: simulatedRssi,
    snr: simulatedSnr,
    packetSize: overrides.packetSize || overrides.packet_size || 48,
    gatewayId: overrides.gatewayId || overrides.gateway_id || "GW-CHANDAPUR-PHC-01",
    checksum: overrides.checksum || overrides.crc16 || "0xA73F",
    isSimulation: true,
  }
}

/**
 * Construct the simulated LoRa packet payload matching backend `SimulatedLoRaPacket` schema.
 *
 * @param {Object} emergencyData - Alert and patient context
 * @returns {Object} Packet payload for POST /api/lora/gateway/packet
 */
export function buildEmergencyPacket(emergencyData = {}) {
  const packetId = emergencyData.packet_id || emergencyData.packetId || generatePacketId()
  const alertId = emergencyData.alert_id || emergencyData.alertId || `SOS-2026-${Math.floor(1000 + Math.random() * 9000)}`
  const patientId = emergencyData.patient_id || emergencyData.patientId || "P-UNKNOWN"
  const gatewayId = emergencyData.gateway_id || emergencyData.gatewayId || "GW-CHANDAPUR-PHC-01"
  const village = emergencyData.village || "Chandapur"
  const emergencyType = emergencyData.emergency_type || emergencyData.emergencyType || "general_sos"

  const telemetry = generateTelemetry(emergencyData.telemetry || {})

  // Compute realistic frame and CRC16 checksum
  const frameString = `${packetId}|${alertId}|${patientId}|${village}|${emergencyType}|${new Date().toISOString()}`
  const calculatedCrc = calculateCrc16(frameString)

  // Hex representation of the simulated payload frame
  let rawHex = ""
  for (let i = 0; i < frameString.length; i++) {
    rawHex += frameString.charCodeAt(i).toString(16).padStart(2, "0")
  }

  return {
    packet_id: packetId,
    alert_id: alertId,
    patient_id: patientId,
    gateway_id: gatewayId,
    frequency: telemetry.frequency,
    spreading_factor: telemetry.spreadingFactor,
    bandwidth: telemetry.bandwidth,
    rssi: telemetry.rssi,
    snr: telemetry.snr,
    packet_size: emergencyData.packet_size || frameString.length,
    checksum: emergencyData.checksum || calculatedCrc,
    is_simulation: true,
    raw_payload_hex: rawHex.toUpperCase(),
  }
}

/**
 * Transmission Lifecycle Stages (Software Simulation):
 * 1. PACKET_PREPARING  — Packaging emergency payload & CRC16 checksum
 * 2. LORA_TRANSMITTING — Simulating 865MHz RF uplink transmission
 * 3. GATEWAY_RECEIVING — Uplink ingest at virtual village Gateway node
 * 4. GATEWAY_ACK       — Gateway downlink acknowledgment received & verified
 */
export const LORA_STAGES = {
  PREPARING: "PACKET_PREPARING",
  TRANSMITTING: "LORA_TRANSMITTING",
  RECEIVING: "GATEWAY_RECEIVING",
  ACK: "GATEWAY_ACK",
  FAILED: "TRANSMISSION_FAILED",
}

/**
 * Execute simulated LoRa packet transmission and ingest via real backend Gateway endpoint.
 *
 * @param {Object} packet - Packet built by buildEmergencyPacket()
 * @param {Function} [onProgress] - Optional stage callback (stage, metadata) => void
 * @returns {Promise<Object>} Backend GatewayACKResponse
 */
export async function simulateTransmission(packet, onProgress = null) {
  const notify = (stage, details = {}) => {
    if (typeof onProgress === "function") {
      try {
        onProgress({
          stage,
          packet_id: packet.packet_id,
          alert_id: packet.alert_id,
          gateway_id: packet.gateway_id,
          timestamp: new Date().toISOString(),
          is_simulation: true,
          ...details,
        })
      } catch (err) {
        console.warn("[LoRaSimulator] Progress listener error:", err)
      }
    }
  }

  try {
    // Stage 1: PACKET_PREPARING
    notify(LORA_STAGES.PREPARING, {
      message: "Encoding emergency payload and computing CRC16-CCITT frame checksum...",
      crc: packet.checksum,
    })
    await new Promise((r) => setTimeout(r, 120))

    // Stage 2: LORA_TRANSMITTING
    notify(LORA_STAGES.TRANSMITTING, {
      message: `Broadcasting uplink via simulated IN865 (SF: ${packet.spreading_factor}, BW: ${packet.bandwidth})...`,
      frequency: packet.frequency,
      rssi: packet.rssi,
      snr: packet.snr,
    })
    await new Promise((r) => setTimeout(r, 180))

    // Stage 3: GATEWAY_RECEIVING & Real Backend Ingest
    notify(LORA_STAGES.RECEIVING, {
      message: `Simulated Gateway ${packet.gateway_id} receiving and validating frame...`,
    })

    // Real API call to FastAPI backend: POST /api/lora/gateway/packet
    const ackResponse = await sendLoRaGatewayPacket(packet)

    // Stage 4: GATEWAY_ACK
    notify(LORA_STAGES.ACK, {
      message: `Gateway ACK confirmed: Dispatch Ticket #${ackResponse.dispatch_ticket_id}`,
      dispatch_ticket_id: ackResponse.dispatch_ticket_id,
      ack_checksum: ackResponse.ack_checksum,
      status: ackResponse.status,
      estimated_arrival_minutes: ackResponse.estimated_arrival_minutes,
      ack: ackResponse,
    })

    return ackResponse
  } catch (error) {
    notify(LORA_STAGES.FAILED, {
      message: `Simulated transmission failed: ${error.message || "Network or CRC Error"}`,
      error,
    })
    throw error
  }
}
