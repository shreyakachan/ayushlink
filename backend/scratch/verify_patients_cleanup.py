import asyncio
import sys
import os
from httpx import AsyncClient, ASGITransport

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from main import app
from database.mongodb import connect_to_mongo, close_mongo_connection, get_database

async def verify():
    await connect_to_mongo()
    db = get_database()
    
    print("=" * 80)
    print("VERIFYING MONGODB PATIENT COLLECTION AFTER CLEANUP")
    print("=" * 80)
    
    patients = await db["patients"].find({}).sort("created_at", -1).to_list(100)
    print(f"Total Patients in MongoDB: {len(patients)}")
    for p in patients:
        print(f"  - Patient ID: {p.get('patient_id')}, Name: {p.get('full_name')}, Village: {p.get('village')}, Phone: {p.get('phone')}")
        
    expected_ids = {"P-4559", "P-2430", "P-4099"}
    actual_ids = {p.get("patient_id") for p in patients}
    assert actual_ids == expected_ids, f"Mismatch in remaining patient IDs: expected {expected_ids}, got {actual_ids}"
    
    from services.security import create_access_token
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        print("\n" + "=" * 80)
        print("TESTING ASHA WORKER API: GET /api/patients")
        print("=" * 80)
        
        asha_token = create_access_token({"sub": "ASHA-833", "phone": "9837373773", "role": "asha"})
        headers = {"Authorization": f"Bearer {asha_token}"}
        
        patients_resp = await client.get("/api/patients", headers=headers)
        print(f"GET /api/patients Status: {patients_resp.status_code}")
        data = patients_resp.json()
        print(f"Total Patients returned for ASHA Worker: {len(data)}")
        for idx, p in enumerate(data, 1):
            print(f"  {idx}. ID: {p.get('patient_id')}, Name: {p.get('full_name')}, Village: {p.get('village')}")
            
        returned_ids = [p.get("patient_id") for p in data]
        assert len(data) == 2, f"Expected exactly 2 patients for ASHA Swati Deshmukh, got {len(data)}"
        assert "P-4559" in returned_ids, "P-4559 (Shreya) missing from ASHA patient list"
        assert "P-2430" in returned_ids, "P-2430 (Kavita Patil) missing from ASHA patient list"
        assert "P-4099" not in returned_ids, "P-4099 (Rampur village) should not appear for ASHA"
        
        # Verify doctor API
        print("\n" + "=" * 80)
        print("TESTING DOCTOR API: GET /api/patients")
        print("=" * 80)
        doc_token = create_access_token({"sub": "DOC-101", "phone": "9823000001", "role": "doctor"})
        doc_patients_resp = await client.get("/api/patients", headers={"Authorization": f"Bearer {doc_token}"})
        doc_data = doc_patients_resp.json()
        print(f"Doctor sees all {len(doc_data)} registered patients:")
        for idx, p in enumerate(doc_data, 1):
            print(f"  {idx}. ID: {p.get('patient_id')}, Name: {p.get('full_name')}, Village: {p.get('village')}")
        assert len(doc_data) == 3, f"Expected 3 patients for Doctor, got {len(doc_data)}"

    print("\nALL VERIFICATIONS PASSED SUCCESSFULLY!")
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(verify())
