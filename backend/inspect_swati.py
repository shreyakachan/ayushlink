import asyncio
from database import connect_to_mongo, close_mongo_connection, get_collection

async def inspect_swati():
    await connect_to_mongo()
    col = get_collection("asha_workers")
    doc = await col.find_one({"phone": "9837373773"})
    print("SWATI DOC:", doc)
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(inspect_swati())
