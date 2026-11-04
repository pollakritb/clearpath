"""Thin authenticated boundary for community measurement requests."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path

from ..core.auth import AuthenticatedUser, require_user
from ..core.identifiers import RequestID
from ..models.measurement import (
    MeasurementHelperConsent,
    MeasurementHelperLocation,
    MeasurementHelperLocationWrite,
    MeasurementHelperSettings,
    MeasurementPresenceUpdate,
    MeasurementRequestCreate,
    MeasurementRequestsResponse,
    MeasurementRequestView,
)
from ..services.measurement import registered, service, store

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


@router.get("/helper/locations", response_model=list[MeasurementHelperLocation])
def helper_locations(user: User):
    return call(lambda: registered.locations(user.id) if registered.enabled() else [])


@router.post(
    "/helper/locations", response_model=MeasurementHelperLocation, status_code=201
)
def create_helper_location(body: MeasurementHelperLocationWrite, user: User):
    return call(lambda: registered.save_location(user.id, body.model_dump()))


@router.patch("/helper/locations/{slot}", response_model=MeasurementHelperLocation)
def update_helper_location(
    slot: Annotated[int, Path(ge=1, le=2)],
    body: MeasurementHelperLocationWrite,
    user: User,
):
    return call(lambda: registered.save_location(user.id, body.model_dump(), slot))


@router.delete("/helper/locations/{slot}")
def delete_helper_location(slot: Annotated[int, Path(ge=1, le=2)], user: User):
    def remove():
        registered.delete_location(user.id, slot)
        return {"ok": True}

    return call(remove)


@router.get("/groups/{batch_id}", response_model=MeasurementRequestsResponse)
def request_group(batch_id: UUID, user: User):
    def load():
        rows = registered.group_requests(str(batch_id), user.id)
        names = service.requester_names(rows)
        return {"requests": [service.view(row, user.id, names=names) for row in rows]}

    return call(load)


@router.put("/presence", response_model=MeasurementHelperSettings)
def presence(body: MeasurementPresenceUpdate, user: User):
    return call(lambda: service.update_presence(user.id, body.model_dump()))


@router.post("", response_model=MeasurementRequestView, status_code=201)
def create(body: MeasurementRequestCreate, user: User):
    return call(lambda: service.create(user.id, body.model_dump()))


@router.get("", response_model=MeasurementRequestsResponse)
def listing(user: User):
    return call(lambda: service.listing(user.id))


@router.get("/{request_id}", response_model=MeasurementRequestView)
def detail(request_id: RequestID, user: User):
    def load():
        row = store.get(str(request_id))
        if not row:
            raise KeyError()
        return service.view(row, user.id)

    return call(load)


@router.post("/{request_id}/cancel", response_model=MeasurementRequestView)
def cancel(request_id: RequestID, user: User):
    return call(lambda: service.cancel(str(request_id), user.id))


@router.post("/{request_id}/decline", response_model=MeasurementRequestView)
def decline(request_id: RequestID, user: User):
    return call(lambda: service.decline(str(request_id), user.id))
