from fastapi import APIRouter
from routes.health import router as health_router
from routes.patients import router as patient_router
from routes.asha_workers import router as asha_router
from routes.medical_records import router as medical_records_router
from routes.doctors import router as doctor_router
from routes.prescriptions import router as prescription_router
from routes.consultations import router as consultation_router
from routes.notifications import router as notification_router
from routes.sync import router as sync_router
from routes.inventory import router as inventory_router
from routes.lora_emergency import router as lora_emergency_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(patient_router)
api_router.include_router(asha_router)
api_router.include_router(medical_records_router)
api_router.include_router(doctor_router)
api_router.include_router(prescription_router)
api_router.include_router(consultation_router)
api_router.include_router(notification_router)
api_router.include_router(sync_router)
api_router.include_router(inventory_router)
api_router.include_router(lora_emergency_router)

__all__ = ["api_router"]
