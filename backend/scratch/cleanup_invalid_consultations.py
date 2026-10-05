import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def cleanup():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["ayushlink_db"]

    invalid_consultation_ids = [
        "CONS-9098", "CONS-9690", "CONS-3216", "CONS-8472", 
        "CONS-8246", "CONS-3496", "CONS-8845", "CONS-2748", 
        "CONS-6944", "CONS-9571"
    ]

    print(f"Deleting {len(invalid_consultation_ids)} invalid test consultation requests...")
    res = await db.consultations.delete_many({"consultation_id": {"$in": invalid_consultation_ids}})
    print(f"Deleted {res.deleted_count} invalid test consultation records.")

    # Verify remaining consultations
    remaining = await db.consultations.find().to_list(100)
    print(f"\nRemaining consultations in database: {len(remaining)}")
    for c in remaining:
        print(f"Preserved: {c.get('consultation_id')} | Patient: {c.get('patient_name')} ({c.get('patient_id')}) | Status: {c.get('status')} | Reason: {c.get('reason')}")

    # Check active video requests queue for doctor
    active_cursor = db.consultations.find({
        "$or": [
            {"status": "requested"},
            {"status": {"$in": ["accepted", "in_progress"]}},
        ]
    })
    active_list = await active_cursor.to_list(50)
    print(f"\nDoctor Active Video Requests Queue count: {len(active_list)}")
    for a in active_list:
        print(f"Active: {a.get('consultation_id')} | Patient: {a.get('patient_name')} ({a.get('patient_id')})")

if __name__ == "__main__":
    asyncio.run(cleanup())
