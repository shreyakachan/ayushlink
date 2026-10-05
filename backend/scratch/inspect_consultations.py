import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def inspect():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["ayushlink_db"]

    print("=== ALL PATIENTS ===")
    async for p in db.patients.find():
        print(f"ID: {p.get('patient_id')} | Name: {p.get('full_name')} | Phone: {p.get('phone')} | Status: {p.get('status')}")

    print("\n=== DOCTOR VIDEO REQUESTS QUERY ===")
    active_cursor = db.consultations.find({
        "$or": [
            {"status": "requested"},
            {"status": {"$in": ["accepted", "in_progress"]}},
        ]
    })
    async for c in active_cursor:
        print(f"ACTIVE: ID: {c.get('consultation_id')} | Patient: {c.get('patient_name')} ({c.get('patient_id')}) | Status: {c.get('status')} | Reason: {c.get('reason')}")

if __name__ == "__main__":
    asyncio.run(inspect())
