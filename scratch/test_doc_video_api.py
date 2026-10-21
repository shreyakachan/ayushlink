import asyncio
import os
import sys
from httpx import AsyncClient, ASGITransport

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from main import app
from database.mongodb import connect_to_mongo, close_mongo_connection
from services.security import create_access_token

async def test():
    await connect_to_mongo()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = create_access_token({"sub": "DOC-501", "doctor_id": "DOC-501", "role": "doctor", "name": "Dr. Arvind Varma"})
        headers = {"Authorization": f"Bearer {token}"}
        resp = await client.get("/api/doctor/video-requests", headers=headers)
        print("Status:", resp.status_code)
        data = resp.json()
        print("Total Video Requests for DOC-501:", len(data))
        for r in data:
            print("  - ID:", r.get("consultation_id"), "Patient:", r.get("patient_name"), "PID:", r.get("patient_id"), "Status:", r.get("status"), "Doctor:", r.get("doctor_name"))
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(test())
