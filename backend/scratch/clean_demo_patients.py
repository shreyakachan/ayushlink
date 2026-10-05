import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import (
    connect_to_mongo, close_mongo_connection, get_collection,
    COLLECTION_PATIENTS, COLLECTION_SYMPTOMS, COLLECTION_PRESCRIPTIONS,
    COLLECTION_CONSULTATIONS, COLLECTION_NOTIFICATIONS, COLLECTION_SYNC_LOGS
)

async def cleanup_demo_patients():
    await connect_to_mongo()
    demo_pids = ["P-4099", "P-2430"]
    cols = [
        COLLECTION_PATIENTS, COLLECTION_SYMPTOMS, COLLECTION_PRESCRIPTIONS,
        COLLECTION_CONSULTATIONS, COLLECTION_NOTIFICATIONS, COLLECTION_SYNC_LOGS
    ]
    
    print("--- Before Deletion ---")
    pat_col = get_collection(COLLECTION_PATIENTS)
    async for p in pat_col.find({}):
        print(f"  Existing patient in DB: {p.get('patient_id')} - {p.get('full_name')} ({p.get('phone')})")

    for cname in cols:
        col = get_collection(cname)
        if col is not None:
            c = await col.count_documents({"patient_id": {"$in": demo_pids}})
            print(f"Collection '{cname}' matching demo IDs {demo_pids}: {c} records")

    # Delete ONLY P-4099 and P-2430 from patients
    del_res = await pat_col.delete_many({"patient_id": {"$in": demo_pids}})
    print(f"\n[OK] Deleted from '{COLLECTION_PATIENTS}': {del_res.deleted_count} documents (P-4099, P-2430)")

    # Delete any related demo records in other collections
    for cname in [COLLECTION_SYMPTOMS, COLLECTION_PRESCRIPTIONS, COLLECTION_CONSULTATIONS, COLLECTION_NOTIFICATIONS]:
        col = get_collection(cname)
        if col is not None:
            dr = await col.delete_many({"patient_id": {"$in": demo_pids}})
            if dr.deleted_count > 0:
                print(f"[OK] Deleted from '{cname}': {dr.deleted_count} documents")

    print("\n--- After Deletion ---")
    async for p in pat_col.find({}):
        print(f"  Remaining legitimate patient: {p.get('patient_id')} - {p.get('full_name')} ({p.get('phone')})")
    
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(cleanup_demo_patients())
