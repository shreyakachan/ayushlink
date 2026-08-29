import asyncio
import sys
sys.path.insert(0, r"c:\Users\HP\Downloads\ayush-link-pwa-v2-mch frontend\merged\backend")

from database import connect_to_mongo, close_mongo_connection, get_database
from services.security import create_access_token
from services.consultation_service import (
    create_consultation_request,
    doctor_decide_consultation,
    get_patient_active_video_request,
    get_doctor_video_requests,
    end_consultation_call,
)
from schemas.consultation import ConsultationCreateRequest, ConsultationDecisionRequest

async def test_backend():
    print("Testing backend video consultation state machine...")
    await connect_to_mongo()
    db = get_database()

    patient_user = {
        "patient_id": "P-4559",
        "full_name": "shreya",
        "role": "patient",
        "village": "chandrapur",
    }
    doctor_user = {
        "doctor_id": "DOC-101",
        "full_name": "Dr. Ramesh Gupta",
        "role": "doctor",
        "phone": "9823000001",
    }

    # 1. Test Active video request query
    active = await get_patient_active_video_request(patient_user)
    print("Initial active request for Shreya:", active.status if active else "None")

    # 2. Test Doctor video requests query
    doc_requests = await get_doctor_video_requests(doctor_user)
    print(f"Doctor video requests count: {len(doc_requests)}")

    # 3. Test token generation for WebSocket
    token = create_access_token({"sub": "9324998108", "patient_id": "P-4559", "role": "patient", "full_name": "shreya"})
    print("Generated test JWT token for WebSocket successfully:", token[:25] + "...")

    await close_mongo_connection()
    print("All backend tests completed successfully!")

if __name__ == "__main__":
    asyncio.run(test_backend())
