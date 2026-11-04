import copy
import math
import re

import ifcopenshell
import ifcopenshell.util.element
import ifcopenshell.util.placement
import pytest
from fastapi.testclient import TestClient

from app.build import guid_for
from app.main import app

client = TestClient(app)

GUID_RE = re.compile(r"^[0-3][0-9A-Za-z_$]{21}$")

PAYLOAD = {
    "project": {"id": "prj_x", "name": "Projet", "optionName": "Option A", "versionId": "ver_x"},
    "site": {
        "origin": {"lon": -17.4677, "lat": 14.7167, "crs": "EPSG:32628"},
        "originUtm": [234285.72, 1628446.44],
        "northAngle": 0,
        "plot": [[0, 0], [40, 0], [40, 30], [0, 30]],
    },
    "blocks": [
        {
            "id": "blk_A",
            "name": "Bloc A",
            "footprint": [[5, 5], [29, 5], [29, 21], [5, 21]],
            "heightM": 13.5,
            "storeys": [
                {"index": 0, "elevationM": 0, "heightM": 4.5, "areaM2": 384, "use": "retail"},
                {"index": 1, "elevationM": 4.5, "heightM": 3.0, "areaM2": 384, "use": "housing"},
                {"index": 2, "elevationM": 7.5, "heightM": 3.0, "areaM2": 384, "use": "housing"},
                {"index": 3, "elevationM": 10.5, "heightM": 3.0, "areaM2": 380.5, "use": "housing"},
            ],
        },
        {
            "id": "blk_B",
            "name": "Bloc B",
            "footprint": [[31, 5], [38, 5], [38, 25], [31, 25]],
            "heightM": 6.0,
            "storeys": [
                {"index": 0, "elevationM": 0, "heightM": 3.0, "areaM2": 140, "use": "office"},
                {"index": 1, "elevationM": 3.0, "heightM": 3.0, "areaM2": 140, "use": "office"},
            ],
        },
    ],
    "attribution": "Cadastre: DGID; context: © OpenStreetMap contributors",
}


def build(payload=PAYLOAD) -> bytes:
    r = client.post("/ifc/build", json=payload)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/x-step")
    return r.content


def open_ifc(data: bytes) -> ifcopenshell.file:
    return ifcopenshell.file.from_string(data.decode("utf-8"))


@pytest.fixture(scope="module")
def model() -> ifcopenshell.file:
    return open_ifc(build())


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "ifcopenshell": ifcopenshell.version}


def test_opens_as_ifc4_with_units(model):
    assert model.schema == "IFC4"
    (project,) = model.by_type("IfcProject")
    assert project.Name == "Projet"
    assert project.LongName == "Option A"
    assert "OpenStreetMap" in project.Description
    units = {u.UnitType: u for u in project.UnitsInContext.Units}
    assert units["LENGTHUNIT"].Name == "METRE" and units["LENGTHUNIT"].Prefix is None
    assert units["AREAUNIT"].Name == "SQUARE_METRE"
    assert units["PLANEANGLEUNIT"].Name == "degree"
    pset = ifcopenshell.util.element.get_psets(project)["FS_Export"]
    assert pset["VersionId"] == "ver_x" and pset["Attribution"] == PAYLOAD["attribution"]


