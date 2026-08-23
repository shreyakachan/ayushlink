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
COLLECTION_SYNC_LOGS = "sync_logs"


class MongoDB:
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None


db_instance = MongoDB()


async def connect_to_mongo():
    """Initialize MongoDB async client and select database."""
    try:
        logger.info(f"Connecting to MongoDB at {settings.MONGODB_URL}...")
        db_instance.client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            serverSelectionTimeoutMS=5000,
        )
        db_instance.db = db_instance.client[settings.MONGODB_DB_NAME]
        logger.info(f"Connected to MongoDB database: {settings.MONGODB_DB_NAME}")
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
