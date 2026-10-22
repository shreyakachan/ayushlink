import asyncio
import sys
import os
import json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import connect_to_mongo, close_mongo_connection, get_collection, COLLECTION_EMERGENCY_ALERTS, COLLECTION_ASHA_WORKERS

async def inspect():
    await connect_to_mongo()
    alerts_col = get_collection(COLLECTION_EMERGENCY_ALERTS)
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)

    # 1. Inspect all active or unacknowledged alerts
    cursor = alerts_col.find({"status": {"$ne": "RESOLVED"}}).sort("created_at", -1)
    unresolved = await cursor.to_list(100)
    print(f"=== Total Non-RESOLVED Alerts in MongoDB: {len(unresolved)} ===")
    for u in unresolved:
        print(f"Alert ID: {u.get('alert_id')}")
        print(f"  Patient: {u.get('patient_name')} ({u.get('patient_id')})")
        print(f"  Village: {u.get('village')}")
        print(f"  Status: {u.get('status')}")
        print(f"  ASHA Status: {u.get('asha_status')}")
        print(f"  PHC Status: {u.get('phc_status')}")
        print(f"  ASHA Worker ID: {u.get('asha_worker_id')}")
        print(f"  Caller Role: {u.get('caller_role')}")
        print(f"  Emergency Notes: {u.get('emergency_notes')}")
        print(f"  Created At: {u.get('created_at')}")
        print("-" * 50)

    # 2. Inspect active alerts for each ASHA worker
    ashas = await asha_col.find({}).to_list(100)
    print(f"\n=== ASHA Workers in System: {len(ashas)} ===")
    from services.lora_emergency_service import get_active_emergency_alerts
    for a in ashas:
        worker_id = a.get("worker_id")
        name = a.get("full_name")
        villages = a.get("assigned_villages")
        alerts_for_asha = await get_active_emergency_alerts(a)
        print(f"ASHA Worker: {name} (ID: {worker_id}, Villages: {villages})")
        print(f"  Active alerts returned by get_active_emergency_alerts: {len(alerts_for_asha)}")
        for alert_resp in alerts_for_asha:
            print(f"    -> Alert ID: {alert_resp.alert_id}, Patient: {alert_resp.patient_name} ({alert_resp.patient_id}), Status: {alert_resp.status}, ASHA Status: {alert_resp.asha_status}")

    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(inspect())
