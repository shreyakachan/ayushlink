import asyncio
from httpx import AsyncClient, ASGITransport
from main import app
from database import (
    get_collection,
    COLLECTION_ASHA_WORKERS,
    connect_to_mongo,
    close_mongo_connection,
)
from services.security import decode_access_token


async def run_tests():
    print("==================================================")
    print("     AyushLink ASHA Worker Auth Test Suite        ")
    print("==================================================")

    # Initialize connection
    await connect_to_mongo()
    collection = get_collection(COLLECTION_ASHA_WORKERS)

    # Clean up test ASHA worker if previously exists
    test_phone = "9876500001"
    if collection is not None:
        await collection.delete_many({"phone": test_phone})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # TEST 1: Register a new ASHA Worker
        print("\n[TEST 1] Testing ASHA Worker Registration API (POST /api/asha/register)...")
        reg_payload = {
            "full_name": "Pooja Sharma",
            "phone": "+91 98765 00001",
            "password": "AshaSecurePin123",
            "email": "pooja.sharma@ayushlink.in",
            "assigned_villages": ["Chandapur", "Nandgaon", "Kharwadi"],
            "primary_phc": "Chandapur Primary Health Centre",
            "preferred_language": "hi",
        }
        res = await client.post("/api/asha/register", json=reg_payload)
        print(f"Status Code: {res.status_code}")
        data = res.json()

        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {data}"
        assert "access_token" in data, "Token missing in response"
        assert data["token_type"] == "bearer"
        assert data["asha_worker"]["full_name"] == "Pooja Sharma"
        assert data["asha_worker"]["phone"] == test_phone
        assert len(data["asha_worker"]["assigned_villages"]) == 3
        assert "password" not in data["asha_worker"]
        assert "hashed_password" not in data["asha_worker"]
        print(f"[OK] ASHA worker registered successfully: ID={data['asha_worker']['worker_id']}")

        # Verify JWT Token content
        token = data["access_token"]
        payload = decode_access_token(token)
        assert payload is not None, "Failed to decode JWT token"
        assert payload["role"] == "asha"
        assert payload["phone"] == test_phone
        print(f"[OK] JWT Token verified: role={payload['role']}, sub={payload['sub']}")

        # Verify MongoDB storage and bcrypt hashing in asha_workers collection
        stored_doc = await collection.find_one({"phone": test_phone})
        assert stored_doc is not None, "ASHA worker not found in MongoDB asha_workers collection"
        assert stored_doc["hashed_password"] != "AshaSecurePin123", "Password stored in plaintext!"
        assert stored_doc["hashed_password"].startswith("$2b$") or stored_doc["hashed_password"].startswith("$2a$"), "Password not hashed with bcrypt"
        print(f"[OK] MongoDB asha_workers collection verified: Stored with bcrypt hash ({stored_doc['hashed_password'][:15]}...)")

        # TEST 2: Duplicate registration should be rejected
        print("\n[TEST 2] Testing Duplicate Registration Validation...")
        res_dup = await client.post("/api/asha/register", json=reg_payload)
        assert res_dup.status_code == 400, f"Expected 400 for duplicate, got {res_dup.status_code}"
        print(f"[OK] Duplicate registration rejected with 400: {res_dup.json()['detail']}")

        # TEST 3: Validation Error on Invalid Phone / Fields
        print("\n[TEST 3] Testing Request Validation (Invalid Phone)...")
        bad_payload = {
            "full_name": "P",  # too short
            "phone": "999",    # invalid phone
            "password": "123",  # too short
        }
        res_bad = await client.post("/api/asha/register", json=bad_payload)
        assert res_bad.status_code == 422, f"Expected 422, got {res_bad.status_code}"
        print(f"[OK] Validation errors properly handled with HTTP 422")

        # TEST 4: ASHA Worker Login with Correct Credentials
        print("\n[TEST 4] Testing ASHA Worker Login API (POST /api/asha/login)...")
        login_payload = {
            "phone": "9876500001",
            "password": "AshaSecurePin123",
        }
        res_login = await client.post("/api/asha/login", json=login_payload)
        assert res_login.status_code == 200, f"Expected 200, got {res_login.status_code}: {res_login.json()}"
        login_data = res_login.json()
        assert "access_token" in login_data
        assert login_data["asha_worker"]["phone"] == test_phone
        print(f"[OK] ASHA login successful! Token received for {login_data['asha_worker']['full_name']}")

        # TEST 5: ASHA Login with Wrong Password
        print("\n[TEST 5] Testing Login with Wrong Password...")
        wrong_pwd_payload = {
            "phone": "9876500001",
            "password": "IncorrectPassword999",
        }
        res_wrong = await client.post("/api/asha/login", json=wrong_pwd_payload)
        assert res_wrong.status_code == 401, f"Expected 401, got {res_wrong.status_code}"
        print(f"[OK] Wrong password rejected with 401: {res_wrong.json()['detail']}")

        # TEST 6: ASHA Login with Non-Existent Phone
        print("\n[TEST 6] Testing Login with Non-Existent Phone...")
        no_user_payload = {
            "phone": "9811111111",
            "password": "SomePassword123",
        }
        res_nouser = await client.post("/api/asha/login", json=no_user_payload)
        assert res_nouser.status_code == 404, f"Expected 404, got {res_nouser.status_code}"
        print(f"[OK] Non-existent user rejected with 404: {res_nouser.json()['detail']}")

    # Clean up
    if collection is not None:
        await collection.delete_many({"phone": test_phone})

    await close_mongo_connection()
    print("\n==================================================")
    print("   ALL ASHA WORKER AUTHENTICATION TESTS PASSED!   ")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(run_tests())
