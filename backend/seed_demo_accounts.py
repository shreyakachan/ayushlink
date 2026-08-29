import asyncio
from database import connect_to_mongo, close_mongo_connection, get_collection, COLLECTION_ASHA_WORKERS, COLLECTION_DOCTORS
from services.security import hash_password

async def seed():
    await connect_to_mongo()
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)
    doc_col = get_collection(COLLECTION_DOCTORS)

    pwd_hash_asha = hash_password("123456")
    pwd_hash_doc = hash_password("DoctorSecurePass123")
    pwd_hash_simple = hash_password("123456")

    asha_accounts = [
        {
            "worker_id": "ASHA-833",
            "full_name": "Swati Deshmukh",
            "phone": "9837373773",
            "hashed_password": pwd_hash_asha,
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
            "hashed_password": pwd_hash_asha,
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
            "hashed_password": pwd_hash_asha,
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
            "hashed_password": pwd_hash_asha,
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

    doctor_accounts = [
        {
            "doctor_id": "DOC-101",
            "full_name": "Dr. Ramesh Gupta",
            "phone": "9823000001",
            "hashed_password": pwd_hash_doc,
            "email": "dr.ramesh@ayushlink.in",
            "specialization": "General Physician & AYUSH Consultant",
            "qualification": "MBBS, MD",
            "registration_number": "MCI-2024-8842",
            "assigned_facility": "Chandapur PHC & District Hospital",
            "preferred_language": "en",
            "is_on_duty": True,
            "stats": {
                "consultations_completed": 48,
                "active_cases": 6,
                "prescriptions_signed": 34,
            },
        },
        {
            "doctor_id": "DOC-102",
            "full_name": "Dr. Anjali Rao",
            "phone": "9823000002",
            "hashed_password": pwd_hash_doc,
            "email": "dr.anjali@ayushlink.in",
            "specialization": "Pediatrics & Child Health",
            "qualification": "MBBS, DCH",
            "registration_number": "MCI-2024-9120",
            "assigned_facility": "District Hospital",
            "preferred_language": "en",
            "is_on_duty": True,
            "stats": {
                "consultations_completed": 32,
                "active_cases": 4,
                "prescriptions_signed": 28,
            },
        }
    ]

    if asha_col is not None:
        for acc in asha_accounts:
            await asha_col.update_one(
                {"phone": acc["phone"]},
                {"$set": acc},
                upsert=True,
            )
            print(f"Upserted ASHA account: Phone={acc['phone']}, Name={acc['full_name']}")

    if doc_col is not None:
        for acc in doctor_accounts:
            await doc_col.update_one(
                {"phone": acc["phone"]},
                {"$set": acc},
                upsert=True,
            )
            print(f"Upserted Doctor account: Phone={acc['phone']}, Name={acc['full_name']}")

    await close_mongo_connection()
    print("\n[SUCCESS] Demo ASHA and Doctor accounts seeded successfully!")

if __name__ == "__main__":
    asyncio.run(seed())
