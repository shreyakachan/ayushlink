import asyncio
from httpx import AsyncClient, ASGITransport
from main import app
from database import connect_to_mongo, get_collection
from services.security import hash_password

async def test():
    await connect_to_mongo()
    db = get_collection("asha_workers")
    pwd_hash = hash_password("SwatiPassSecure!123")
    
    # Update Swati password
    await db.update_one(
        {"worker_id": "ASHA-833"},
        {"$set": {"hashed_password": pwd_hash, "phone": "9837373773", "is_active": True}}
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Login as Swati
        login_res = await client.post("/api/asha/login", json={"phone": "9837373773", "password": "SwatiPassSecure!123"})
        print("SWATI LOGIN:", login_res.status_code, login_res.json().get("message"))
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Assign P-4559 to Swati (ASHA-833)
        assign_res = await client.post("/api/asha/patients/P-4559/assign", headers=headers)
        print("ASSIGN P-4559 STATUS:", assign_res.status_code, assign_res.json())

        # 3. Query Swati Cases
        cases_res = await client.get("/api/asha/cases", headers=headers)
        print("SWATI CASES STATUS:", cases_res.status_code, "COUNT:", len(cases_res.json()))
        p4559_case = next((c for c in cases_res.json() if c.get("patient_id") == "P-4559"), None)
        print("P-4559 IN SWATI CASES:", p4559_case)

        # 4. Query P-4559 Medical Record
        rec_res = await client.get("/api/asha/patients/P-4559/records", headers=headers)
        print("P-4559 REC STATUS:", rec_res.status_code)
        rec = rec_res.json()
        print("P-4559 NAME:", rec.get("full_name"), "SYMPTOMS COUNT:", len(rec.get("recent_symptoms", [])))
        for s in rec.get("recent_symptoms", []):
            print("   SYM:", s.get("symptom_id"), "DESC:", s.get("description"), "SEV:", s.get("severity"), "DUR:", s.get("duration"), "BY:", s.get("submitted_by"))

        # 5. Check MongoDB directly
        patient_doc = await get_collection("patients").find_one({"patient_id": "P-4559"})
        print("MONGODB PATIENT asha_worker_id:", patient_doc.get("asha_worker_id"))

if __name__ == "__main__":
    asyncio.run(test())
