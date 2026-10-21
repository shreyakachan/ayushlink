import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from database.mongodb import connect_to_mongo, close_mongo_connection, get_collection, COLLECTION_CONSULTATIONS

async def main():
    await connect_to_mongo()
    col = get_collection(COLLECTION_CONSULTATIONS)
    if col is not None:
        res = await col.delete_many({})
        print(f"Deleted {res.deleted_count} consultations.")
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(main())
