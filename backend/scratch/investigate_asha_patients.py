import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database.mongodb import connect_to_mongo, close_mongo_connection, get_database, COLLECTION_ASHA_WORKERS, COLLECTION_PATIENTS
from services.patient_service import list_patients_for_user

async def investigate():
    await connect_to_mongo()
    db = get_database()
    
    print("=" * 80)
    print("1. ALL ASHA WORKER ACCOUNTS IN DATABASE:")
    print("=" * 80)
    cursor_asha = db[COLLECTION_ASHA_WORKERS].find({})
    ashas = await cursor_asha.to_list(100)
    for a in ashas:
        print(f"ASHA ID: {a.get('worker_id')}, Name: {a.get('full_name')}, Phone: {a.get('phone')}, Villages: {a.get('assigned_villages')}, PHC: {a.get('primary_phc')}")
    
    # Check default logged in ASHA (phone 9837373773)
    logged_in_asha = await db[COLLECTION_ASHA_WORKERS].find_one({"$or": [{"phone": "9837373773"}, {"phone": "+91 9837373773"}]})
    print("\n" + "=" * 80)
    print("2. LOGGED-IN ASHA DETAILS (phone 9837373773):")
    print("=" * 80)
    for k, v in logged_in_asha.items():
        if k != "hashed_password":
            print(f"  {k}: {v}")

    print("\n" + "=" * 80)
    print("3. ALL PATIENT RECORDS IN MONGODB:")
    print("=" * 80)
    cursor_pat = db[COLLECTION_PATIENTS].find({}).sort("created_at", -1)
    all_patients = await cursor_pat.to_list(100)
    print(f"Total Patients in MongoDB: {len(all_patients)}")
    for idx, p in enumerate(all_patients, 1):
        print(f"{idx}. ID: {p.get('patient_id')}, Name: {p.get('full_name')}, Phone: {p.get('phone')}, Village: '{p.get('village')}', ASHA Worker ID: '{p.get('asha_worker_id')}', Created: {p.get('created_at')}")

    print("\n" + "=" * 80)
    print("4. BACKEND QUERY SIMULATION (list_patients_for_user):")
    print("=" * 80)
    res_patients = await list_patients_for_user(logged_in_asha)
    print(f"Total Patients returned by list_patients_for_user: {len(res_patients)}")
    for idx, p in enumerate(res_patients, 1):
        print(f"{idx}. ID: {p.patient_id}, Name: {p.full_name}, Village: '{p.village}', Phone: {p.phone}")

    print("\n" + "=" * 80)
    print("5. BREAKDOWN OF WHY EACH PATIENT WAS RETURNED:")
    print("=" * 80)
    assigned_villages = logged_in_asha.get("assigned_villages", [])
    worker_id = logged_in_asha.get("worker_id")
    print(f"ASHA Worker ID: {worker_id}")
    print(f"Assigned Villages: {assigned_villages}")
    
    for idx, p in enumerate(all_patients, 1):
        pid = p.get("patient_id")
        p_name = p.get("full_name")
        p_village = p.get("village", "")
        p_asha_id = p.get("asha_worker_id")
        
        reasons = []
        if p_asha_id == worker_id:
            reasons.append(f"Explicitly assigned to worker_id ({p_asha_id})")
        
        # Check village match
        for v in assigned_villages:
            if "chanda" in v.lower() and ("chanda" in p_village.lower() or "chandrapur" in p_village.lower()):
                reasons.append(f"Village matches regex for '{v}' (Patient village: '{p_village}')")
            elif v.strip().lower() == p_village.strip().lower():
                reasons.append(f"Village exact match for '{v}' (Patient village: '{p_village}')")

        if reasons:
            reason_str = " AND ".join(reasons)
            print(f"{idx}. [{pid}] {p_name} -> MATCHED via: {reason_str}")
        else:
            print(f"{idx}. [{pid}] {p_name} -> NOT MATCHED (Village: '{p_village}', asha_worker_id: '{p_asha_id}')")

    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(investigate())
