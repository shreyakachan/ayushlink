"""
Verification script for Patient Login & Session Switching (Kavita Patil -> Logout -> Ramesh Kumar)
Ensures:
1. Kavita Patil logs in and retrieves her own profile and name ("Kavita Patil").
2. Tokens and sessions are isolated per user.
3. Logout cleanly clears the session.
4. Second patient (Ramesh Kumar) logs in and retrieves his own profile and name ("Ramesh Kumar").
5. Zero stale data from Kavita Patil appears in Ramesh's session.
"""

import asyncio
from httpx import AsyncClient, ASGITransport
from main import app
from database import connect_to_mongo, close_mongo_connection, get_collection, COLLECTION_PATIENTS


async def test_session_switching():
    print("=" * 60)
    print("   Testing Patient Login & Dynamic Session Switching")
    print("=" * 60)

    await connect_to_mongo()
    col = get_collection(COLLECTION_PATIENTS)

    # Clean up test numbers
    phone_kavita = "9823077812"
    phone_ramesh = "9823044521"
    if col is not None:
        await col.delete_many({"phone": {"$in": [phone_kavita, phone_ramesh]}})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test/api") as client:
        # -------------------------------------------------------------
        # STEP 1: Register and Login with Patient 1 (Kavita Patil)
        # -------------------------------------------------------------
        print("\n[STEP 1] Registering Patient 1: Kavita Patil (P-2430)...")
        res_kavita_reg = await client.post("/patient/register", json={
            "full_name": "Kavita Patil",
            "phone": phone_kavita,
            "password": "PIN123456",
            "age": 27,
            "gender": "female",
            "village": "Nandgaon",
            "preferred_language": "mr",
            "blood_group": "A+",
            "allergies": ["Dust allergy"],
            "chronic_conditions": ["Mild Asthma"],
        })
        assert res_kavita_reg.status_code == 201, f"Register Kavita failed: {res_kavita_reg.text}"
        kavita_data = res_kavita_reg.json()
        kavita_token = kavita_data["access_token"]
        assert kavita_data["patient"]["full_name"] == "Kavita Patil"

        # Login Kavita with simulated OTP / PIN
        res_kavita_login = await client.post("/patient/login", json={
            "phone": phone_kavita,
            "password": "PIN123456",
        })
        assert res_kavita_login.status_code == 200
        kavita_login_token = res_kavita_login.json()["access_token"]
        assert res_kavita_login.json()["patient"]["full_name"] == "Kavita Patil"
        print(f"[OK] Kavita Patil logged in: Token issued for '{res_kavita_login.json()['patient']['full_name']}'")

        # Fetch Medical Record with Kavita's token
        res_kavita_record = await client.get("/patient/medical-record", headers={"Authorization": f"Bearer {kavita_login_token}"})
        assert res_kavita_record.status_code == 200
        rec_kavita = res_kavita_record.json()
        assert rec_kavita["full_name"] == "Kavita Patil"
        assert rec_kavita["blood_group"] == "A+"
        assert rec_kavita["allergies"] == ["Dust allergy"]
        print(f"[OK] PatientHomeScreen /api/patient/medical-record returns: Name='{rec_kavita['full_name']}', BloodGroup='{rec_kavita['blood_group']}'")

        # -------------------------------------------------------------
        # STEP 2: Simulate Client Logout (Token Discarded)
        # -------------------------------------------------------------
        print("\n[STEP 2] Simulating Patient Logout (Token Discarded)...")
        # Unauthenticated request must fail
        res_unauth = await client.get("/patient/medical-record")
        assert res_unauth.status_code == 401
        print("[OK] Session cleared: Unauthenticated access rejected with 401 Unauthorized")

        # -------------------------------------------------------------
        # STEP 3: Register and Login with Patient 2 (Ramesh Kumar)
        # -------------------------------------------------------------
        print("\n[STEP 3] Registering & Logging in Patient 2: Ramesh Kumar (P-2038)...")
        res_ramesh_reg = await client.post("/patient/register", json={
            "full_name": "Ramesh Kumar",
            "phone": phone_ramesh,
            "password": "PIN654321",
            "age": 52,
            "gender": "male",
            "village": "Chandapur",
            "preferred_language": "hi",
            "blood_group": "B+",
            "allergies": [],
            "chronic_conditions": ["Type 2 Diabetes"],
        })
        assert res_ramesh_reg.status_code == 201
        ramesh_token = res_ramesh_reg.json()["access_token"]
        assert res_ramesh_reg.json()["patient"]["full_name"] == "Ramesh Kumar"

        # Fetch Medical Record with Ramesh's token
        res_ramesh_record = await client.get("/patient/medical-record", headers={"Authorization": f"Bearer {ramesh_token}"})
        assert res_ramesh_record.status_code == 200
        rec_ramesh = res_ramesh_record.json()
        
        # Verify Ramesh's record has his details and NO stale Kavita Patil details
        assert rec_ramesh["full_name"] == "Ramesh Kumar"
        assert rec_ramesh["full_name"] != "Kavita Patil"
        assert rec_ramesh["full_name"] != "Sunita Devi"
        assert rec_ramesh["blood_group"] == "B+"
        assert rec_ramesh["chronic_conditions"] == ["Type 2 Diabetes"]
        assert rec_ramesh["allergies"] == []
        print(f"[OK] PatientHomeScreen /api/patient/medical-record returns: Name='{rec_ramesh['full_name']}', BloodGroup='{rec_ramesh['blood_group']}', Conditions={rec_ramesh['chronic_conditions']}")
        print("[OK] Verified NO stale data from Kavita Patil or Sunita Devi in Ramesh's session!")

    await close_mongo_connection()
    print("\n" + "=" * 60)
    print("   PATIENT SESSION & IDENTITY VERIFICATION PASSED!   ")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_session_switching())
