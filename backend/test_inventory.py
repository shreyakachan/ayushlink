import asyncio
import httpx
from database import connect_to_mongo, close_mongo_connection, get_collection, COLLECTION_INVENTORY, COLLECTION_ASHA_WORKERS
from services.security import hash_password, create_access_token


async def test_inventory_api():
    print("========================================")
    print("   AyushLink Inventory Module Test      ")
    print("========================================")

    await connect_to_mongo()
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)
    inv_col = get_collection(COLLECTION_INVENTORY)

    worker_phone = "9837373773"  # Swati Deshmukh
    worker = await asha_col.find_one({"phone": worker_phone})
    if not worker:
        worker = {
            "worker_id": "ASHA-833",
            "full_name": "Swati Deshmukh",
            "phone": worker_phone,
            "hashed_password": hash_password("123456"),
            "assigned_villages": ["Chandapur", "Nandgaon"],
            "primary_phc": "Chandapur PHC",
            "preferred_language": "en",
            "is_active": True,
        }
        await asha_col.insert_one(worker)

    worker_id = worker.get("worker_id", "ASHA-833")

    # Generate JWT token
    token = create_access_token({
        "sub": worker_id,
        "role": "asha",
        "phone": worker_phone,
        "name": worker.get("full_name"),
    })

    headers = {"Authorization": f"Bearer {token}"}
    base_url = "http://127.0.0.1:8000/api"

    async with httpx.AsyncClient(base_url=base_url) as client:
        # 1. Test GET /asha/inventory
        res = await client.get("/asha/inventory", headers=headers)
        assert res.status_code == 200, f"GET /asha/inventory failed: {res.text}"
        data = res.json()
        assert "items" in data, "Response missing 'items'"
        assert len(data["items"]) > 0, "No inventory items returned"
        print(f"[OK] GET /asha/inventory returned {len(data['items'])} items (low_stock: {data['low_stock_count']})")

        first_item = data["items"][0]
        item_id = first_item["item_id"]
        initial_stock = first_item["stock"]
        print(f"     Testing stock adjustment on item {item_id} ({first_item['name']}), initial stock = {initial_stock}")

        # 2. Test POST /asha/inventory/{item_id}/adjust (+5)
        adj_res = await client.post(f"/asha/inventory/{item_id}/adjust", headers=headers, json={"delta": 5})
        assert adj_res.status_code == 200, f"Stock increase failed: {adj_res.text}"
        updated = adj_res.json()
        assert updated["stock"] == initial_stock + 5, f"Expected {initial_stock + 5}, got {updated['stock']}"
        print(f"[OK] POST /asha/inventory/{item_id}/adjust (+5) -> new stock = {updated['stock']}")

        # 3. Test POST /asha/inventory/{item_id}/adjust (-2)
        adj_res2 = await client.post(f"/asha/inventory/{item_id}/adjust", headers=headers, json={"delta": -2})
        assert adj_res2.status_code == 200, f"Stock decrease failed: {adj_res2.text}"
        updated2 = adj_res2.json()
        assert updated2["stock"] == initial_stock + 3, f"Expected {initial_stock + 3}, got {updated2['stock']}"
        print(f"[OK] POST /asha/inventory/{item_id}/adjust (-2) -> new stock = {updated2['stock']}")

        # 4. Verify in MongoDB directly
        db_doc = await inv_col.find_one({"asha_worker_id": worker_id, "item_id": item_id})
        assert db_doc is not None, "MongoDB document not found!"
        assert db_doc["stock"] == initial_stock + 3, f"MongoDB stock mismatch: expected {initial_stock + 3}, got {db_doc['stock']}"
        print(f"[OK] Direct MongoDB query verified stock in DB = {db_doc['stock']}")

        # 5. Restore original stock
        await client.post(f"/asha/inventory/{item_id}/adjust", headers=headers, json={"delta": -3})
        print(f"[OK] Reset item {item_id} stock back to {initial_stock}")

    await close_mongo_connection()
    print("\n[PASS] All backend inventory API & MongoDB tests passed successfully!")


if __name__ == "__main__":
    asyncio.run(test_inventory_api())
