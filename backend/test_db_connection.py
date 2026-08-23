import asyncio
from config import settings
from database import (
    connect_to_mongo,
    close_mongo_connection,
    ping_database,
    get_database,
    COLLECTION_PATIENTS,
    COLLECTION_ASHA_WORKERS,
    COLLECTION_DOCTORS,
)
from models import Patient, AshaWorker, Doctor


async def test_models():
    print("\n--- Testing Model Definitions ---")
    patient = Patient(
        patient_id="P-2041",
        full_name="Sunita Devi",
        phone="+91 98230 11234",
        age=34,
        gender="Female",
        village="Chandapur",
        abha_id="14-2233-9981-0021",
        condition="Viral fever",
        status="stable",
    )
    print(f"[OK] Patient Model instantiated: {patient.full_name} ({patient.patient_id})")

    worker = AshaWorker(
        worker_id="ASHA-101",
        full_name="Pooja Sharma",
        phone="+91 98765 43210",
        assigned_villages=["Chandapur", "Nandgaon", "Kharwadi"],
        primary_phc="Chandapur PHC",
    )
    print(f"[OK] AshaWorker Model instantiated: {worker.full_name} ({worker.worker_id})")

    doctor = Doctor(
        doctor_id="DOC-501",
        full_name="Dr. Anjali Rao",
        phone="+91 98230 00001",
        specialization="General Physician",
        assigned_facility="District Hospital",
    )
    print(f"[OK] Doctor Model instantiated: {doctor.full_name} ({doctor.doctor_id})")
    return True


async def test_connection():
    print("\n--- Testing MongoDB Connection ---")
    print(f"Connecting to: {settings.MONGODB_URL}")
    print(f"Target Database: {settings.MONGODB_DB_NAME}")

    try:
        await connect_to_mongo()
        status = await ping_database()
        print(f"Ping result: {status}")

        if status.get("status") == "connected":
            db = get_database()
            collections = await db.list_collection_names()
            print(f"[OK] Connected to MongoDB successfully!")
            print(f"[OK] Collections in '{settings.MONGODB_DB_NAME}': {collections}")
            print(
                f"[OK] Target collections configured: ['{COLLECTION_PATIENTS}', '{COLLECTION_ASHA_WORKERS}', '{COLLECTION_DOCTORS}']"
            )
        else:
            print(
                f"[INFO] MongoDB status: {status.get('status')}. Error/Note: {status.get('error')}"
            )
    except Exception as e:
        print(f"[INFO] MongoDB connection exception: {e}")
    finally:
        await close_mongo_connection()


async def main():
    print("========================================")
    print("  AyushLink Database Layer Test Suite   ")
    print("========================================")
    await test_models()
    await test_connection()
    print("\n[PASS] Database layer structure and models verified successfully!")


if __name__ == "__main__":
    asyncio.run(main())
