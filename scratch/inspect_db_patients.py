import asyncio
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from database import connect_to_mongo, close_mongo_connection, get_collection, COLLECTION_PATIENTS, COLLECTION_ASHA_WORKERS, COLLECTION_DOCTORS

async def main():
    await connect_to_mongo()
    pat_col = get_collection(COLLECTION_PATIENTS)
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)
    doc_col = get_collection(COLLECTION_DOCTORS)

    print("--- PATIENTS ---")
    async for p in pat_col.find({}):
        print(f"ID: {p.get('patient_id')}, Name: {p.get('full_name')}, Village: {p.get('village')}, Phone: {p.get('phone')}, ASHA: {p.get('asha_worker_id')}")

    print("\n--- ASHA WORKERS ---")
    async for a in asha_col.find({}):
        print(f"WorkerID: {a.get('worker_id')}, Name: {a.get('full_name')}, Phone: {a.get('phone')}, Villages: {a.get('assigned_villages')}")

    print("\n--- DOCTORS ---")
    async for d in doc_col.find({}):
        print(f"DocID: {d.get('doctor_id')}, Name: {d.get('full_name')}, Phone: {d.get('phone')}")

    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(main())
