import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['ayushlink_db']
    async for c in db.consultations.find().sort('_id', -1).limit(5):
        print(c.get('consultation_id'), c.get('status'), c.get('patient_id'), c.get('doctor_id'), c.get('created_at'), c.get('updated_at'))

if __name__ == '__main__':
    asyncio.run(main())
