import sys, os, asyncio
from datetime import datetime, timezone
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import connect_to_mongo, get_collection, COLLECTION_EMERGENCY_ALERTS

async def cleanup():
    await connect_to_mongo()
    alerts = get_collection(COLLECTION_EMERGENCY_ALERTS)
    res = await alerts.update_many(
        {"status": {"$in": ["SOS_TRIGGERED", "LORA_TRANSMITTED", "GATEWAY_RECEIVED", "ASHA_NOTIFIED"]}},
        {"$set": {
            "status": "RESOLVED",
            "asha_status": "ACKNOWLEDGED",
            "phc_status": "ACKNOWLEDGED",
            "resolved_at": datetime.now(timezone.utc),
            "resolution_notes": "Cleaned up old test alerts"
        }}
    )
    print(f"Cleaned up {res.modified_count} old test alerts.")

if __name__ == "__main__":
    asyncio.run(cleanup())
