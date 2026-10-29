"""Thin authenticated boundary for community measurement requests."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from ..core.auth import AuthenticatedUser, require_user
from ..models.measurement import (
    MeasurementHelperConsent,
    MeasurementHelperSettings,
    MeasurementPresenceUpdate,
    MeasurementRequestCreate,
    MeasurementRequestsResponse,
    MeasurementRequestView,
)
from ..services.measurement import service, store

router = APIRouter(prefix="/measurement-requests")
User = Annotated[AuthenticatedUser, Depends(require_user)]


def call(operation):
    service.require_enabled()
    try:
        return operation()
    except KeyError as exc:
        raise HTTPException(404, detail="ไม่พบคำขอ") from exc
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc)) from exc


@router.get("/helper", response_model=MeasurementHelperSettings)
def helper(user: User):
    return call(lambda: service.helper_settings(user.id))


@router.put("/helper", response_model=MeasurementHelperSettings)
def consent(body: MeasurementHelperConsent, user: User):
    return call(lambda: service.helper_settings(user.id, body.enabled))


@router.put("/presence", response_model=MeasurementHelperSettings)
def presence(body: MeasurementPresenceUpdate, user: User):
    return call(lambda: service.update_presence(user.id, body.model_dump()))


@router.post("", response_model=MeasurementRequestView, status_code=201)
def create(body: MeasurementRequestCreate, user: User):
    return call(lambda: service.create(user.id, body.model_dump()))


@router.get("", response_model=MeasurementRequestsResponse)
def listing(user: User):
    return call(
        lambda: {
            "requests": [service.view(row, user.id) for row in store.mine(user.id)]
        }
    )


@router.get("/{request_id}", response_model=MeasurementRequestView)
def detail(request_id: UUID, user: User):
    def load():
        row = store.get(str(request_id))
        if not row:
            raise KeyError()
        return service.view(row, user.id)

    return call(load)


@router.post("/{request_id}/cancel", response_model=MeasurementRequestView)
def cancel(request_id: UUID, user: User):
    return call(lambda: service.cancel(str(request_id), user.id))


@router.post("/{request_id}/decline", response_model=MeasurementRequestView)
def decline(request_id: UUID, user: User):
    return call(lambda: service.decline(str(request_id), user.id))
