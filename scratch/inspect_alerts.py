import asyncio
import sys
sys.path.append('backend')
from database import connect_to_mongo, close_mongo_connection, get_collection, COLLECTION_EMERGENCY_ALERTS, COLLECTION_ASHA_WORKERS

async def check():
    await connect_to_mongo()
    col = get_collection(COLLECTION_EMERGENCY_ALERTS)
    alerts = await col.find().sort('created_at', -1).to_list(100)
    print(f'Total emergency alerts in DB: {len(alerts)}')
    for a in alerts[:20]:
        print(f"ID: {a.get('alert_id')}, Patient: {a.get('patient_name')} ({a.get('patient_id')}), Village: {a.get('village')}, Status: {a.get('status')}, asha_status: {a.get('asha_status')}, phc_status: {a.get('phc_status')}, asha_worker_id: {a.get('asha_worker_id')}, created_at: {a.get('created_at')}")

    # Check pending alerts specifically
    pending_query = {
        "status": {"$in": ["SOS_TRIGGERED", "LORA_TRANSMITTED", "GATEWAY_RECEIVED", "ASHA_NOTIFIED"]},
        "asha_status": {"$ne": "ACKNOWLEDGED"},
        "phc_status": {"$ne": "ACKNOWLEDGED"},
    }
    pending = await col.find(pending_query).sort('created_at', -1).to_list(100)
    print(f"\nTotal PENDING unacknowledged emergency alerts in DB: {len(pending)}")
    for p in pending:
        print(f"  PENDING -> ID: {p.get('alert_id')}, Patient: {p.get('patient_name')} ({p.get('patient_id')}), Village: {p.get('village')}, Status: {p.get('status')}, asha_worker_id: {p.get('asha_worker_id')}, created_at: {p.get('created_at')}")

    await close_mongo_connection()

asyncio.run(check())
