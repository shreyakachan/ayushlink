import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database.mongodb import connect_to_mongo, close_mongo_connection, get_database
from services.patient_service import list_patients_for_user

STALE_PATIENT_IDS = [
    "P-1606",
    "P-1352",
    "P-4405",
    "P-5694",
    "P-1193",
    "P-7639",
    "P-6303",
]

LEGITIMATE_PATIENT_IDS = [
    "P-4559",
    "P-2430",
    "P-4099",
]

async def cleanup():
    await connect_to_mongo()
    db = get_database()
    
    print("=" * 80)
    print("1. PRE-CLEANUP VERIFICATION")
    print("=" * 80)
    
    # Verify no overlap between stale and legitimate IDs
    overlap = set(STALE_PATIENT_IDS).intersection(set(LEGITIMATE_PATIENT_IDS))
    assert len(overlap) == 0, f"FATAL: Overlap between stale and legitimate IDs: {overlap}"
    
    # Check all existing collections in DB
    collections = await db.list_collection_names()
    print(f"Collections in database: {collections}")
    
    # Verify the patients to be deleted
    pats_cursor = db["patients"].find({"patient_id": {"$in": STALE_PATIENT_IDS}})
    pats_to_delete = await pats_cursor.to_list(100)
    print(f"Found {len(pats_to_delete)} stale patient documents to delete in 'patients':")
    for p in pats_to_delete:
        print(f"  - {p.get('patient_id')}: {p.get('full_name')} (Phone: {p.get('phone')}, Village: {p.get('village')})")
    
    # Check related collections for references to STALE_PATIENT_IDS
    print("\nChecking related collections for stale patient references:")
    related_counts = {}
    for coll_name in collections:
        if coll_name == "patients":
            continue
        try:
            count = await db[coll_name].count_documents({"patient_id": {"$in": STALE_PATIENT_IDS}})
            if count > 0:
                related_counts[coll_name] = count
                print(f"  - {coll_name}: {count} records matching stale patient IDs")
            else:
                # Also check for consultations or other fields
                count_alt = await db[coll_name].count_documents({"patient.patient_id": {"$in": STALE_PATIENT_IDS}})
                if count_alt > 0:
                    related_counts[f"{coll_name}.patient"] = count_alt
                    print(f"  - {coll_name} (nested patient.patient_id): {count_alt} records")
        except Exception as e:
            print(f"  - {coll_name}: Error checking: {e}")
            
    print("\n" + "=" * 80)
    print("2. PERFORMING CLEANUP")
    print("=" * 80)
    
    # Delete from patients collection
    del_res = await db["patients"].delete_many({"patient_id": {"$in": STALE_PATIENT_IDS}})
    print(f"Deleted {del_res.deleted_count} documents from 'patients' collection.")
    
    # Delete from any related collections if records exist
    for coll_name in collections:
        if coll_name in ["patients", "users", "asha_workers", "doctors"]:
            continue
        try:
            del_related = await db[coll_name].delete_many({"patient_id": {"$in": STALE_PATIENT_IDS}})
            if del_related.deleted_count > 0:
                print(f"Deleted {del_related.deleted_count} documents from '{coll_name}' collection.")
            del_nested = await db[coll_name].delete_many({"patient.patient_id": {"$in": STALE_PATIENT_IDS}})
            if del_nested.deleted_count > 0:
                print(f"Deleted {del_nested.deleted_count} documents with nested patient from '{coll_name}' collection.")
        except Exception as e:
            print(f"Error deleting from {coll_name}: {e}")

    print("\n" + "=" * 80)
    print("3. POST-CLEANUP VERIFICATION")
    print("=" * 80)
    
    # Check remaining patients
    remaining_cursor = db["patients"].find({}).sort("created_at", -1)
    remaining_patients = await remaining_cursor.to_list(100)
    print(f"Total remaining patients in MongoDB: {len(remaining_patients)}")
    for p in remaining_patients:
        print(f"  - ID: {p.get('patient_id')}, Name: {p.get('full_name')}, Village: '{p.get('village')}', Phone: {p.get('phone')}, ASHA ID: '{p.get('asha_worker_id')}'")
        
    # Verify exact match
    remaining_ids = [p.get("patient_id") for p in remaining_patients]
    for leg_id in LEGITIMATE_PATIENT_IDS:
        assert leg_id in remaining_ids, f"ERROR: Legitimate patient {leg_id} missing!"
    for stale_id in STALE_PATIENT_IDS:
        assert stale_id not in remaining_ids, f"ERROR: Stale patient {stale_id} still exists!"
        
    print("\n4. ASHA WORKER (Swati Deshmukh / ASHA-833) PATIENT LIST VERIFICATION:")
    logged_in_asha = await db["asha_workers"].find_one({"$or": [{"phone": "9837373773"}, {"phone": "+91 9837373773"}]})
    res_patients = await list_patients_for_user(logged_in_asha)
    print(f"Total Patients returned for ASHA Swati Deshmukh: {len(res_patients)}")
    for p in res_patients:
        print(f"  - ID: {p.patient_id}, Name: {p.full_name}, Village: '{p.village}', Phone: {p.phone}")
        
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(cleanup())
