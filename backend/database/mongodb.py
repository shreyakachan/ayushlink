import logging
from typing import Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from config import settings

logger = logging.getLogger("ayushlink.database")

# Collection Name Constants
COLLECTION_PATIENTS = "patients"
COLLECTION_ASHA_WORKERS = "asha_workers"
COLLECTION_DOCTORS = "doctors"
COLLECTION_SYMPTOMS = "symptoms"
COLLECTION_PRESCRIPTIONS = "prescriptions"
COLLECTION_CONSULTATIONS = "consultations"
COLLECTION_NOTIFICATIONS = "notifications"
COLLECTION_SYNC_LOGS = "sync_logs"
COLLECTION_INVENTORY = "inventory"
COLLECTION_EMERGENCY_ALERTS = "emergency_alerts"


class MongoDB:
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None


db_instance = MongoDB()


async def init_db_indexes():
    """Ensure unique indexes exist on core identity fields for duplicate protection."""
    if db_instance.db is None:
        return
    try:
        # Doctors unique indexes
        await db_instance.db[COLLECTION_DOCTORS].create_index("phone", unique=True, sparse=True)
        await db_instance.db[COLLECTION_DOCTORS].create_index("doctor_id", unique=True, sparse=True)

        # ASHA workers unique indexes
        await db_instance.db[COLLECTION_ASHA_WORKERS].create_index("phone", unique=True, sparse=True)
        await db_instance.db[COLLECTION_ASHA_WORKERS].create_index("worker_id", unique=True, sparse=True)

        # Patients unique indexes
        await db_instance.db[COLLECTION_PATIENTS].create_index("phone", unique=True, sparse=True)
        await db_instance.db[COLLECTION_PATIENTS].create_index("patient_id", unique=True, sparse=True)

        # Symptoms unique index
        await db_instance.db[COLLECTION_SYMPTOMS].create_index("symptom_id", unique=True, sparse=True)

        # Consultations unique index
        await db_instance.db[COLLECTION_CONSULTATIONS].create_index("consultation_id", unique=True, sparse=True)

        # Prescriptions unique index
        await db_instance.db[COLLECTION_PRESCRIPTIONS].create_index("prescription_id", unique=True, sparse=True)

        # Notifications indexes
        await db_instance.db[COLLECTION_NOTIFICATIONS].create_index("notification_id", unique=True, sparse=True)
        await db_instance.db[COLLECTION_NOTIFICATIONS].create_index([("patient_id", 1), ("created_at", -1)])

        # Inventory collection indexes
        await db_instance.db[COLLECTION_INVENTORY].create_index([("asha_worker_id", 1), ("item_id", 1)], unique=True, sparse=True)
        await db_instance.db[COLLECTION_INVENTORY].create_index("asha_worker_id")

        # Emergency alerts collection indexes
        await db_instance.db[COLLECTION_EMERGENCY_ALERTS].create_index("alert_id", unique=True, sparse=True)
        await db_instance.db[COLLECTION_EMERGENCY_ALERTS].create_index("patient_id")
        await db_instance.db[COLLECTION_EMERGENCY_ALERTS].create_index([("village", 1), ("status", 1)])
        await db_instance.db[COLLECTION_EMERGENCY_ALERTS].create_index([("created_at", -1)])
        logger.info("MongoDB unique indexes verified successfully.")
    except Exception as e:
        logger.warning(f"Note on MongoDB index verification: {e}")


async def connect_to_mongo():
    """Initialize MongoDB async client, select database, and verify indexes."""
    try:
        logger.info(f"Connecting to MongoDB at {settings.MONGODB_URL}...")
        db_instance.client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            serverSelectionTimeoutMS=5000,
        )
        db_instance.db = db_instance.client[settings.MONGODB_DB_NAME]
        logger.info(f"Connected to MongoDB database: {settings.MONGODB_DB_NAME}")
        # Verify and apply unique indexes (strictly zero automatic data seeding)
        await init_db_indexes()
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        raise e



async def close_mongo_connection():
    """Close MongoDB connection gracefully on shutdown."""
    if db_instance.client is not None:
        logger.info("Closing MongoDB connection...")
        db_instance.client.close()
        db_instance.client = None
        db_instance.db = None
        logger.info("MongoDB connection closed.")


def get_database() -> Optional[AsyncIOMotorDatabase]:
    """Dependency helper to get the database instance."""
    return db_instance.db


def get_collection(collection_name: str):
    """Helper to access a specific collection."""
    if db_instance.db is None:
        return None
    return db_instance.db[collection_name]


async def ping_database() -> Dict[str, Any]:
    """Test MongoDB connection by sending a ping command."""
    if db_instance.client is None:
        return {
            "status": "disconnected",
            "database": settings.MONGODB_DB_NAME,
            "error": "MongoDB client is not initialized",
        }
    try:
        await db_instance.client.admin.command("ping")
        return {
            "status": "connected",
            "database": settings.MONGODB_DB_NAME,
            "url": settings.MONGODB_URL,
        }
    except Exception as e:
        return {
            "status": "error",
            "database": settings.MONGODB_DB_NAME,
            "error": str(e),
        }
