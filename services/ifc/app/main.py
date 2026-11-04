"""IFC service (docs/SPEC.md §7): IFC4 export of massing and IDS validation."""

from __future__ import annotations

import logging
import os

import ifcopenshell
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .build import build_ifc, to_step_bytes
from .models import BuildRequest
from .validate import parse_ifc, validate_ifc

MAX_BODY_BYTES = int(os.environ.get("IFC_MAX_BODY_BYTES", 50 * 1024 * 1024))
STEP_MEDIA_TYPE = "application/x-step"

log = logging.getLogger("ifc-service")


class BodySizeLimit:
    """Reject request bodies over `max_bytes` with 413, with or without Content-Length."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def _reject(self, send: Send) -> None:
        body = (
            b'{"error":"payload_too_large","message":"request body exceeds %d bytes"}' % self.max_bytes
        )
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
            }
        )
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    if int(value) > self.max_bytes:
                        await self._reject(send)
                        return
                except ValueError:
                    pass
        # Buffer the body (bounded) so chunked uploads are limited too.
        chunks: list[bytes] = []
        total = 0
        while True:
            msg = await receive()
            if msg["type"] == "http.disconnect":
                return
            chunk = msg.get("body", b"")
            total += len(chunk)
            if total > self.max_bytes:
                await self._reject(send)
                return
            chunks.append(chunk)
            if not msg.get("more_body", False):
                break
        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)


app = FastAPI(title="Feasibility Studio IFC service", version="1.0.0")
app.add_middleware(BodySizeLimit, max_bytes=MAX_BODY_BYTES)


def _loc(loc: tuple | list) -> str:
    parts = [str(p) for p in loc if p != "body"]
    return ".".join(parts) or "body"


@app.exception_handler(RequestValidationError)
async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors = exc.errors()
    detail = [{"path": _loc(e.get("loc", ())), "message": e.get("msg", ""), "type": e.get("type")} for e in errors]
    summary = "; ".join(f"{d['path']}: {d['message']}" for d in detail[:10])
    return JSONResponse(
        status_code=422,
        content={"error": "invalid_request", "message": f"Invalid request body — {summary}", "detail": detail},
    )


def _unprocessable(message: str) -> JSONResponse:
    return JSONResponse(status_code=422, content={"error": "invalid_request", "message": message, "detail": []})


@app.get("/health")
def health() -> dict:
    return {"ok": True, "ifcopenshell": ifcopenshell.version}


@app.post(
    "/ifc/build",
    response_class=Response,
    responses={200: {"content": {STEP_MEDIA_TYPE: {}}, "description": "IFC4 STEP file"}},
)
def ifc_build(body: BuildRequest) -> Response:
    try:
        model = build_ifc(body)
        data = to_step_bytes(model, body)
    except ValueError as exc:
        return _unprocessable(f"Cannot build IFC: {exc}")
    filename = f"{body.project.id}_{body.project.versionId}.ifc"
    return Response(
        content=data,
        media_type=STEP_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post(
    "/ifc/validate",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {STEP_MEDIA_TYPE: {"schema": {"type": "string", "format": "binary"}}},
        }
    },
)
async def ifc_validate(request: Request) -> JSONResponse:
    ctype = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if ctype and ctype not in (STEP_MEDIA_TYPE, "application/octet-stream", "application/step", "text/plain"):
        return JSONResponse(
            status_code=415,
            content={
                "error": "unsupported_media_type",
                "message": f"send the IFC file as {STEP_MEDIA_TYPE} or application/octet-stream, got {ctype!r}",
            },
        )
    data = await request.body()
    if not data:
        return _unprocessable("Request body is empty; send the raw IFC (STEP) file")
    try:
        model = parse_ifc(data)
    except ValueError as exc:
        return _unprocessable(str(exc))
    return JSONResponse(content=validate_ifc(model))
