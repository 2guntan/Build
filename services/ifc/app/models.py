"""Request models for POST /ifc/build.

Coordinates are local metres east/north of the site origin. Footprints are
rings without a closing vertex; they are normalised to counter-clockwise.
"""

from __future__ import annotations

import math
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Finite = Annotated[float, Field(allow_inf_nan=False)]
Point2 = tuple[Finite, Finite]
Id = Annotated[str, Field(min_length=1, max_length=128)]


def _signed_area(ring: list[Point2]) -> float:
    s = 0.0
    for i, (x1, y1) in enumerate(ring):
        x2, y2 = ring[(i + 1) % len(ring)]
        s += x1 * y2 - x2 * y1
    return s / 2.0


def _normalise_ring(ring: list[Point2], what: str) -> list[Point2]:
    pts = [(float(x), float(y)) for x, y in ring]
    if len(pts) >= 2 and pts[0] == pts[-1]:
        pts = pts[:-1]  # tolerate a closing vertex
    if len(pts) < 3:
        raise ValueError(f"{what} needs at least 3 distinct vertices")
    area = _signed_area(pts)
    if abs(area) < 1e-6:
        raise ValueError(f"{what} has zero area")
    return pts if area > 0 else list(reversed(pts))


class _Model(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class Project(_Model):
    id: Id
    name: Annotated[str, Field(min_length=1, max_length=255)]
    optionName: Annotated[str | None, Field(max_length=255)] = None
    versionId: Id


class Origin(_Model):
    lon: Annotated[float, Field(ge=-180, le=180)]
    lat: Annotated[float, Field(ge=-90, le=90)]
    crs: Annotated[str, Field(pattern=r"^EPSG:\d+$")]


class Site(_Model):
    origin: Origin
    originUtm: tuple[Finite, Finite]
    northAngle: Finite = 0.0
    plot: list[Point2] | None = None

    @field_validator("plot")
    @classmethod
    def _plot(cls, v: list[Point2] | None) -> list[Point2] | None:
        return None if v is None else _normalise_ring(v, "site.plot")


class Storey(_Model):
    index: Annotated[int, Field(ge=-20, le=500)]
    elevationM: Finite
    heightM: Annotated[float, Field(gt=0, le=100, allow_inf_nan=False)]
    areaM2: Annotated[float, Field(ge=0, allow_inf_nan=False)]
    use: Annotated[str, Field(min_length=1, max_length=64)]


class Block(_Model):
    id: Id
    name: Annotated[str, Field(min_length=1, max_length=255)]
    footprint: list[Point2]
    heightM: Annotated[float, Field(gt=0, le=1000, allow_inf_nan=False)]
    storeys: Annotated[list[Storey], Field(min_length=1)]

    @field_validator("footprint")
    @classmethod
    def _footprint(cls, v: list[Point2]) -> list[Point2]:
        return _normalise_ring(v, "footprint")

    @model_validator(mode="after")
    def _unique_storeys(self) -> Block:
        idx = [s.index for s in self.storeys]
        if len(set(idx)) != len(idx):
            raise ValueError(f"block {self.id!r}: storey indices must be unique")
        return self


class BuildRequest(_Model):
    project: Project
    site: Site
    blocks: Annotated[list[Block], Field(min_length=1, max_length=500)]
    attribution: Annotated[str | None, Field(max_length=4000)] = None

    @model_validator(mode="after")
    def _unique_blocks(self) -> BuildRequest:
        ids = [b.id for b in self.blocks]
        if len(set(ids)) != len(ids):
            raise ValueError("block ids must be unique")
        return self


def x_axis_from_north_angle(north_angle_deg: float) -> tuple[float, float]:
    """Map-frame direction of the local +X axis.

    northAngle follows packages/sun: local azimuth = true azimuth - northAngle,
    i.e. the local +Y axis points at azimuth `northAngle` (clockwise from north).
    Grid north is treated as true north (meridian convergence ignored).
    """
    t = math.radians(north_angle_deg)
    # `+ 0.0` turns -0.0 into 0.0 so the STEP output has no '-0.' values.
    return math.cos(t) + 0.0, -math.sin(t) + 0.0
