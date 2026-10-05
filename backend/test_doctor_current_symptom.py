import asyncio
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from main import app
from database import (
    get_collection,
    COLLECTION_PATIENTS,
    COLLECTION_SYMPTOMS,
    COLLECTION_DOCTORS,
    connect_to_mongo,
    close_mongo_connection,
)
from services.security import hash_password

async def test_patient_shreya_current_symptom():
    print("=========================================================")
    print("   Test: Patient Shreya (P-4559) Current Symptom Display  ")
    print("=========================================================")

    await connect_to_mongo()
    patients_col = get_collection(COLLECTION_PATIENTS)
    symptoms_col = get_collection(COLLECTION_SYMPTOMS)
    doctors_col = get_collection(COLLECTION_DOCTORS)

    # 1. Use existing Doctor account
    doc_phone = "9823000001"
    pwd_hash_doc = hash_password("DoctorSecurePass123")
    await doctors_col.update_one(
        {"doctor_id": "DOC-101"},
        {
            "$set": {
                "phone": doc_phone,
                "hashed_password": pwd_hash_doc,
                "is_on_duty": True,
            }
        },
        upsert=True,
    )

    # 2. Setup Patient Shreya (P-4559) with multiple historical symptoms
    patient_id = "P-4559"
    patient_phone = "9324998108"
    now = datetime.now(timezone.utc)

    await patients_col.update_one(
        {"patient_id": patient_id},
        {
            "$set": {
                "patient_id": patient_id,
                "full_name": "Shreya",
                "phone": patient_phone,
                "age": 24,
                "gender": "female",
                "village": "Chandapur",
                "blood_group": "B+",
                "hashed_password": hash_password("123456"),
                "status": "waiting",
                "created_at": now - timedelta(days=30),
                "updated_at": now,
            }
        },
        upsert=True,
    )

    # Clear previous symptoms for this test run
    await symptoms_col.delete_many({"patient_id": patient_id})

    # Insert 4 historical symptoms (oldest to newer)
    historical_symptoms = [
        {"symptoms": ["Fatigue"], "description": "Mild headache and fatigue", "delta": timedelta(days=20)},
        {"symptoms": ["Joint pain in knees"], "description": "Morning stiffness", "delta": timedelta(days=15)},
        {"symptoms": ["Dry cough", "Sore throat"], "description": "Fever 101F", "delta": timedelta(days=10)},
        {"symptoms": ["Blood Pressure Check"], "description": "BP 140/90", "delta": timedelta(days=5)},
    ]

    for idx, h in enumerate(historical_symptoms):
        t = now - h["delta"]
        await symptoms_col.insert_one({
            "symptom_id": f"SYM-OLD-{idx+1}",
            "patient_id": patient_id,
            "symptoms": h["symptoms"],
            "description": h["description"],
            "recorded_at": t,
            "created_at": t,
            "status": "reported",
            "severity": "moderate",
            "duration": "2-3-days",
            "submitted_by": "patient",
        })

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Authenticate Doctor
        res_login_doc = await client.post("/api/doctor/login", json={"phone": doc_phone, "password": "DoctorSecurePass123"})
        assert res_login_doc.status_code == 200, f"Doctor login failed: {res_login_doc.text}"
        doc_token = res_login_doc.json()["access_token"]
        doc_headers = {"Authorization": f"Bearer {doc_token}"}

        # Authenticate Patient Shreya
        res_login_pat = await client.post("/api/patient/login", json={"phone": patient_phone, "password": "123456"})
        assert res_login_pat.status_code == 200, f"Patient login failed: {res_login_pat.text}"
        pat_token = res_login_pat.json()["access_token"]
        pat_headers = {"Authorization": f"Bearer {pat_token}"}

        # Step 3: Patient Shreya submits NEW symptom: "stomachache"
        new_symptom_payload = {
            "symptoms": ["stomachache"],
            "description": "Severe stomachache since morning after meal",
            "severity": "moderate",
            "duration": "today",
            "client_created_at": now.isoformat(),
        }
        res_sub = await client.post("/api/patient/symptoms", json=new_symptom_payload, headers=pat_headers)
        assert res_sub.status_code == 201, f"Symptom submission failed: {res_sub.text}"
        print(f"[OK] Patient Shreya submitted new symptom: {res_sub.json()['symptoms']}")

        # Step 4: Doctor queries /api/doctor/cases
        res_cases = await client.get("/api/doctor/cases", headers=doc_headers)
        assert res_cases.status_code == 200, f"Get doctor cases failed: {res_cases.text}"
        cases = res_cases.json()

        shreya_case = next((c for c in cases if c["patient_id"] == patient_id), None)
        assert shreya_case is not None, "Shreya case not found in doctor cases"

        print(f"[VERIFY] Shreya Case Condition / Summary in API: '{shreya_case['condition']}'")
        assert "stomachache" in shreya_case["condition"]
        assert "Fatigue" not in shreya_case["condition"]
        assert "Joint pain" not in shreya_case["condition"]
        assert "Blood Pressure Check" not in shreya_case["condition"]
        assert "Dry cough" not in shreya_case["condition"]

        # Step 5: Verify all historical symptoms are preserved in database
        total_syms = await symptoms_col.count_documents({"patient_id": patient_id})
        print(f"[VERIFY] Total Symptom Records in MongoDB: {total_syms} (1 new + 4 historical)")
        assert total_syms == 5, f"Expected 5 symptoms in MongoDB, found {total_syms}"

        # Verify recent_symptoms in case has newest first
        assert shreya_case["recent_symptoms"][0]["symptoms"] == ["stomachache"]
        assert len(shreya_case["recent_symptoms"]) == 5

        # Step 6: Verify Patient Medical Record endpoint still returns full history
        res_rec = await client.get(f"/api/doctor/patients/{patient_id}/records", headers=doc_headers)
        assert res_rec.status_code == 200
        rec_data = res_rec.json()
        assert len(rec_data["recent_symptoms"]) == 5
        print(f"[OK] Full medical history intact: {len(rec_data['recent_symptoms'])} historical entries returned to Doctor")

    await close_mongo_connection()
    print("=========================================================")
    print("   ALL CHECKS PASSED: ONLY CURRENT SYMPTOM DISPLAYED!    ")
    print("=========================================================")

if __name__ == "__main__":
    asyncio.run(test_patient_shreya_current_symptom())
