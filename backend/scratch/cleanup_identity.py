import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import asyncio
from database import (
    connect_to_mongo,
    close_mongo_connection,
    get_collection,
    COLLECTION_PATIENTS,
    COLLECTION_SYMPTOMS,
    COLLECTION_NOTIFICATIONS,
)

async def cleanup():
    await connect_to_mongo()
    p_col = get_collection(COLLECTION_PATIENTS)
    s_col = get_collection(COLLECTION_SYMPTOMS)
    n_col = get_collection(COLLECTION_NOTIFICATIONS)

    # 1. Update patient canonical name
    res_p = await p_col.update_many(
        {"patient_id": "P-4559"},
        {"$set": {"full_name": "Shreya"}}
    )
    print(f"[PATIENTS] Updated {res_p.modified_count} record(s) for P-4559 to canonical name 'Shreya'")

    # 2. Update symptoms collection
    res_s = await s_col.update_many(
        {"patient_id": "P-4559"},
        {"$set": {"patient_name": "Shreya"}}
    )
    print(f"[SYMPTOMS] Updated {res_s.modified_count} symptom record(s) for P-4559 with canonical patient_name 'Shreya'")

    # 3. Update notifications collection
    async for n in n_col.find({"patient_id": "P-4559"}):
        msg = n.get("message", "")
        pname = n.get("patient_name", "")
        updates = {}
        if pname and "Shreya Shinde" in pname:
            updates["patient_name"] = pname.replace("Shreya Shinde", "Shreya")
        if msg and "Shreya Shinde" in msg:
            updates["message"] = msg.replace("Shreya Shinde", "Shreya")
        if updates:
            await n_col.update_one({"_id": n["_id"]}, {"$set": updates})
            print(f"[NOTIFICATIONS] Corrected notification {n.get('notification_id', '')} -> {updates}")

    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(cleanup())
