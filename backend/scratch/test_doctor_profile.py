import asyncio
import sys
import os
import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import database

async def main():
    await database.connect_to_mongo()
    
    # Verify patient count
    pat_col = database.get_collection('patients')
    patients = await pat_col.find({}).to_list(10)
    print(f"PATIENTS COUNT: {len(patients)}")
    for p in patients:
        print(f"  - {p.get('patient_id')}: {p.get('full_name')}")
    assert len(patients) == 3, f"Expected 3 patients, found {len(patients)}"
    
    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        # Test 1: Login as Dr. Arvind Varma (DOC-501)
        print("\n--- Testing Dr. Arvind Varma (DOC-501) Login & Profile ---")
        login_res_1 = await client.post("/api/doctor/login", json={"phone": "9823088882", "password": "DoctorSecurePass123"})
        if login_res_1.status_code != 200:
            login_res_1 = await client.post("/api/doctor/login", json={"phone": "9823088882", "password": "123456"})
        print(f"Login status: {login_res_1.status_code}")
        doc1_data = login_res_1.json()
        token1 = doc1_data.get("access_token")
        doctor1 = doc1_data.get("doctor")
        print(f"Logged in doctor: {doctor1.get('full_name')} ({doctor1.get('doctor_id')})")
        assert doctor1.get("full_name") == "Dr. Arvind Varma", f"Expected Dr. Arvind Varma, got {doctor1.get('full_name')}"
        assert doctor1.get("doctor_id") == "DOC-501", f"Expected DOC-501, got {doctor1.get('doctor_id')}"

        # Fetch profile endpoint
        prof_res_1 = await client.get("/api/doctor/profile", headers={"Authorization": f"Bearer {token1}"})
        print(f"Profile API status: {prof_res_1.status_code}")
        prof1 = prof_res_1.json()
        print(f"Profile response: Name: '{prof1.get('full_name')}', ID: '{prof1.get('doctor_id')}', Specialization: '{prof1.get('specialization')}', Facility: '{prof1.get('assigned_facility')}'")
        assert prof1.get("full_name") == "Dr. Arvind Varma"
        assert prof1.get("doctor_id") == "DOC-501"

        # Test 2: Login as Dr. Ramesh Gupta (DOC-101)
        print("\n--- Testing Dr. Ramesh Gupta (DOC-101) Login & Profile ---")
        login_res_2 = await client.post("/api/doctor/login", json={"phone": "9823000001", "password": "123456"})
        if login_res_2.status_code != 200:
            login_res_2 = await client.post("/api/doctor/login", json={"phone": "9823000001", "password": "DoctorSecurePass123"})
        print(f"Login status: {login_res_2.status_code}")
        doc2_data = login_res_2.json()
        token2 = doc2_data.get("access_token")
        doctor2 = doc2_data.get("doctor")
        print(f"Logged in doctor: {doctor2.get('full_name')} ({doctor2.get('doctor_id')})")
        assert doctor2.get("full_name") == "Dr. Ramesh Gupta"
        assert doctor2.get("doctor_id") == "DOC-101"

        # Fetch profile endpoint
        prof_res_2 = await client.get("/api/doctor/profile", headers={"Authorization": f"Bearer {token2}"})
        print(f"Profile API status: {prof_res_2.status_code}")
        prof2 = prof_res_2.json()
        print(f"Profile response: Name: '{prof2.get('full_name')}', ID: '{prof2.get('doctor_id')}', Specialization: '{prof2.get('specialization')}'")
        assert prof2.get("full_name") == "Dr. Ramesh Gupta"
        assert prof2.get("doctor_id") == "DOC-101"

        # Test 3: Check Dr. Anjali Rao in database was NOT modified
        doc_col = database.get_collection('doctors')
        anjali = await doc_col.find_one({"doctor_id": "DOC-102"})
        print(f"\n--- Checking Dr. Anjali Rao (DOC-102) record preserved ---")
        print(f"Anjali record: ID: {anjali.get('doctor_id')}, Name: {anjali.get('full_name')}, Phone: {anjali.get('phone')}")
        assert anjali.get("full_name") == "Dr. Anjali Rao"
        assert anjali.get("doctor_id") == "DOC-102"

        # Verify patient collection is still strictly 3 records
        pat_col_after = database.get_collection('patients')
        patients_after = await pat_col_after.find({}).to_list(10)
        print(f"\nFinal Patients Count: {len(patients_after)}")
        assert len(patients_after) == 3

    print("\nALL BACKEND PROFILE IDENTITY TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(main())
