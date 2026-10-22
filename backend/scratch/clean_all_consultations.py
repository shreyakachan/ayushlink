import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["ayushlink_db"]
    res = await db.consultations.update_many(
        {"status": {"$in": ["requested", "accepted", "in_progress"]}},
        {"$set": {"status": "completed"}}
    )
    print(f"Cleaned {res.modified_count} active consultations.")

if __name__ == "__main__":
    asyncio.run(main())
