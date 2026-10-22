import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from database import connect_to_mongo, close_mongo_connection, get_collection, COLLECTION_EMERGENCY_ALERTS, COLLECTION_PATIENTS, COLLECTION_ASHA_WORKERS
from services.security import create_access_token
from services.lora_emergency_service import trigger_patient_emergency_sos, get_active_emergency_alerts
from schemas.emergency_alert import EmergencySOSRequest

async def run_verification():
    print("==================================================================")
    print("   VERIFYING SIREN BEHAVIOR: ASHA-INITIATED VS PATIENT-INITIATED   ")
    print("==================================================================")
    await connect_to_mongo()

    patients_col = get_collection(COLLECTION_PATIENTS)
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)
    alerts_col = get_collection(COLLECTION_EMERGENCY_ALERTS)

    # 1. Load test ASHA worker (Pooja Sharma ASHA-340) and test patient (Sunita Devi P-101)
    asha_doc = await asha_col.find_one({"worker_id": "ASHA-340"})
    if not asha_doc:
        asha_doc = await asha_col.find_one({"is_active": True})
    assert asha_doc is not None, "ASHA worker not found"
    asha_doc["role"] = "asha"

    patient_doc = await patients_col.find_one({"patient_id": "P-101"})
    assert patient_doc is not None, "Patient P-101 not found"
    patient_doc["role"] = "patient"

    # Clean up prior alerts for Sunita Devi to start clean
    await alerts_col.update_many(
        {"patient_id": "P-101", "status": {"$ne": "RESOLVED"}},
        {"$set": {"status": "RESOLVED", "asha_status": "ACKNOWLEDGED"}}
    )

    print(f"\n[Test Setup] Using ASHA Worker: {asha_doc.get('full_name')} ({asha_doc.get('worker_id')})")
    print(f"[Test Setup] Using Patient: {patient_doc.get('full_name')} ({patient_doc.get('patient_id')}) in {patient_doc.get('village')}")

    # -------------------------------------------------------------------------
    # TEST 1: ASHA-INITIATED SOS
    # -------------------------------------------------------------------------
    print("\n[TEST 1] ASHA Worker triggers SOS for patient Sunita Devi...")
    req_asha = EmergencySOSRequest(
        patient_id="P-101",
        patient_name="Sunita Devi",
        village="Chandapur",
        emergency_type="general_sos",
        emergency_notes="Emergency SOS triggered by ASHA Worker for patient Sunita Devi (P-101)",
        caller_role="asha",
    )
    resp_asha = await trigger_patient_emergency_sos(req_asha, asha_doc)
    print(f"  -> Alert created: {resp_asha.alert_id}")
    print(f"  -> Caller role: {resp_asha.caller_role}")
    print(f"  -> Status: {resp_asha.status}")
    print(f"  -> PHC status: {resp_asha.phc_status}")

    # Check ASHA active alerts query (HomeScreen.jsx polling)
    asha_active = await get_active_emergency_alerts(asha_doc)
    print(f"  -> Active emergency alerts returned to ASHA dashboard: {len(asha_active)}")
    matching_asha_alerts = [a for a in asha_active if a.alert_id == resp_asha.alert_id]
    
    if len(matching_asha_alerts) == 0:
        print("  -> [PASS] ASHA-initiated alert is EXCLUDED from ASHA dashboard polling. Siren will NOT ring!")
    else:
        print("  -> [FAIL] ASHA-initiated alert was returned to ASHA dashboard!")
        assert len(matching_asha_alerts) == 0

    # Verify Doctor DOES see the emergency
    doc_user = {"role": "doctor", "doctor_id": "DOC-501"}
    doc_active = await get_active_emergency_alerts(doc_user)
    matching_doc_alerts = [a for a in doc_active if a.alert_id == resp_asha.alert_id]
    assert len(matching_doc_alerts) == 1, "Doctor should see the active emergency"
    print(f"  -> [PASS] Doctor active emergency alerts includes {resp_asha.alert_id} (phc_status={matching_doc_alerts[0].phc_status})")

    # -------------------------------------------------------------------------
    # TEST 2: PATIENT-INITIATED SOS
    # -------------------------------------------------------------------------
    print("\n[TEST 2] Patient Shreya triggers SOS from patient portal...")
    patient_shreya = await patients_col.find_one({"patient_id": "P-4559"})
    if not patient_shreya:
        patient_shreya = {"patient_id": "P-4559", "full_name": "Shreya", "village": "Chandapur", "role": "patient"}
    else:
        patient_shreya["role"] = "patient"

    # Clean up prior alerts for Shreya
    await alerts_col.update_many(
        {"patient_id": "P-4559", "status": {"$ne": "RESOLVED"}},
        {"$set": {"status": "RESOLVED", "asha_status": "ACKNOWLEDGED"}}
    )

    req_patient = EmergencySOSRequest(
        patient_id="P-4559",
        patient_name="Shreya",
        village="Chandapur",
        emergency_type="general_sos",
        emergency_notes="5-second hold triggered from EmergencySOSScreen",
        caller_role="patient",
    )
    resp_patient = await trigger_patient_emergency_sos(req_patient, patient_shreya)
    print(f"  -> Alert created: {resp_patient.alert_id}")
    print(f"  -> Caller role: {resp_patient.caller_role}")
    print(f"  -> Status: {resp_patient.status}")

    # Check ASHA active alerts query
    asha_active_2 = await get_active_emergency_alerts(asha_doc)
    print(f"  -> Active emergency alerts returned to ASHA dashboard: {len(asha_active_2)}")
    matching_patient_alerts = [a for a in asha_active_2 if a.alert_id == resp_patient.alert_id]

    if len(matching_patient_alerts) == 1:
        print("  -> [PASS] Patient-initiated alert IS returned to ASHA dashboard. Siren MUST ring!")
    else:
        print("  -> [FAIL] Patient-initiated alert was not returned to ASHA dashboard!")
        assert len(matching_patient_alerts) == 1

    # Cleanup test alert
    await alerts_col.update_one({"alert_id": resp_patient.alert_id}, {"$set": {"status": "RESOLVED", "asha_status": "ACKNOWLEDGED"}})
    await alerts_col.update_one({"alert_id": resp_asha.alert_id}, {"$set": {"status": "RESOLVED", "asha_status": "ACKNOWLEDGED"}})

    print("\n==================================================================")
    print("   ALL SIREN BEHAVIOR TESTS PASSED PERFECTLY!   ")
    print("==================================================================")
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(run_verification())
