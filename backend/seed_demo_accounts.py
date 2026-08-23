import asyncio
from database import connect_to_mongo, close_mongo_connection, get_collection
from services.security import hash_password

async def seed():
    await connect_to_mongo()
    col = get_collection("asha_workers")
    if col is None:
        print("Error: asha_workers collection not accessible.")
        return

    pwd_hash = hash_password("123456")

    accounts = [
        {
            "worker_id": "ASHA-833",
            "full_name": "Swati Deshmukh",
            "phone": "9837373773",
            "hashed_password": pwd_hash,
            "assigned_villages": ["Chandapur", "Nandgaon", "Devgaon"],
            "primary_phc": "Chandapur Primary Health Centre",
            "preferred_language": "en",
            "is_active": True,
            "stats": {
                "patients_seen": 18,
                "prescriptions_issued": 12,
                "villages_covered": 3,
                "months_active": 6,
            },
        },
        {
            "worker_id": "ASHA-101",
            "full_name": "Pooja Sharma",
            "phone": "9876500001",
            "hashed_password": pwd_hash,
            "assigned_villages": ["Chandapur", "Nandgaon", "chandrapur"],
            "primary_phc": "Chandapur Primary Health Centre",
            "preferred_language": "en",
            "is_active": True,
            "stats": {
                "patients_seen": 24,
                "prescriptions_issued": 8,
                "villages_covered": 3,
                "months_active": 8,
            },
        },
        {
            "worker_id": "ASHA-775",
            "full_name": "Meena Ingle",
            "phone": "9823088881",
            "hashed_password": pwd_hash,
            "assigned_villages": ["Chandapur", "Devgaon", "Kharwadi"],
            "primary_phc": "Chandapur PHC",
            "preferred_language": "en",
            "is_active": True,
            "stats": {
                "patients_seen": 30,
                "prescriptions_issued": 15,
                "villages_covered": 3,
                "months_active": 12,
            },
        },
        {
            "worker_id": "ASHA-340",
            "full_name": "Pooja Sharma",
            "phone": "9876543210",
            "hashed_password": pwd_hash,
            "assigned_villages": ["Chandapur", "Nandgaon", "Kharwadi"],
            "primary_phc": "Chandapur PHC",
            "preferred_language": "en",
            "is_active": True,
            "stats": {
                "patients_seen": 15,
                "prescriptions_issued": 5,
                "villages_covered": 3,
                "months_active": 4,
            },
        }
    ]

    for acc in accounts:
        res = await col.update_one(
            {"phone": acc["phone"]},
            {"$set": acc},
            upsert=True,
        )
        print(f"Upserted ASHA account: Phone={acc['phone']}, Name={acc['full_name']}, Matched={res.matched_count}, Modified={res.modified_count}, UpsertedId={res.upserted_id}")

    await close_mongo_connection()
    print("\n[SUCCESS] Demo ASHA worker accounts seeded with password '123456' successfully!")

if __name__ == "__main__":
    asyncio.run(seed())
