import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def cleanup_notifications():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["ayushlink_db"]

    test_patient_ids = ["P-1837", "P-5070", "P-9926", "P-4321", "P-9470", "P-1710", "P-3162", "Q-901"]
    test_offline_notif_prefixes = ["OFFLINE-SYM-TEST-"]

    print("Cleaning up invalid test notifications...")
    
    # 1. Delete notifications for test patient IDs (Meena Devi, Sunita Devi test runs, etc.)
    res1 = await db.notifications.delete_many({
        "$or": [
            {"patient_id": {"$in": test_patient_ids}},
            {"patient_name": {"$in": ["Meena Devi", "Sunita Devi", "TestPatient MedRec1", "TestPatient MedRec2", "TestPatient DoctorQueue"]}},
            {"offline_id": {"$regex": r"^OFFLINE-SYM-TEST-"}},
            {"notification_id": {"$in": ["NOTIF-CONS-CONS-5686", "NOTIF-CONS-CONS-3852"]}},
        ]
    })
    print(f"Deleted {res1.deleted_count} invalid test notification records.")

    # 2. View remaining notifications
    print("\n=== REMAINING NOTIFICATIONS IN DB ===")
    cursor = db.notifications.find().sort("created_at", -1)
    async for n in cursor:
        print(f"ID: {n.get('notification_id')} | PatientID: {n.get('patient_id')} | PatientName: {n.get('patient_name')} | Title: {n.get('title')} | IsRead: {n.get('is_read')} | Msg: {n.get('message')}")

if __name__ == "__main__":
    asyncio.run(cleanup_notifications())
