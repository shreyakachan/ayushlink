import asyncio
import time
from httpx import AsyncClient, ASGITransport
from main import app
from database import get_collection, COLLECTION_PATIENTS, connect_to_mongo, close_mongo_connection
from services.security import decode_access_token


async def run_tests():
    print("==================================================")
    print("     AyushLink Patient Auth API Test Suite        ")
    print("==================================================")

    # Initialize connection
    await connect_to_mongo()
    collection = get_collection(COLLECTION_PATIENTS)

    # Clean up test patient if previously exists
    test_phone = "9823099999"
    if collection is not None:
        await collection.delete_many({"phone": test_phone})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # TEST 1: Register a new patient
        print("\n[TEST 1] Testing Patient Registration API (POST /api/patient/register)...")
        reg_payload = {
            "full_name": "Ravi Shankar",
            "phone": "+91 98230 99999",  # with prefix and spaces
            "password": "SecurePassword123",
            "age": 38,
            "gender": "male",
            "village": "Chandapur",
            "preferred_language": "mr",
            "abha_id": "14-2233-9981-0021",
            "blood_group": "B+",
            "allergies": ["Penicillin"],
            "chronic_conditions": ["Hypertension"],
        }
        res = await client.post("/api/patient/register", json=reg_payload)
        print(f"Status Code: {res.status_code}")
        data = res.json()

        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {data}"
        assert "access_token" in data, "Token missing in response"
        assert data["token_type"] == "bearer"
        assert data["patient"]["full_name"] == "Ravi Shankar"
        assert data["patient"]["phone"] == test_phone
        assert "password" not in data["patient"]
        assert "hashed_password" not in data["patient"]
        print(f"[OK] Patient registered successfully: ID={data['patient']['patient_id']}")

        # Verify JWT Token content
        token = data["access_token"]
        payload = decode_access_token(token)
        assert payload is not None, "Failed to decode JWT token"
        assert payload["role"] == "patient"
        assert payload["phone"] == test_phone
        print(f"[OK] JWT Token verified & decoded successfully: {payload}")

        # Verify MongoDB storage and bcrypt hashing
        stored_doc = await collection.find_one({"phone": test_phone})
        assert stored_doc is not None, "Patient not found in MongoDB"
        assert stored_doc["hashed_password"] != "SecurePassword123", "Password stored in plaintext!"
        assert stored_doc["hashed_password"].startswith("$2b$") or stored_doc["hashed_password"].startswith("$2a$"), "Password not hashed with bcrypt"
        print(f"[OK] MongoDB record verified: Password securely hashed with bcrypt ({stored_doc['hashed_password'][:15]}...)")

        # TEST 2: Duplicate registration should be rejected
        print("\n[TEST 2] Testing Duplicate Registration Validation...")
        res_dup = await client.post("/api/patient/register", json=reg_payload)
        assert res_dup.status_code == 400, f"Expected 400 for duplicate, got {res_dup.status_code}"
        print(f"[OK] Duplicate registration rejected with 400: {res_dup.json()['detail']}")

        # TEST 3: Validation Error on Invalid Phone / Fields
        print("\n[TEST 3] Testing Request Validation (Invalid Phone & Age)...")
        bad_payload = {
            "full_name": "A",  # too short
            "phone": "123",    # invalid
            "age": 150,        # invalid
            "gender": "unknown", # invalid
            "village": "",
        }
        res_bad = await client.post("/api/patient/register", json=bad_payload)
        assert res_bad.status_code == 422, f"Expected 422, got {res_bad.status_code}"
        print(f"[OK] Validation errors properly handled with HTTP 422")

        # TEST 4: Patient Login with Correct Credentials
        print("\n[TEST 4] Testing Patient Login API (POST /api/patient/login)...")
        login_payload = {
            "phone": "9823099999",
            "password": "SecurePassword123",
        }
        res_login = await client.post("/api/patient/login", json=login_payload)
        assert res_login.status_code == 200, f"Expected 200, got {res_login.status_code}: {res_login.json()}"
        login_data = res_login.json()
        assert "access_token" in login_data
        assert login_data["patient"]["phone"] == test_phone
        print(f"[OK] Patient login successful! Token received for {login_data['patient']['full_name']}")

        # TEST 5: Patient Login with Wrong Password
        print("\n[TEST 5] Testing Login with Wrong Password...")
        wrong_pwd_payload = {
            "phone": "9823099999",
            "password": "WrongPassword999",
        }
        res_wrong = await client.post("/api/patient/login", json=wrong_pwd_payload)
        assert res_wrong.status_code == 401, f"Expected 401, got {res_wrong.status_code}"
        print(f"[OK] Wrong password rejected with 401: {res_wrong.json()['detail']}")

        # TEST 6: Patient Login with Non-Existent Phone
        print("\n[TEST 6] Testing Login with Non-Existent Phone...")
        no_user_payload = {
            "phone": "9800000000",
            "password": "SomePassword123",
        }
        res_nouser = await client.post("/api/patient/login", json=no_user_payload)
        assert res_nouser.status_code == 404, f"Expected 404, got {res_nouser.status_code}"
        print(f"[OK] Non-existent user rejected with 404: {res_nouser.json()['detail']}")

    # Clean up
    if collection is not None:
        await collection.delete_many({"phone": test_phone})

    await close_mongo_connection()
    print("\n==================================================")
    print("   ALL PATIENT REGISTRATION & LOGIN TESTS PASSED! ")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(run_tests())
