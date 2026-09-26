import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import database

async def main():
    await database.connect_to_mongo()
    doc_col = database.get_collection('doctors')
    doctors = await doc_col.find({}).to_list(10)
    print("DOCTORS IN DATABASE:")
    for d in doctors:
        print(f"ID: {d.get('doctor_id')}, Name: {d.get('full_name')}, Phone: {d.get('phone')}, Spec: {d.get('specialization')}, Facility: {d.get('assigned_facility')}")
    
    pat_col = database.get_collection('patients')
    patients = await pat_col.find({}).to_list(10)
    print(f"\nPATIENTS COUNT: {len(patients)}")
    for p in patients:
        print(f"ID: {p.get('patient_id')}, Name: {p.get('full_name')}")

if __name__ == "__main__":
    asyncio.run(main())
