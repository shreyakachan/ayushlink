import httpx
import asyncio

async def test_flow():
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000/api") as client:
        # 1. Login Patient Shreya
        pat_login = await client.post("/patient/login", json={"phone": "9324998108", "password": "password123"})
        if pat_login.status_code != 200:
            pat_login = await client.post("/patient/login", json={"phone": "9324998108", "password": "123456"})
        print("Patient login status:", pat_login.status_code, pat_login.json().get("patient", {}).get("full_name"))
        pat_token = pat_login.json().get("access_token")
        pat_headers = {"Authorization": f"Bearer {pat_token}"}

        # 2. Login Doctor
        doc_login = await client.post("/doctor/login", json={"phone": "9823000001", "password": "DoctorSecurePass123"})
        if doc_login.status_code != 200:
            doc_login = await client.post("/doctor/login", json={"phone": "9823000001", "password": "password123"})
        print("Doctor login status:", doc_login.status_code, doc_login.json().get("doctor", {}).get("full_name"))
        doc_token = doc_login.json().get("access_token")
        doc_headers = {"Authorization": f"Bearer {doc_token}"}

        # Check existing active request
        check1 = await client.get("/consultations/active-request", headers=pat_headers)
        print("Check active before request:", check1.status_code, check1.json())

        # Clean/End any existing active call first
        if check1.json():
            existing_id = check1.json()["consultation_id"]
            await client.post(f"/consultations/{existing_id}/end-call", headers=pat_headers)
            print("Ended previous consultation", existing_id)

        # 3. Patient requests video call
        req_res = await client.post("/consultations/request", json={
            "doctor_id": "DOC-101",
            "reason": "Test headache call",
            "urgency": "routine",
            "symptoms": ["headache"]
        }, headers=pat_headers)
        print("Request created:", req_res.status_code, req_res.json()["consultation_id"], req_res.json()["status"])
        cons_id = req_res.json()["consultation_id"]

        # 4. Patient polls active-request
        poll1 = await client.get("/consultations/active-request", headers=pat_headers)
        print("Poll 1 (waiting): status in DB is:", poll1.json()["status"])

        # 5. Doctor accepts
        accept_res = await client.post(f"/consultations/{cons_id}/decision", json={"action": "accept"}, headers=doc_headers)
        print("Doctor accept status:", accept_res.status_code, accept_res.json()["status"])

        # 6. Patient polls active-request again
        poll2 = await client.get("/consultations/active-request", headers=pat_headers)
        print("Poll 2 (after accept): status in DB is:", poll2.json()["status"])

        # Clean up
        await client.post(f"/consultations/{cons_id}/end-call", headers=pat_headers)
        print("Cleaned up consultation", cons_id)

if __name__ == "__main__":
    asyncio.run(test_flow())
