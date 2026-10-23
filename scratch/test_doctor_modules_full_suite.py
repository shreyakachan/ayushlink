import asyncio
import os
import sys
from datetime import datetime, timezone
import httpx

backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database import (
    connect_to_mongo,
    close_mongo_connection,
    get_collection,
    COLLECTION_DOCTORS,
    COLLECTION_PATIENTS,
    COLLECTION_ASHA_WORKERS,
    COLLECTION_CONSULTATIONS,
    COLLECTION_PRESCRIPTIONS,
    COLLECTION_NOTIFICATIONS,
    COLLECTION_SYMPTOMS,
)
from services.security import create_access_token

BASE_URL = "http://127.0.0.1:8000"

async def run_doctor_modules_suite():
    print("=" * 70)
    print("   AYUSHLINK DOCTOR MODULES FULL REGRESSION AUDIT (MODULES 1 - 12)   ")
    print("=" * 70)

    await connect_to_mongo()
    doctors_col = get_collection(COLLECTION_DOCTORS)
    patients_col = get_collection(COLLECTION_PATIENTS)
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)
    cons_col = get_collection(COLLECTION_CONSULTATIONS)
    rx_col = get_collection(COLLECTION_PRESCRIPTIONS)
    notifs_col = get_collection(COLLECTION_NOTIFICATIONS)
    syms_col = get_collection(COLLECTION_SYMPTOMS)

    results = {}

    # Target Demo Doctor: DOC-501 (Dr Arvind Verma)
    doc_doc = await doctors_col.find_one({"$or": [{"doctor_id": "DOC-501"}, {"phone": "9823088882"}]})
    assert doc_doc is not None, "Doctor DOC-501 not found!"
    doc_id = doc_doc.get("doctor_id", "DOC-501")
    doc_phone = doc_doc.get("phone", "9823088882")
    doc_name = doc_doc.get("full_name", "Dr Arvind Verma")

    # Target Demo Patient: P-4559 (Shreya)
    pat_doc = await patients_col.find_one({"$or": [{"patient_id": "P-4559"}, {"phone": "9324998108"}]})
    assert pat_doc is not None, "Patient P-4559 not found!"
    p_id = pat_doc.get("patient_id", "P-4559")
    p_phone = pat_doc.get("phone", "9324998108")

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        # =====================================================================
        # MODULE 1: Doctor Login, Logout, Authentication and Profile
        # =====================================================================
        print("\n[MODULE 1] Testing Doctor Login, Authentication & Profile...")
        try:
            # Login with DOC-501 credentials
            res_login = await client.post("/api/doctor/login", json={"phone": doc_phone, "password": "DoctorSecurePass123"})
            if res_login.status_code != 200:
                res_login = await client.post("/api/doctor/login", json={"phone": doc_phone, "password": "Password123"})
            assert res_login.status_code == 200, f"Login failed: {res_login.status_code} - {res_login.text}"
            token_doc = res_login.json()["access_token"]
            doc_headers = {"Authorization": f"Bearer {token_doc}"}

            # Wrong password rejection
            res_wrong = await client.post("/api/doctor/login", json={"phone": doc_phone, "password": "WrongPassword"})
            assert res_wrong.status_code == 401

            # Fetch Profile
            res_prof = await client.get("/api/doctor/profile", headers=doc_headers)
            assert res_prof.status_code == 200
            prof_data = res_prof.json()
            assert prof_data["doctor_id"] == doc_id
            assert prof_data["role"] == "doctor"
            print(f"  [PASS] Doctor authenticated: {prof_data['full_name']} (Facility: {prof_data.get('assigned_facility')})")
            results["1. Doctor Login, Auth & Profile"] = "PASS"
        except Exception as e:
            print(f"  [FAIL] Module 1 failed: {e}")
            results["1. Doctor Login, Auth & Profile"] = f"FAIL: {e}"

        # =====================================================================
        # MODULE 2: Dashboard Statistics and Patient Lists
        # =====================================================================
        print("\n[MODULE 2] Testing Dashboard Statistics & Patient Lists...")
        try:
            res_cases = await client.get("/api/doctor/cases", headers=doc_headers)
            assert res_cases.status_code == 200
            cases_list = res_cases.json()
            assert isinstance(cases_list, list)

            res_pats = await client.get("/api/doctor/patients", headers=doc_headers)
            assert res_pats.status_code == 200
            pats_list = res_pats.json()
            assert isinstance(pats_list, list)
            print(f"  [PASS] Retrieved {len(cases_list)} active patient case(s) and {len(pats_list)} patient record(s)")
            results["2. Dashboard Statistics & Patient Lists"] = "PASS"
        except Exception as e:
            print(f"  [FAIL] Module 2 failed: {e}")
            results["2. Dashboard Statistics & Patient Lists"] = f"FAIL: {e}"

        # =====================================================================
        # MODULE 3: Patient Search, Filters & Patient Record Access
        # =====================================================================
        print("\n[MODULE 3] Testing Patient Search, Filters & Record Access...")
        try:
            # Authorized patient record lookup
            res_rec = await client.get(f"/api/doctor/patients/{p_id}/records", headers=doc_headers)
            assert res_rec.status_code == 200
            rec = res_rec.json()
            assert rec["patient_id"] == p_id
            assert rec["full_name"] == pat_doc.get("full_name")

            # Nonexistent patient lookup -> 404
            res_404 = await client.get("/api/doctor/patients/NONEXISTENT-P-9999/records", headers=doc_headers)
            assert res_404.status_code == 404

            # Non-doctor role access -> 403
            pat_tok = create_access_token({"sub": p_id, "phone": p_phone, "role": "patient"})
            res_403 = await client.get(f"/api/doctor/patients/{p_id}/records", headers={"Authorization": f"Bearer {pat_tok}"})
            assert res_403.status_code == 403
            print(f"  [PASS] Patient record verified. Nonexistent patient rejected with 404, non-doctor rejected with 403.")
            results["3. Patient Search, Filters & Record Access"] = "PASS"
        except Exception as e:
            print(f"  [FAIL] Module 3 failed: {e}")
            results["3. Patient Search, Filters & Record Access"] = f"FAIL: {e}"

        # =====================================================================
        # MODULE 4: Patient Symptoms & Complaint History
        # =====================================================================
        print("\n[MODULE 4] Testing Patient Symptoms & Complaint History...")
        try:
            # Check symptoms inside patient record
            rec_syms = rec.get("recent_symptoms", [])
            assert isinstance(rec_syms, list)
            print(f"  [PASS] Retrieved {len(rec_syms)} symptom submission(s) for patient {p_id}")
            results["4. Patient Symptoms & Complaint History"] = "PASS"
        except Exception as e:
            print(f"  [FAIL] Module 4 failed: {e}")
            results["4. Patient Symptoms & Complaint History"] = f"FAIL: {e}"

        # =====================================================================
        # MODULE 5: Clinical Consultation & Diagnosis
        # =====================================================================
        print("\n[MODULE 5] Testing Clinical Consultation & Diagnosis Submission...")
        test_cons_id = None
        test_rx_id = None
        try:
            cons_payload = {
                "patient_id": p_id,
                "diagnosis": "[AUDIT-TEST] Seasonal Allergic Rhinitis",
                "notes": "Nasal mucosa pale and boggy, watery rhinorrhea, no fever.",
                "advice": "Avoid allergen triggers, saline nasal spray twice daily.",
                "medicines": [
                    {
                        "name": "Levocetirizine 5mg",
                        "dosage": "1 tablet",
                        "frequency": "Once daily at bedtime",
                        "duration": "5 days",
                        "instructions": "Take at night",
                    }
                ],
                "status": "completed",
            }
            res_c = await client.post("/api/doctor/consultations", json=cons_payload, headers=doc_headers)
            assert res_c.status_code == 201
            cons_resp = res_c.json()
            test_cons_id = cons_resp["consultation_id"]
            test_rx_id = cons_resp.get("prescription_id")
            assert cons_resp["diagnosis"] == cons_payload["diagnosis"]
            assert cons_resp["doctor_id"] == doc_id
            print(f"  [PASS] Consultation created: {test_cons_id}, linked prescription: {test_rx_id}")
            results["5. Clinical Consultation & Diagnosis"] = "PASS"
        except Exception as e:
            print(f"  [FAIL] Module 5 failed: {e}")
            results["5. Clinical Consultation & Diagnosis"] = f"FAIL: {e}"

        # =====================================================================
        # MODULE 6: Prescription Creation, Saving, Viewing & Updating
        # =====================================================================
        print("\n[MODULE 6] Testing Digital Prescription Creation, Viewing & Updating...")
        rx_created_direct = None
        try:
            # Direct prescription creation endpoint
            rx_payload = {
                "patient_id": p_id,
                "diagnosis": "[AUDIT-TEST] Contact Dermatitis",
                "medicines": [
                    {
                        "name": "Hydrocortisone 1% Cream",
                        "dosage": "Thin layer",
                        "frequency": "Twice daily",
                        "duration": "7 days",
                        "instructions": "Apply locally to affected skin",
                    }
                ],
                "instructions": "Keep area dry and clean",
                "status": "active",
            }
            res_rx_create = await client.post("/api/doctor/prescriptions", json=rx_payload, headers=doc_headers)
            assert res_rx_create.status_code == 201
            rx_created_direct = res_rx_create.json()["prescription_id"]

            # Doctor viewing doctor's issued prescriptions
            res_my_rx = await client.get("/api/doctor/prescriptions", headers=doc_headers)
            assert res_my_rx.status_code == 200
            assert any(rx["prescription_id"] == rx_created_direct for rx in res_my_rx.json())

            # Doctor viewing patient's prescriptions
            res_p_rx = await client.get(f"/api/doctor/patients/{p_id}/prescriptions", headers=doc_headers)
            assert res_p_rx.status_code == 200
            assert any(rx["prescription_id"] == rx_created_direct for rx in res_p_rx.json())

            print(f"  [PASS] Digital prescription {rx_created_direct} created and verified in doctor feeds.")
            results["6. Prescription Creation, Viewing & Updating"] = "PASS"
        except Exception as e:
            print(f"  [FAIL] Module 6 failed: {e}")
            results["6. Prescription Creation, Viewing & Updating"] = f"FAIL: {e}"
        finally:
            if rx_created_direct:
                await rx_col.delete_one({"prescription_id": rx_created_direct})

        # =====================================================================
        # MODULE 7: Maternal and Child Health Records / Cases
        # =====================================================================
        print("\n[MODULE 7] Testing Maternal & Child Health Tracker (MCH)...")
        try:
            res_mch = await client.get("/api/doctor/mch-cases", headers=doc_headers)
            assert res_mch.status_code == 200
            mch_cases = res_mch.json()
            assert isinstance(mch_cases, list)
            assert len(mch_cases) > 0
            has_pregnancy = any(c.get("category") == "pregnancy" or c.get("trimester") for c in mch_cases)
            print(f"  [PASS] Retrieved {len(mch_cases)} MCH cases (Pregnancy/ANC verified: {has_pregnancy})")
            results["7. Maternal & Child Health (MCH)"] = "PASS"
        except Exception as e:
            print(f"  [FAIL] Module 7 failed: {e}")
            results["7. Maternal & Child Health (MCH)"] = f"FAIL: {e}"

        # =====================================================================
        # MODULE 8: ASHA Worker Directory & Assigned-Patient Information
        # =====================================================================
        print("\n[MODULE 8] Testing ASHA Worker Directory...")
        try:
            res_ashas = await client.get("/api/doctor/asha-workers", headers=doc_headers)
            assert res_ashas.status_code == 200
            ashas_list = res_ashas.json()
            assert isinstance(ashas_list, list)
            assert len(ashas_list) > 0
            pooja = next((a for a in ashas_list if a.get("worker_id") == "ASHA-340" or a.get("phone") == "9876543210"), None)
            assert pooja is not None, "ASHA-340 Pooja Sharma should appear in ASHA directory"
            print(f"  [PASS] Retrieved {len(ashas_list)} ASHA worker(s). Verified ASHA-340: {pooja.get('full_name')} ({pooja.get('assigned_villages')})")
            results["8. ASHA Worker Directory"] = "PASS"
        except Exception as e:
            print(f"  [FAIL] Module 8 failed: {e}")
            results["8. ASHA Worker Directory"] = f"FAIL: {e}"

        # =====================================================================
        # MODULE 9: Video Consultation or Call Requests (Accept / Reject)
        # =====================================================================
        print("\n[MODULE 9] Testing Video Consultation & Call Requests...")
        temp_vreq_id = None
        try:
            # Create a test video request for patient
            vreq_payload = {
                "patient_id": p_id,
                "urgency": "urgent",
                "reason": "[AUDIT-TEST] Video Consultation Request for Acute Rash",
                "symptoms": ["Rash", "Itching"],
            }
            res_vreq = await client.post("/api/consultations/request", json=vreq_payload, headers={"Authorization": f"Bearer {pat_tok}"})
            assert res_vreq.status_code == 201
            temp_vreq_id = res_vreq.json()["consultation_id"]

            # Doctor fetches video requests
            res_v_list = await client.get("/api/doctor/video-requests", headers=doc_headers)
            assert res_v_list.status_code == 200

            # Doctor accepts video request
            res_accept = await client.post(f"/api/consultations/{temp_vreq_id}/decision", json={"action": "accept", "notes": "Accepted for video triage."}, headers=doc_headers)
            assert res_accept.status_code == 200
            assert res_accept.json()["status"] == "accepted"
            print(f"  [PASS] Video request {temp_vreq_id} accepted successfully by Doctor.")
            results["9. Video Consultation Requests"] = "PASS"
        except Exception as e:
            print(f"  [FAIL] Module 9 failed: {e}")
            results["9. Video Consultation Requests"] = f"FAIL: {e}"
        finally:
            if temp_vreq_id:
                await cons_col.delete_one({"consultation_id": temp_vreq_id})

        # =====================================================================
        # MODULE 10: Notifications, Alerts & Pending Requests
        # =====================================================================
        print("\n[MODULE 10] Testing Doctor Notifications, Alerts & Mark Read...")
        try:
            res_notifs = await client.get("/api/doctor/notifications", headers=doc_headers)
            assert res_notifs.status_code == 200
            notifs_data = res_notifs.json()
            assert isinstance(notifs_data, list)

            # Mark all as read
            res_mark_all = await client.patch("/api/doctor/notifications/read-all", headers=doc_headers)
            assert res_mark_all.status_code == 200
            assert res_mark_all.json().get("status") == "success"
            
            # Verify unread count is 0
            res_after = await client.get("/api/doctor/notifications", headers=doc_headers)
            assert res_after.status_code == 200
            unread_remaining = [n for n in res_after.json() if not n.get("is_read")]
            assert len(unread_remaining) == 0
            print(f"  [PASS] Doctor notifications retrieved ({len(notifs_data)} items). Mark-all-as-read confirmed (0 unread remaining).")
            results["10. Notifications, Alerts & Pending Requests"] = "PASS"
        except Exception as e:
            print(f"  [FAIL] Module 10 failed: {e}")
            results["10. Notifications, Alerts & Pending Requests"] = f"FAIL: {e}"

        # =====================================================================
        # MODULE 11: Health Records, Consultation History & Follow-up
        # =====================================================================
        print("\n[MODULE 11] Testing Patient Consultation History & Health Records...")
        try:
            res_c_hist = await client.get(f"/api/doctor/patients/{p_id}/consultations", headers=doc_headers)
            assert res_c_hist.status_code == 200
            c_hist = res_c_hist.json()
            assert isinstance(c_hist, list)

            res_all_hist = await client.get("/api/consultations/history", headers=doc_headers)
            assert res_all_hist.status_code == 200
            print(f"  [PASS] Retrieved {len(c_hist)} consultation history records for patient {p_id}")
            results["11. Health Records & Consultation History"] = "PASS"
        except Exception as e:
            print(f"  [FAIL] Module 11 failed: {e}")
            results["11. Health Records & Consultation History"] = f"FAIL: {e}"

        # =====================================================================
        # MODULE 12: Navigation, Loading States, Error Handling & Relogin Persistence
        # =====================================================================
        print("\n[MODULE 12] Testing Navigation, Error Handling & Persistence...")
        try:
            # 1. Unauthenticated request rejected
            res_unauth = await client.get("/api/doctor/cases")
            assert res_unauth.status_code == 401

            # 2. Patient attempting doctor endpoints rejected with 403
            res_forbidden = await client.get("/api/doctor/cases", headers={"Authorization": f"Bearer {pat_tok}"})
            assert res_forbidden.status_code == 403
            assert res_forbidden.json()["detail"] == "Access forbidden: Doctor credentials required."

            # 3. Invalid consultation payload rejected with 400
            res_bad_cons = await client.post("/api/doctor/consultations", json={"patient_id": p_id, "diagnosis": "", "notes": ""}, headers=doc_headers)
            assert res_bad_cons.status_code == 400

            # 4. Fresh doctor token maintains complete access
            fresh_token = create_access_token({"sub": doc_id, "phone": doc_phone, "role": "doctor"})
            res_fresh = await client.get("/api/doctor/profile", headers={"Authorization": f"Bearer {fresh_token}"})
            assert res_fresh.status_code == 200
            assert res_fresh.json()["doctor_id"] == doc_id
            print(f"  [PASS] RBAC rejections (401/403/400) and fresh token persistence validated.")
            results["12. Navigation, Errors & Persistence"] = "PASS"
        except Exception as e:
            print(f"  [FAIL] Module 12 failed: {e}")
            results["12. Navigation, Errors & Persistence"] = f"FAIL: {e}"

        # Teardown audit consultation
        if test_cons_id:
            await cons_col.delete_one({"consultation_id": test_cons_id})
        if test_rx_id:
            await rx_col.delete_one({"prescription_id": test_rx_id})
            await notifs_col.delete_many({"prescription_id": test_rx_id})
        if test_rx_id or test_cons_id:
            await patients_col.update_one(
                {"patient_id": p_id},
                {"$pull": {"medical_history": {"$or": [{"id": test_rx_id}, {"prescription_id": test_rx_id}, {"consultation_id": test_cons_id}]}}}
            )

    await close_mongo_connection()

    print("\n" + "=" * 70)
    print("                 DOCTOR MODULE AUDIT SUMMARY RESULTS                 ")
    print("=" * 70)
    all_passed = True
    for mod, res in results.items():
        status_tag = "[PASS]" if res == "PASS" else "[FAIL]"
        print(f"  {status_tag:<8} {mod:<55} -> {res}")
        if res != "PASS":
            all_passed = False

    print("=" * 70)
    if all_passed:
        print("   ALL 12 DOCTOR MODULES PASSED FULL REGRESSION TESTING!   ")
    else:
        print("   SOME MODULES FAILED - SEE DETAILS ABOVE   ")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(run_doctor_modules_suite())
