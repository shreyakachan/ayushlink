import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def inspect_suspicious():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["ayushlink_db"]

    suspicious_ids = [
        "CONS-9098", "CONS-9690", "CONS-3216", "CONS-8472", 
        "CONS-8246", "CONS-3496", "CONS-8845", "CONS-2748", 
        "CONS-6944", "CONS-9571"
    ]

    print("=== SUSPICIOUS CONSULTATION RECORDS ===")
    for cid in suspicious_ids:
        doc = await db.consultations.find_one({"consultation_id": cid})
        if doc:
            print({
                "consultation_id": doc.get("consultation_id"),
                "patient_id": doc.get("patient_id"),
                "patient_name": doc.get("patient_name"),
                "doctor_id": doc.get("doctor_id"),
                "created_at": str(doc.get("created_at")),
                "status": doc.get("status"),
                "request_type": doc.get("requested_by"),
                "offline_id": doc.get("offline_id"),
                "reason": doc.get("reason"),
                "created_by_test_fixture": True,
            })

if __name__ == "__main__":
    asyncio.run(inspect_suspicious())
