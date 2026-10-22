import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import connect_to_mongo, close_mongo_connection, get_collection

async def inspect_all():
    await connect_to_mongo()
    db = get_collection("emergency_alerts")
    # list all collections
    cols = await db.database.list_collection_names()
    print("Database collections:", cols)
    
    for c in cols:
        if "emergency" in c or "alert" in c or "sos" in c or "notif" in c:
            col = get_collection(c)
            count = await col.count_documents({})
            print(f"Collection {c}: {count} documents")
            if "alert" in c or "emergency" in c:
                docs = await col.find({}).sort("created_at", -1).limit(10).to_list(10)
                for d in docs:
                    print(f"  [{c}] alert_id={d.get('alert_id')}, patient_id={d.get('patient_id')}, status={d.get('status')}, asha_status={d.get('asha_status')}, created_at={d.get('created_at')}")

    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(inspect_all())
