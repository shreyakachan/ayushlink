import asyncio
import sys
sys.path.append('backend')
from services.lora_emergency_service import get_active_emergency_alerts
from database import connect_to_mongo, close_mongo_connection, get_collection, COLLECTION_ASHA_WORKERS, COLLECTION_DOCTORS, COLLECTION_PATIENTS

async def test_all():
    await connect_to_mongo()
    ashas = await get_collection(COLLECTION_ASHA_WORKERS).find().to_list(100)
    for a in ashas:
        alerts = await get_active_emergency_alerts(a)
        name = a.get("full_name") or a.get("name")
        wid = a.get("worker_id")
        print(f"ASHA: {name} ({wid}) -> active alerts: {len(alerts)}")
    
    docs = await get_collection(COLLECTION_DOCTORS).find().to_list(100)
    for d in docs:
        alerts = await get_active_emergency_alerts(d)
        name = d.get("full_name") or d.get("name")
        did = d.get("doctor_id")
        print(f"Doctor: {name} ({did}) -> active alerts: {len(alerts)}")

    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(test_all())
