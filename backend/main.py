import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from schemas.health import HealthResponse
from routes import api_router
from database import connect_to_mongo, close_mongo_connection, ping_database

logger = logging.getLogger("ayushlink")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to MongoDB (non-fatal warning if local mongo is offline)
    try:
        await connect_to_mongo()
    except Exception as e:
        logger.warning(f"Note: MongoDB not reached at startup: {e}")
    yield
    # Shutdown: Close connection
    await close_mongo_connection()


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Enable CORS for frontend communication
cors_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
if isinstance(settings.CORS_ORIGINS, list):
    cors_origins.extend([o for o in settings.CORS_ORIGINS if o != "*"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers under API_V1_STR (default "/api")
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/")
async def root():
    db_status = await ping_database()
    return {
        "name": settings.PROJECT_NAME,
        "status": "running",
        "database": db_status.get("status"),
        "docs": "/docs",
        "health": f"{settings.API_V1_STR}/health",
    }


@app.get("/health", response_model=HealthResponse, include_in_schema=False)
async def health_root():
    return {"status": "ok"}


@app.get("/api/health", response_model=HealthResponse, include_in_schema=False)
async def health_api_root():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=True)
