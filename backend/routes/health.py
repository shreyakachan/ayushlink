from fastapi import APIRouter
from schemas.health import HealthResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
def get_health():
    return {"status": "ok"}
