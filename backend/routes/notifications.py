from typing import List
from fastapi import APIRouter, Depends, status, HTTPException
from schemas.notification import NotificationResponse
from services.security import (
    get_current_patient,
    get_current_doctor,
    get_current_user_payload,
)
from services.notification_service import (
    get_patient_notifications,
    get_doctor_notifications,
    mark_notification_read,
    mark_doctor_notification_read,
    mark_all_doctor_notifications_read,
)

router = APIRouter(tags=["Notifications & Alerts"])


# ==========================================
# 1. Patient Notification Endpoints
# ==========================================

@router.get(
    "/patient/notifications",
    response_model=List[NotificationResponse],
    summary="Retrieve notifications (Patient only)",
    description="Allows an authenticated patient to fetch all their in-app notifications sorted newest first.",
)
async def get_my_notifications(
    current_patient: dict = Depends(get_current_patient),
):
    target_pid = current_patient.get("patient_id") or str(current_patient.get("_id"))
    return await get_patient_notifications(target_pid)


@router.patch(
    "/patient/notifications/{notification_id}/read",
    summary="Mark notification as read (Patient only)",
    description="Marks a specific notification as read for the authenticated patient.",
)
async def mark_as_read(
    notification_id: str,
    current_patient: dict = Depends(get_current_patient),
):
    target_pid = current_patient.get("patient_id") or str(current_patient.get("_id"))
    success = await mark_notification_read(notification_id, target_pid)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notification '{notification_id}' not found.",
        )
    return {"status": "success", "notification_id": notification_id, "is_read": True}


# ==========================================
# 2. Doctor Notification Endpoints
# ==========================================

@router.get(
    "/doctor/notifications",
    response_model=List[NotificationResponse],
    summary="Retrieve notifications (Doctor only)",
    description="Allows an authenticated doctor to fetch all their in-app alerts and notifications sorted newest first.",
)
async def get_doctor_notifications_endpoint(
    current_doctor: dict = Depends(get_current_doctor),
):
    return await get_doctor_notifications(current_doctor)


@router.patch(
    "/doctor/notifications/{notification_id}/read",
    summary="Mark doctor notification as read (Doctor only)",
    description="Marks a specific notification as read for the authenticated doctor.",
)
async def mark_doctor_notification_read_endpoint(
    notification_id: str,
    current_doctor: dict = Depends(get_current_doctor),
):
    doc_id = current_doctor.get("doctor_id") or str(current_doctor.get("_id"))
    await mark_doctor_notification_read(notification_id, doc_id)
    return {"status": "success", "notification_id": notification_id, "is_read": True}


@router.patch(
    "/doctor/notifications/read-all",
    summary="Mark all doctor notifications as read (Doctor only)",
    description="Marks all notifications for the authenticated doctor as read.",
)
async def mark_all_doctor_notifications_read_endpoint(
    current_doctor: dict = Depends(get_current_doctor),
):
    doc_id = current_doctor.get("doctor_id") or str(current_doctor.get("_id"))
    await mark_all_doctor_notifications_read(doc_id)
    return {"status": "success", "message": "All doctor notifications marked as read"}

