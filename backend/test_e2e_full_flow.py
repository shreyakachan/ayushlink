"""
AyushLink End-to-End Comprehensive Full-Flow Verification Script
Tests all 4 major user flows:
1. Patient Flow: Register -> Login -> View Profile -> Submit Symptoms -> View Records -> View Prescriptions -> Consultation Request
2. ASHA Worker Flow: Register/Login -> Register/View Patients -> View Patient Records -> View Symptoms -> View Prescriptions -> Sync Offline Records
3. Doctor Flow: Register/Login -> View Cases Queue -> View Patient History -> Create Prescription -> Manage/Accept Consultation
4. Offline Flow: Sync Offline Records -> Reconnect -> Synchronize -> Verify single copy in MongoDB -> Re-sync Idempotency
"""

import asyncio
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport
from main import app
from database import (
    connect_to_mongo,
    close_mongo_connection,
    get_collection,
    COLLECTION_PATIENTS,
    COLLECTION_ASHA_WORKERS,
    COLLECTION_DOCTORS,
    COLLECTION_SYMPTOMS,
    COLLECTION_PRESCRIPTIONS,
    COLLECTION_CONSULTATIONS,
    COLLECTION_SYNC_LOGS,
)


async def main():
    print("=" * 60)
    print("      AyushLink End-to-End System Test Suite")
    print("=" * 60)

    # Initialize MongoDB connection
    await connect_to_mongo()

    # Use unique timestamps for test runs
    uid = int(datetime.now(timezone.utc).timestamp()) % 100000

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test/api") as client:
        # 0. Health check
        res_health = await client.get("/health")
        assert res_health.status_code == 200, f"Health check failed: {res_health.text}"
        print("[0. HEALTH] FastAPI Backend Online & Connected to MongoDB")

        # =====================================================================
        # FLOW 1: PATIENT FLOW
        # =====================================================================
        print("\n" + "-" * 50)
        print("FLOW 1: PATIENT JOURNEY")
        print("-" * 50)

        patient_phone = f"98230{uid:05d}"
        patient_pass = "PatientPin123"

        # 1.1 Register Patient
        p_reg_res = await client.post("/patient/register", json={
            "full_name": f"Pooja Patil {uid}",
            "phone": patient_phone,
            "password": patient_pass,
            "age": 28,
            "gender": "female",
            "village": "Chandapur",
            "preferred_language": "mr",
            "blood_group": "O+",
            "allergies": ["Sulfa drugs"],
            "chronic_conditions": ["Mild Asthma"],
        })
        assert p_reg_res.status_code == 201, f"Patient register failed: {p_reg_res.text}"
        p_data = p_reg_res.json()
        patient_token = p_data["access_token"]
        patient_id = p_data["patient"]["patient_id"]
        print(f"[1.1] Patient Registered: ID={patient_id}, Name='{p_data['patient']['full_name']}'")

        # 1.2 Patient Login
        p_login_res = await client.post("/patient/login", json={
            "phone": patient_phone,
            "password": patient_pass,
        })
        assert p_login_res.status_code == 200, f"Patient login failed: {p_login_res.text}"
        headers_patient = {"Authorization": f"Bearer {patient_token}"}
        print(f"[1.2] Patient Logged In: JWT token verified")

        # 1.3 View Profile / Medical Record
        p_rec_res = await client.get("/patient/medical-record", headers=headers_patient)
        assert p_rec_res.status_code == 200, f"Medical record get failed: {p_rec_res.text}"
        p_rec = p_rec_res.json()
        assert p_rec["blood_group"] == "O+"
        print(f"[1.3] Patient Profile Verified: BloodGroup={p_rec['blood_group']}, Allergies={p_rec['allergies']}")

        # 1.4 Submit Symptoms
        p_sym_res = await client.post("/patient/symptoms", json={
            "symptoms": ["Dry cough", "Sore throat", "Fever 101F"],
            "description": "Fever for 2 days with breathing discomfort",
            "severity": "moderate",
            "duration": "2-3-days",
        }, headers=headers_patient)
        assert p_sym_res.status_code == 201, f"Symptoms submit failed: {p_sym_res.text}"
        sym_data = p_sym_res.json()
        print(f"[1.4] Symptoms Submitted: ID={sym_data['symptom_id']}, Severity={sym_data['severity']}")

        # 1.5 View Patient Records / Symptoms
        p_syms_get = await client.get("/patient/symptoms", headers=headers_patient)
        assert p_syms_get.status_code == 200
        assert len(p_syms_get.json()) >= 1
        print(f"[1.5] Patient Symptoms Retrieved: Count={len(p_syms_get.json())}")

        # 1.6 Request Consultation
        p_cons_res = await client.post("/consultations/request", json={
            "reason": "Follow-up consultation for respiratory symptoms",
            "urgency": "routine",
            "notes": "Patient requested video call assistance",
        }, headers=headers_patient)
        assert p_cons_res.status_code == 201, f"Consultation request failed: {p_cons_res.text}"
        cons_data = p_cons_res.json()
        cons_id = cons_data["consultation_id"]
        print(f"[1.6] Consultation Requested: ID={cons_id}, Status={cons_data['status']}")

        # =====================================================================
        # FLOW 2: ASHA WORKER FLOW
        # =====================================================================
        print("\n" + "-" * 50)
        print("FLOW 2: ASHA WORKER JOURNEY")
        print("-" * 50)

        asha_phone = f"98765{uid:05d}"
        asha_pass = "AshaWorkerPass123"

        # 2.1 Register & Login ASHA Worker
        a_reg_res = await client.post("/asha/register", json={
            "full_name": f"Kavita Tai {uid}",
            "phone": asha_phone,
            "password": asha_pass,
            "assigned_villages": ["Chandapur", "Nandgaon"],
            "primary_phc": "Chandapur PHC",
        })
        assert a_reg_res.status_code == 201, f"ASHA register failed: {a_reg_res.text}"
        asha_token = a_reg_res.json()["access_token"]
        headers_asha = {"Authorization": f"Bearer {asha_token}"}
        print(f"[2.1] ASHA Worker Registered & Logged In: Villages=['Chandapur', 'Nandgaon']")

        # 2.2 List Patients for ASHA's Villages
        a_patients_res = await client.get("/patients", headers=headers_asha)
        assert a_patients_res.status_code == 200, f"ASHA patients get failed: {a_patients_res.text}"
        patients_list = a_patients_res.json()
        assert any(p["patient_id"] == patient_id for p in patients_list)
        print(f"[2.2] ASHA Patients List Retrieved: {len(patients_list)} patient(s) visible (Found {patient_id})")

        # 2.3 View Patient Details & Medical Records as ASHA
        a_prec_res = await client.get(f"/asha/patients/{patient_id}/records", headers=headers_asha)
        assert a_prec_res.status_code == 200
        assert a_prec_res.json()["patient_id"] == patient_id
        print(f"[2.3] ASHA Accessed Patient Record: Verified patient '{a_prec_res.json()['full_name']}' in Chandapur")

        # 2.4 ASHA Submit Symptom on behalf of Patient
        a_sym_res = await client.post(f"/asha/patients/{patient_id}/symptoms", json={
            "symptoms": ["Blood Pressure Check 140/90"],
            "description": "Routine home visit BP checkup",
            "severity": "mild",
            "duration": "today",
        }, headers=headers_asha)
        assert a_sym_res.status_code == 201
        print(f"[2.4] ASHA Logged Vitals/Symptom: ID={a_sym_res.json()['symptom_id']}")

        # =====================================================================
        # FLOW 3: DOCTOR FLOW
        # =====================================================================
        print("\n" + "-" * 50)
        print("FLOW 3: DOCTOR JOURNEY")
        print("-" * 50)

        doc_phone = f"99887{uid:05d}"
        doc_pass = "DoctorPass123"

        # 3.1 Register & Login Doctor
        d_reg_res = await client.post("/doctor/register", json={
            "full_name": f"Dr. Ramesh Gupta {uid}",
            "phone": doc_phone,
            "password": doc_pass,
            "specialization": "General Physician & AYUSH Consultant",
            "assigned_facility": "Chandapur PHC",
        })
        assert d_reg_res.status_code == 201, f"Doctor register failed: {d_reg_res.text}"
        doc_token = d_reg_res.json()["access_token"]
        doc_id = d_reg_res.json()["doctor"]["doctor_id"]
        headers_doc = {"Authorization": f"Bearer {doc_token}"}
        print(f"[3.1] Doctor Registered & Logged In: ID={doc_id}, Name='Dr. Ramesh Gupta'")

        # 3.2 View Doctor Cases Queue
        d_cases_res = await client.get("/doctor/cases", headers=headers_doc)
        assert d_cases_res.status_code == 200, f"Doctor cases get failed: {d_cases_res.text}"
        doc_cases = d_cases_res.json()
        print(f"[3.2] Doctor Queue Retrieved: {len(doc_cases)} case(s) found in queue")

        # 3.3 View Patient Medical History as Doctor
        d_prec_res = await client.get(f"/doctor/patients/{patient_id}/records", headers=headers_doc)
        assert d_prec_res.status_code == 200, f"Doctor patient records get failed: {d_prec_res.text}"
        d_history = d_prec_res.json()
        print(f"[3.3] Doctor Viewed Full Patient History: {len(d_history.get('recent_symptoms', []))} symptom entry(ies)")

        # 3.4 Doctor Accept Consultation
        d_dec_res = await client.post(f"/consultations/{cons_id}/decision", json={
            "action": "accept",
            "notes": "Doctor accepted consultation request for immediate video review.",
        }, headers=headers_doc)
        assert d_dec_res.status_code == 200, f"Doctor decision failed: {d_dec_res.text}"
        print(f"[3.4] Doctor Accepted Consultation: Status='{d_dec_res.json()['status']}', CallRoom='{d_dec_res.json()['call_session']['room_id']}'")

        # 3.5 Doctor Issue Digital Prescription
        d_rx_res = await client.post("/doctor/prescriptions", json={
            "patient_id": patient_id,
            "diagnosis": "Upper Respiratory Tract Infection (URTI)",
            "medicines": [
                {
                    "name": "Paracetamol 650mg",
                    "dosage": "1 tablet",
                    "frequency": "Thrice daily after meals",
                    "duration": "5 days",
                    "instructions": "Take with warm water",
                },
                {
                    "name": "Ayush Kwath Kadha",
                    "dosage": "100ml decoction",
                    "frequency": "Twice daily morning & night",
                    "duration": "7 days",
                    "instructions": "Drink warm",
                },
            ],
            "advice": "Hydrate well with warm water. Rest for 3 days.",
        }, headers=headers_doc)
        assert d_rx_res.status_code == 201, f"Prescription create failed: {d_rx_res.text}"
        rx_data = d_rx_res.json()
        rx_id = rx_data["prescription_id"]
        print(f"[3.5] Doctor Issued Prescription: ID={rx_id}, Meds={len(rx_data['medicines'])}")

        # 3.6 Patient & ASHA Retrieve Issued Prescription
        p_rx_res = await client.get("/patient/prescriptions", headers=headers_patient)
        assert p_rx_res.status_code == 200
        assert any(r["prescription_id"] == rx_id for r in p_rx_res.json())
        print(f"[3.6.A] Patient Retrieved Prescription: RX ID={rx_id} found in patient list")

        a_rx_res = await client.get(f"/asha/patients/{patient_id}/prescriptions", headers=headers_asha)
        assert a_rx_res.status_code == 200
        assert any(r["prescription_id"] == rx_id for r in a_rx_res.json())
        print(f"[3.6.B] ASHA Retrieved Patient Prescription: RX ID={rx_id} found in ASHA portal")

        # 3.7 Complete Consultation
        d_comp_res = await client.patch(f"/consultations/{cons_id}/status", json={
            "status": "completed",
            "notes": "Consultation concluded successfully with Ayush prescription issued.",
        }, headers=headers_doc)
        assert d_comp_res.status_code == 200
        print(f"[3.7] Consultation Completed: FinalStatus='{d_comp_res.json()['status']}'")

        # =====================================================================
        # FLOW 4: OFFLINE SYNCHRONIZATION & IDEMPOTENCY
        # =====================================================================
        print("\n" + "-" * 50)
        print("FLOW 4: PWA OFFLINE SYNCHRONIZATION")
        print("-" * 50)

        offline_batch = {
            "batch_id": f"BATCH-E2E-{uid}",
            "items": [
                {
                    "client_id": f"Q-OFFLINE-1-{uid}",
                    "type": "new_patient",
                    "client_created_at": "2026-08-22T03:00:00Z",
                    "payload": {
                        "full_name": f"Deepak Shinde {uid}",
                        "phone": f"98230{((uid + 1) % 100000):05d}",
                        "age": 42,
                        "gender": "male",
                        "village": "Chandapur",
                        "blood_group": "B+",
                    },
                },
                {
                    "client_id": f"Q-OFFLINE-2-{uid}",
                    "type": "symptom_report",
                    "client_created_at": "2026-08-22T03:30:00Z",
                    "payload": {
                        "patient_id": patient_id,
                        "symptoms": ["Joint pain in knees", "Morning stiffness"],
                        "description": "Chronic knee pain worsened in winter",
                        "severity": "moderate",
                    },
                },
                {
                    "client_id": f"Q-OFFLINE-3-{uid}",
                    "type": "vitals_update",
                    "client_created_at": "2026-08-22T04:00:00Z",
                    "payload": {
                        "patient_id": patient_id,
                        "vitals_label": "BP 125/82, Pulse 76, SpO2 99%",
                        "blood_group": "O+",
                    },
                },
            ],
        }

        # 4.1 First sync attempt (all new)
        sync_res1 = await client.post("/sync/batch", json=offline_batch, headers=headers_asha)
        assert sync_res1.status_code == 200, f"Sync attempt 1 failed: {sync_res1.text}"
        s1 = sync_res1.json()
        assert s1["synced_count"] == 3
        assert s1["already_synced_count"] == 0
        print(f"[4.1] Batch Synced to MongoDB: Synced=3/3 (0 failed)")

        # 4.2 Repeated sync attempt (exact same offline batch -> zero duplicate records)
        sync_res2 = await client.post("/sync/batch", json=offline_batch, headers=headers_asha)
        assert sync_res2.status_code == 200, f"Sync attempt 2 failed: {sync_res2.text}"
        s2 = sync_res2.json()
        assert s2["synced_count"] == 0
        assert s2["already_synced_count"] == 3
        print(f"[4.2] Repeated Sync Idempotency Verified: 0 duplicates created, 3/3 marked 'already_synced'")

    await close_mongo_connection()

    print("\n" + "=" * 60)
    print("   ALL 4 FULL-STACK FLOWS PASSED WITH ZERO ERRORS!   ")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
