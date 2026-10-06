import asyncio
import httpx
from database import connect_to_mongo, close_mongo_connection, get_collection, COLLECTION_INVENTORY, COLLECTION_ASHA_WORKERS


async def test_full_flow():
    print("==================================================")
    print("   AyushLink Full End-to-End Inventory Test Flow  ")
    print("==================================================")

    base_url = "http://127.0.0.1:8000/api"

    async with httpx.AsyncClient(base_url=base_url) as client:
        # Step 1: ASHA Login
        print("\n--- 1. Testing ASHA Worker Login ---")
        login_res = await client.post(
            "/asha/login",
            json={"phone": "9837373773", "password": "123456"}
        )
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        login_data = login_res.json()
        token = login_data["access_token"]
        worker = login_data["asha_worker"]
        worker_id = worker["worker_id"]
        print(f"[OK] Logged in as: {worker['full_name']} (ID: {worker_id})")
        print(f"[OK] Received JWT Token: {token[:20]}...")

        headers = {"Authorization": f"Bearer {token}"}

        # Step 2: Fetch Inventory for this logged-in ASHA worker
        print("\n--- 2. Testing Fetch Inventory (MongoDB-backed) ---")
        inv_res = await client.get("/asha/inventory", headers=headers)
        assert inv_res.status_code == 200, f"Get inventory failed: {inv_res.text}"
        inv_data = inv_res.json()
        items = inv_data["items"]
        assert len(items) > 0, "No inventory items found!"
        print(f"[OK] Retrieved {len(items)} items from MongoDB")
        print(f"[OK] Total: {inv_data['total']}, Low stock: {inv_data['low_stock_count']}, Out of stock: {inv_data['out_of_stock_count']}")

        # Verify all items belong to this worker
        for item in items:
            assert item["asha_worker_id"] == worker_id, f"Item {item['item_id']} worker_id mismatch!"
        print("[OK] Verified all items belong strictly to logged-in ASHA worker.")

        # Step 3: Increase Stock
        target_item = items[0]
        item_id = target_item["item_id"]
        initial_stock = target_item["stock"]
        print(f"\n--- 3. Testing Increase Stock for {item_id} ({target_item['name']}) ---")
        print(f"     Initial stock: {initial_stock}")

        inc_res = await client.post(
            f"/asha/inventory/{item_id}/adjust",
            headers=headers,
            json={"delta": 1}
        )
        assert inc_res.status_code == 200, f"Stock increase failed: {inc_res.text}"
        inc_data = inc_res.json()
        assert inc_data["stock"] == initial_stock + 1, f"Expected {initial_stock + 1}, got {inc_data['stock']}"
        print(f"[OK] Increased stock by +1 -> New Stock: {inc_data['stock']}")

        # Step 4: Decrease Stock
        print(f"\n--- 4. Testing Decrease Stock for {item_id} ---")
        dec_res = await client.post(
            f"/asha/inventory/{item_id}/adjust",
            headers=headers,
            json={"delta": -1}
        )
        assert dec_res.status_code == 200, f"Stock decrease failed: {dec_res.text}"
        dec_data = dec_res.json()
        assert dec_data["stock"] == initial_stock, f"Expected {initial_stock}, got {dec_data['stock']}"
        print(f"[OK] Decreased stock by -1 -> Stock restored to: {dec_data['stock']}")

        # Step 5: Direct update via PATCH
        print(f"\n--- 5. Testing Direct Update via PATCH /asha/inventory/{item_id} ---")
        patch_res = await client.patch(
            f"/asha/inventory/{item_id}",
            headers=headers,
            json={"stock": 25}
        )
        assert patch_res.status_code == 200, f"PATCH failed: {patch_res.text}"
        patch_data = patch_res.json()
        assert patch_data["stock"] == 25, f"Expected 25, got {patch_data['stock']}"
        assert patch_data["status"] == "ok", f"Expected 'ok', got {patch_data['status']}"
        print(f"[OK] PATCH updated stock to 25 with status: {patch_data['status']}")

        # Step 6: Verify MongoDB Persistence directly
        print("\n--- 6. Verifying MongoDB Database Persistence ---")
        await connect_to_mongo()
        inv_col = get_collection(COLLECTION_INVENTORY)
        db_doc = await inv_col.find_one({"asha_worker_id": worker_id, "item_id": item_id})
        assert db_doc is not None, "MongoDB document missing!"
        assert db_doc["stock"] == 25, f"MongoDB persisted stock mismatch: expected 25, got {db_doc['stock']}"
        print(f"[OK] Direct MongoDB query confirmed stock in database = {db_doc['stock']}")

        # Reset item stock back to initial
        await inv_col.update_one(
            {"asha_worker_id": worker_id, "item_id": item_id},
            {"$set": {"stock": initial_stock}}
        )
        print(f"[OK] Restored initial stock ({initial_stock}) in MongoDB.")

        # Step 7: Multi-Worker Isolation Test
        print("\n--- 7. Testing Multi-Worker Inventory Isolation ---")
        login_res2 = await client.post(
            "/asha/login",
            json={"phone": "9876500001", "password": "123456"}
        )
        assert login_res2.status_code == 200
        token2 = login_res2.json()["access_token"]
        worker2 = login_res2.json()["asha_worker"]
        worker2_id = worker2["worker_id"]

        inv_res2 = await client.get("/asha/inventory", headers={"Authorization": f"Bearer {token2}"})
        inv_data2 = inv_res2.json()
        for item2 in inv_data2["items"]:
            assert item2["asha_worker_id"] == worker2_id
            assert item2["asha_worker_id"] != worker_id

        print(f"[OK] Worker 2 ({worker2_id}) has their own isolated inventory of {len(inv_data2['items'])} items.")

    await close_mongo_connection()
    print("\n==================================================")
    print(" [PASS] Complete End-to-End Inventory Flow Passed! ")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(test_full_flow())