def test_spatial_structure(model):
    (project,) = model.by_type("IfcProject")
    (site,) = model.by_type("IfcSite")
    assert ifcopenshell.util.element.get_aggregate(site) == project
    assert site.RefLatitude[:2] == (14, 43) and site.RefLongitude[:2] == (-17, -28)
    assert site.Representation is not None  # plot footprint

    buildings = model.by_type("IfcBuilding")
    assert sorted(b.Name for b in buildings) == ["Bloc A", "Bloc B"]
    for b in buildings:
        assert ifcopenshell.util.element.get_aggregate(b) == site

    by_block = {blk["name"]: blk for blk in PAYLOAD["blocks"]}
    for b in buildings:
        storeys = sorted(ifcopenshell.util.element.get_parts(b), key=lambda s: s.Elevation)
        expected = by_block[b.Name]["storeys"]
        assert all(s.is_a("IfcBuildingStorey") for s in storeys)
        assert [s.Name for s in storeys] == ["RDC", "R+1", "R+2", "R+3"][: len(expected)]
        assert [s.Elevation for s in storeys] == pytest.approx([st["elevationM"] for st in expected])
        for s, st in zip(storeys, expected):
            z = ifcopenshell.util.placement.get_local_placement(s.ObjectPlacement)[2][3]
            assert z == pytest.approx(st["elevationM"])

            spaces = [p for p in ifcopenshell.util.element.get_parts(s) if p.is_a("IfcSpace")]
            assert len(spaces) == 1
            space = spaces[0]
            assert space.LongName == st["use"]
            qto = ifcopenshell.util.element.get_psets(space, qtos_only=True)["Qto_SpaceBaseQuantities"]
            assert qto["NetFloorArea"] == pytest.approx(st["areaM2"])
            assert qto["GrossFloorArea"] == pytest.approx(st["areaM2"])
            assert qto["Height"] == pytest.approx(st["heightM"])
            solid = space.Representation.Representations[0].Items[0]
            assert solid.is_a("IfcExtrudedAreaSolid") and solid.Depth == pytest.approx(st["heightM"])

            proxies = ifcopenshell.util.element.get_decomposition(s, is_recursive=False)
            proxies = [p for p in proxies if p.is_a("IfcBuildingElementProxy")]
            assert len(proxies) == 1
            assert ifcopenshell.util.element.get_container(proxies[0]) == s
            assert proxies[0].Representation.Representations[0].RepresentationType == "SweptSolid"

    assert len(model.by_type("IfcBuildingStorey")) == 6
    assert len(model.by_type("IfcSpace")) == 6
    assert len(model.by_type("IfcBuildingElementProxy")) == 6


def test_georeferencing(model):
    (conv,) = model.by_type("IfcMapConversion")
    assert conv.Eastings == pytest.approx(234285.72)
    assert conv.Northings == pytest.approx(1628446.44)
    assert conv.XAxisAbscissa == pytest.approx(1.0)
    assert conv.XAxisOrdinate == pytest.approx(0.0)
    assert conv.SourceCRS.is_a("IfcGeometricRepresentationContext")
    assert conv.TargetCRS.is_a("IfcProjectedCRS")
    assert conv.TargetCRS.Name == "EPSG:32628"


def test_north_angle_rotates_map_conversion():
    payload = copy.deepcopy(PAYLOAD)
    payload["site"]["northAngle"] = 30
    m = open_ifc(build(payload))
    (conv,) = m.by_type("IfcMapConversion")
    assert conv.XAxisAbscissa == pytest.approx(math.cos(math.radians(30)))
    assert conv.XAxisOrdinate == pytest.approx(-math.sin(math.radians(30)))


def test_global_ids_deterministic_and_valid():
    a, b = build(), build()
    assert a == b  # whole file is byte-stable (fixed header timestamp, derived ids)
    ma, mb = open_ifc(a), open_ifc(b)
    ga = {e.id(): e.GlobalId for e in ma.by_type("IfcRoot")}
    gb = {e.id(): e.GlobalId for e in mb.by_type("IfcRoot")}
    assert ga == gb
    assert len(set(ga.values())) == len(ga)  # unique
    assert all(GUID_RE.match(g) for g in ga.values())
    for g in ga.values():
        assert ifcopenshell.guid.compress(ifcopenshell.guid.expand(g)) == g

    by_class = lambda c: {e.GlobalId for e in ma.by_type(c)}  # noqa: E731
    assert by_class("IfcProject") == {guid_for("project:ver_x")}
    assert by_class("IfcSite") == {guid_for("site:ver_x")}
    assert guid_for("building:blk_A") in by_class("IfcBuilding")
    assert guid_for("storey:blk_A:2") in by_class("IfcBuildingStorey")
    assert guid_for("space:blk_B:1") in by_class("IfcSpace")
    assert guid_for("proxy:blk_A:0") in by_class("IfcBuildingElementProxy")


