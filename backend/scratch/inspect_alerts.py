import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import connect_to_mongo, close_mongo_connection, get_collection, COLLECTION_EMERGENCY_ALERTS

async def inspect_active_alerts():
    await connect_to_mongo()
    alerts_col = get_collection(COLLECTION_EMERGENCY_ALERTS)
    cursor = alerts_col.find({}).sort("created_at", -1)
    docs = await cursor.to_list(length=100)
    print(f"Total alerts in DB: {len(docs)}")
    for d in docs:
        print(f"  - alert_id={d.get('alert_id')}, patient_id={d.get('patient_id')}, name={d.get('patient_name')}, status={d.get('status')}, created_at={d.get('created_at')}")
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(inspect_active_alerts())
