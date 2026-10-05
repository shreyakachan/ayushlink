import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def inspect():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["ayushlink_db"]

    print("=== ALL NOTIFICATIONS IN DB ===")
    cursor = db.notifications.find().sort("created_at", -1)
    async for n in cursor:
        print(f"ID: {n.get('notification_id')} | PatientID: {n.get('patient_id')} | PatientName: {n.get('patient_name')} | Title: {n.get('title')} | IsRead: {n.get('is_read')} | RecipientRole: {n.get('recipient_role')} | Msg: {n.get('message')}")

if __name__ == "__main__":
    asyncio.run(inspect())
