import random
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId
from fastapi import HTTPException, status
from database import (
    get_collection,
    COLLECTION_PRESCRIPTIONS,
    COLLECTION_PATIENTS,
    COLLECTION_DOCTORS,
)
from schemas.prescription import (
    PrescriptionCreateRequest,
    PrescriptionResponse,
    MedicineItemSchema,
)
from services.medical_service import (
    find_patient_by_id_or_pid,
    check_asha_patient_access,
)


def doc_to_prescription_response(doc: dict) -> PrescriptionResponse:
    """Helper to convert MongoDB prescription document to clean PrescriptionResponse."""
    raw_medicines = doc.get("medicines", [])
    medicines = [
        MedicineItemSchema(
            name=m.get("name", ""),
            dosage=m.get("dosage", ""),
            frequency=m.get("frequency", "Twice daily"),
            duration=m.get("duration", ""),
            instructions=m.get("instructions"),
        )
        for m in raw_medicines
    ]

    return PrescriptionResponse(
        id=str(doc.get("_id")),
        prescription_id=doc.get("prescription_id") or str(doc.get("_id")),
        patient_id=doc.get("patient_id", ""),
        patient_name=doc.get("patient_name"),
        patient_village=doc.get("patient_village"),
        doctor_id=doc.get("doctor_id", ""),
        doctor_name=doc.get("doctor_name"),
        diagnosis=doc.get("diagnosis"),
        medicines=medicines,
        instructions=doc.get("instructions"),
        date=doc.get("date", datetime.now(timezone.utc)),
        status=doc.get("status", "active"),
        created_at=doc.get("created_at"),
    )


async def create_prescription(
    data: PrescriptionCreateRequest,
    current_doctor: dict,
) -> PrescriptionResponse:
    """Create and issue a digital prescription for a patient (Doctor only)."""
    # Verify patient exists
    patient_doc = await find_patient_by_id_or_pid(data.patient_id)
    if not patient_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{data.patient_id}' not found.",
        )

    prescriptions_col = get_collection(COLLECTION_PRESCRIPTIONS)
    doctors_col = get_collection(COLLECTION_DOCTORS)
    patients_col = get_collection(COLLECTION_PATIENTS)

    if prescriptions_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    # Generate unique Prescription ID e.g. RX-1042
    rx_num = random.randint(1000, 9999)
    prescription_id = f"RX-{rx_num}"

    now = datetime.now(timezone.utc)
    target_pid = patient_doc.get("patient_id") or str(patient_doc["_id"])
    doctor_id = current_doctor.get("doctor_id", str(current_doctor.get("_id")))

    rx_doc = {
        "prescription_id": prescription_id,
        "patient_id": target_pid,
        "patient_name": patient_doc.get("full_name"),
        "patient_village": patient_doc.get("village"),
        "doctor_id": doctor_id,
        "doctor_name": current_doctor.get("full_name"),
        "diagnosis": data.diagnosis or patient_doc.get("condition"),
        "medicines": [m.model_dump() for m in data.medicines],
        "instructions": data.instructions,
        "date": now,
        "status": data.status or "active",
        "facility": current_doctor.get("assigned_facility"),
        "created_at": now,
        "updated_at": now,
    }

    insert_result = await prescriptions_col.insert_one(rx_doc)
    rx_doc["_id"] = insert_result.inserted_id

    # Update doctor statistics
    if doctors_col is not None:
        await doctors_col.update_one(
            {"_id": current_doctor["_id"]},
            {"$inc": {"stats.prescriptions_signed": 1, "stats.consultations_completed": 1}},
        )

    # Append to patient's medical history
    if patients_col is not None:
        history_entry = {
            "id": prescription_id,
            "date": now.strftime("%d %b %Y"),
            "reason": data.diagnosis or "Consultation prescription",
            "doctor": current_doctor.get("full_name"),
        }
        await patients_col.update_one(
            {"_id": patient_doc["_id"]},
            {
                "$push": {"medical_history": history_entry},
                "$set": {"assigned_doctor_id": doctor_id, "updated_at": now},
            },
        )

    return doc_to_prescription_response(rx_doc)


async def get_patient_prescriptions(current_patient: dict) -> List[PrescriptionResponse]:
    """Retrieve all prescriptions issued for the authenticated patient."""
    prescriptions_col = get_collection(COLLECTION_PRESCRIPTIONS)
    if prescriptions_col is None:
        return []

    target_pid = current_patient.get("patient_id") or str(current_patient.get("_id"))
    cursor = prescriptions_col.find({"patient_id": target_pid}).sort("date", -1)

    results: List[PrescriptionResponse] = []
    async for doc in cursor:
        results.append(doc_to_prescription_response(doc))
    return results


async def get_asha_patient_prescriptions(
    patient_identifier: str,
    current_asha: dict,
) -> List[PrescriptionResponse]:
    """Retrieve prescriptions for a patient if authorized for the ASHA worker."""
    patient_doc = await find_patient_by_id_or_pid(patient_identifier)
    if not patient_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_identifier}' not found.",
        )

    # Check ASHA authorization
    if not check_asha_patient_access(current_asha, patient_doc):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access forbidden: ASHA Worker is not authorized for patient village '{patient_doc.get('village')}'.",
        )

    prescriptions_col = get_collection(COLLECTION_PRESCRIPTIONS)
    if prescriptions_col is None:
        return []

    target_pid = patient_doc.get("patient_id") or str(patient_doc["_id"])
    cursor = prescriptions_col.find({"patient_id": target_pid}).sort("date", -1)

    results: List[PrescriptionResponse] = []
    async for doc in cursor:
        results.append(doc_to_prescription_response(doc))
    return results


async def get_doctor_created_prescriptions(current_doctor: dict) -> List[PrescriptionResponse]:
    """Retrieve all prescriptions created by the authenticated doctor."""
    prescriptions_col = get_collection(COLLECTION_PRESCRIPTIONS)
    if prescriptions_col is None:
        return []

    doc_id = current_doctor.get("doctor_id") or str(current_doctor.get("_id"))
    cursor = prescriptions_col.find({"doctor_id": doc_id}).sort("date", -1)

    results: List[PrescriptionResponse] = []
    async for doc in cursor:
        results.append(doc_to_prescription_response(doc))
    return results


async def get_patient_prescriptions_for_doctor(
    patient_identifier: str,
    current_doctor: dict,
) -> List[PrescriptionResponse]:
    """Retrieve all prescriptions for a specific patient for an authenticated doctor."""
    patient_doc = await find_patient_by_id_or_pid(patient_identifier)
    if not patient_doc:
        return []

    prescriptions_col = get_collection(COLLECTION_PRESCRIPTIONS)
    if prescriptions_col is None:
        return []

    target_pid = patient_doc.get("patient_id") or str(patient_doc["_id"])
    cursor = prescriptions_col.find({"patient_id": target_pid}).sort("date", -1)

    results: List[PrescriptionResponse] = []
    async for doc in cursor:
        results.append(doc_to_prescription_response(doc))
    return results

