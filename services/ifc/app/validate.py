"""IDS validation of IFC files with ifctester."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path
from typing import Any

import ifcopenshell
from ifctester import ids, reporter

IDS_PATH = Path(__file__).resolve().parent / "massing.ids"
MAX_FAILURES_PER_CHECK = 50


@lru_cache(maxsize=1)
def _ids_xml() -> str:
    return IDS_PATH.read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def _identifiers() -> list[str | None]:
    # ifctester 0.9 does not read the specification@identifier attribute back.
    ns = {"ids": "http://standards.buildingsmart.org/IDS"}
    root = ET.fromstring(_ids_xml())
    return [s.get("identifier") for s in root.iterfind("ids:specifications/ids:specification", ns)]


def _load_ids() -> ids.Ids:
    # Parsed per request: ifctester stores results on the Ids object.
    return ids.from_string(_ids_xml())


def parse_ifc(data: bytes) -> ifcopenshell.file:
    """Parse STEP bytes; raises ValueError with a readable message."""
    text = data.decode("utf-8", errors="replace").lstrip("﻿")
    if not text.lstrip().startswith("ISO-10303-21"):
        raise ValueError("body is not an IFC STEP file (missing 'ISO-10303-21' header)")
    try:
        return ifcopenshell.file.from_string(text)
    except Exception as exc:  # ifcopenshell raises a bare RuntimeError/SchemaError
        raise ValueError(f"could not parse IFC file: {exc}") from exc


def _entity(e: dict[str, Any], reason: str | None = None) -> dict[str, Any]:
    out = {"id": e.get("id"), "class": e.get("class"), "globalId": e.get("global_id"), "name": e.get("name")}
    if reason:
        out["reason"] = reason
    return out


def validate_ifc(f: ifcopenshell.file) -> dict[str, Any]:
    spec_doc = _load_ids()
    spec_doc.validate(f)
    rep = reporter.Json(spec_doc)
    rep.report()

    checks = []
    identifiers = _identifiers()
    for i, spec in enumerate(rep.results["specifications"]):
        failures = []
        for req in spec["requirements"]:
            for fe in req.get("failed_entities", []):
                failures.append(_entity(fe, fe.get("reason") or req.get("description")))
        message = None
        if not spec["status"] and spec["total_applicable"] == 0 and spec["cardinality"] == "required":
            message = f"no entity matches the applicability ({'; '.join(spec['applicability'])})"
        checks.append(
            {
                "id": identifiers[i] if i < len(identifiers) else None,
                "name": spec["name"],
                "description": spec["description"],
                "ok": bool(spec["status"]),
                "cardinality": spec["cardinality"],
                "applicable": spec["total_applicable"],
                "passed": spec["total_applicable_pass"],
                "failed": spec["total_applicable_fail"],
                "requirements": [r["description"] for r in spec["requirements"]],
                "failures": failures[:MAX_FAILURES_PER_CHECK],
                **({"message": message} if message else {}),
            }
        )
    return {
        "ok": all(c["ok"] for c in checks),
        "schema": f.schema,
        "ids": rep.results["title"],
        "checks": checks,
    }
