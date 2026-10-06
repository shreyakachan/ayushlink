import asyncio
from datetime import datetime, timezone
from database import connect_to_mongo, close_mongo_connection, get_collection, COLLECTION_INVENTORY, COLLECTION_ASHA_WORKERS
from services.inventory_service import DEFAULT_MEDICINE_KIT


async def seed_inventory():
    print("Connecting to MongoDB for Inventory Seeding...")
    await connect_to_mongo()
    inv_col = get_collection(COLLECTION_INVENTORY)
    asha_col = get_collection(COLLECTION_ASHA_WORKERS)

    if inv_col is None or asha_col is None:
        print("[ERROR] MongoDB collections unavailable.")
        return

    # Find all ASHA workers
    workers = await asha_col.find({}).to_list(length=100)
    worker_ids = [w.get("worker_id") for w in workers if w.get("worker_id")]

    # Include default demo IDs
    if "ASHA-833" not in worker_ids:
        worker_ids.append("ASHA-833")
    if "ASHA-101" not in worker_ids:
        worker_ids.append("ASHA-101")
    if "ASHA-775" not in worker_ids:
        worker_ids.append("ASHA-775")
    if "ASHA-340" not in worker_ids:
        worker_ids.append("ASHA-340")

    now = datetime.now(timezone.utc)
    total_seeded = 0

    for wid in worker_ids:
        for med in DEFAULT_MEDICINE_KIT:
            doc = {
                "item_id": med["item_id"],
                "asha_worker_id": wid,
                "name": med["name"],
                "category": med["category"],
                "stock": med["stock"],
                "unit": med["unit"],
                "threshold": med["threshold"],
                "created_at": now,
                "updated_at": now,
            }
            await inv_col.update_one(
                {"asha_worker_id": wid, "item_id": med["item_id"]},
                {"$set": doc},
                upsert=True,
            )
            total_seeded += 1

    print(f"[SUCCESS] Upserted {total_seeded} inventory records across {len(worker_ids)} ASHA workers.")
    await close_mongo_connection()


if __name__ == "__main__":
    asyncio.run(seed_inventory())
