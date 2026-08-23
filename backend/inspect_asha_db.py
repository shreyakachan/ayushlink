import asyncio
from database import connect_to_mongo, close_mongo_connection, get_collection
from services.security import verify_password

async def inspect():
    await connect_to_mongo()
    col = get_collection("asha_workers")
    docs = await col.find({}).to_list(100)
    print(f"Total ASHA workers in DB: {len(docs)}")
    for d in docs:
        phone = d.get("phone")
        name = d.get("full_name")
        wid = d.get("worker_id")
        h = d.get("hashed_password")
        p123456 = verify_password("123456", h) if h else False
        pAshaPin = verify_password("AshaSecurePin123", h) if h else False
        pAshaPass = verify_password("AshaPassword123", h) if h else False
        print(f"ID={wid} | Name={name} | Phone={phone} | PwdCheck: 123456={p123456}, AshaSecurePin123={pAshaPin}, AshaPassword123={pAshaPass}")
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(inspect())
