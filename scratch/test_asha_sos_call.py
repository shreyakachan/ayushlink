import asyncio
import httpx

async def test():
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000") as client:
        # 1. Login as ASHA
        res = await client.post("/api/asha/login", json={"phone": "9876500001", "password": "123456"})
        print("ASHA login status:", res.status_code)
        if res.status_code != 200:
            print(res.text)
            return
        asha_token = res.json()["access_token"]
        
        # 2. Get patients
        p_res = await client.get("/api/patients", headers={"Authorization": f"Bearer {asha_token}"})
        print("Get patients status:", p_res.status_code)
        patients = p_res.json()
        print(f"Loaded {len(patients)} patients")
        target_p = patients[0]
        print(f"Target patient: {target_p.get('patient_id')} - {target_p.get('full_name')}")
        
        # 3. Post SOS as ASHA with target patient ID
        sos_payload = {
            "patient_id": target_p.get("patient_id"),
            "patient_name": target_p.get("full_name"),
            "village": target_p.get("village"),
            "emergency_type": "general_sos",
            "emergency_notes": f"Emergency SOS triggered by ASHA Worker for patient {target_p.get('patient_id')}"
        }
        sos_res = await client.post("/api/emergency/sos", json=sos_payload, headers={"Authorization": f"Bearer {asha_token}"})
        print("ASHA SOS status:", sos_res.status_code)
        res_data = sos_res.json()
        print(f"Alert ID: {res_data.get('alert_id')}")
        print(f"Patient ID: {res_data.get('patient_id')}")
        print(f"Patient Name: {res_data.get('patient_name')}")
        print(f"ASHA Worker ID: {res_data.get('asha_worker_id')}")
        print(f"Primary PHC: {res_data.get('primary_phc')}")

asyncio.run(test())