def test_validate_passes_on_generated_file():
    r = client.post("/ifc/validate", content=build(), headers={"content-type": "application/x-step"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True, body
    assert {c["id"] for c in body["checks"]} == {"FS-01", "FS-02", "FS-03"}
    assert all(c["ok"] for c in body["checks"])


def test_validate_fails_when_quantities_missing():
    m = open_ifc(build())
    for rel in list(m.by_type("IfcRelDefinesByProperties")):
        if rel.RelatingPropertyDefinition.is_a("IfcElementQuantity"):
            qto = rel.RelatingPropertyDefinition
            for q in qto.Quantities:
                m.remove(q)
            m.remove(rel)
            m.remove(qto)
    assert not m.by_type("IfcElementQuantity")
    r = client.post(
        "/ifc/validate", content=m.to_string().encode(), headers={"content-type": "application/octet-stream"}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    checks = {c["id"]: c for c in body["checks"]}
    assert checks["FS-01"]["ok"] and checks["FS-02"]["ok"]
    assert not checks["FS-03"]["ok"]
    assert checks["FS-03"]["failed"] == 6
    assert len(checks["FS-03"]["failures"]) == 6
    assert all(f["class"] == "IfcSpace" for f in checks["FS-03"]["failures"])


def test_validate_fails_without_site_or_storey_name():
    m = open_ifc(build())
    m.by_type("IfcBuildingStorey")[0].Name = None
    r = client.post("/ifc/validate", content=m.to_string().encode(), headers={"content-type": "application/x-step"})
    checks = {c["id"]: c for c in r.json()["checks"]}
    assert r.json()["ok"] is False and not checks["FS-02"]["ok"] and checks["FS-02"]["failed"] == 1

    empty = ifcopenshell.file(schema="IFC4")
    empty.createIfcProject(ifcopenshell.guid.new(), Name="x")
    r = client.post("/ifc/validate", content=empty.to_string().encode(), headers={"content-type": "application/x-step"})
    checks = {c["id"]: c for c in r.json()["checks"]}
    assert not checks["FS-01"]["ok"] and "message" in checks["FS-01"]


@pytest.mark.parametrize(
    "mutate, needle",
    [
        (lambda p: p.pop("project"), "project"),
        (lambda p: p["site"]["origin"].update(crs="WGS84"), "site.origin.crs"),
        (lambda p: p["blocks"][0].update(footprint=[[0, 0], [1, 1]]), "footprint"),
        (lambda p: p["blocks"][0].update(footprint=[[0, 0], [1, 1], [2, 2]]), "zero area"),
        (lambda p: p["blocks"][0]["storeys"][1].update(index=0), "unique"),
        (lambda p: p["blocks"][1].update(id="blk_A"), "unique"),
        (lambda p: p["blocks"][0]["storeys"][0].update(heightM=-1), "heightM"),
        (lambda p: p.update(blocks=[]), "blocks"),
    ],
)
def test_build_rejects_bad_input(mutate, needle):
    payload = copy.deepcopy(PAYLOAD)
    mutate(payload)
    r = client.post("/ifc/build", json=payload)
    assert r.status_code == 422
    body = r.json()
    assert body["error"] == "invalid_request"
    assert needle in body["message"], body["message"]


def test_build_rejects_non_json():
    r = client.post("/ifc/build", content=b"not json", headers={"content-type": "application/json"})
    assert r.status_code == 422
    assert r.json()["error"] == "invalid_request"


def test_cw_footprint_is_normalised():
    payload = copy.deepcopy(PAYLOAD)
    payload["blocks"][0]["footprint"] = list(reversed(payload["blocks"][0]["footprint"]))
    m = open_ifc(build(payload))
    assert len(m.by_type("IfcSpace")) == 6


def test_validate_rejects_garbage_and_empty():
    r = client.post("/ifc/validate", content=b"hello", headers={"content-type": "application/octet-stream"})
    assert r.status_code == 422 and "STEP" in r.json()["message"]
    r = client.post("/ifc/validate", content=b"", headers={"content-type": "application/x-step"})
    assert r.status_code == 422
    r = client.post("/ifc/validate", content=b"{}", headers={"content-type": "application/json"})
    assert r.status_code == 415


def test_body_size_limit(monkeypatch):
    from app import main

    small = TestClient(main.BodySizeLimit(main.app, max_bytes=1000))
    r = small.post("/ifc/validate", content=b"x" * 2000, headers={"content-type": "application/x-step"})
    assert r.status_code == 413
    assert main.MAX_BODY_BYTES == 50 * 1024 * 1024
