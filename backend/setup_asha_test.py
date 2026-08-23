import asyncio
from httpx import AsyncClient, ASGITransport
from main import app
from database import connect_to_mongo, get_collection
from services.security import hash_password

async def setup():
    await connect_to_mongo()
    db = get_collection("asha_workers")
    h = hash_password("AshaSecurePin123")
    await db.update_one(
        {"phone": "9876500001"},
        {
            "$set": {
                "worker_id": "ASHA-101",
                "full_name": "Pooja Sharma",
                "phone": "9876500001",
                "hashed_password": h,
                "assigned_villages": ["Chandapur", "Nandgaon", "chandrapur"],
                "primary_phc": "Chandapur Primary Health Centre",
                "preferred_language": "en",
                "is_active": True,
            }
        },
        upsert=True,
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/asha/login", json={"phone": "9876500001", "password": "AshaSecurePin123"})
        print("LOGIN STATUS:", res.status_code, res.json().get("message"))

if __name__ == "__main__":
    asyncio.run(setup())
