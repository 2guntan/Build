"""BuildResult (+ site + project metadata) -> IFC4 massing model."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.context
import ifcopenshell.api.geometry
import ifcopenshell.api.georeference
import ifcopenshell.api.project
import ifcopenshell.api.pset
import ifcopenshell.api.root
import ifcopenshell.api.spatial
import ifcopenshell.api.unit
import ifcopenshell.guid
import ifcopenshell.util.geolocation
from ifcopenshell.util.shape_builder import ShapeBuilder

from .models import Block, BuildRequest, Storey, x_axis_from_north_angle

GUID_NAMESPACE = uuid.UUID("6f1c2a8e-2d3b-4b5e-9a7c-0d1e2f3a4b5c")
APP_NAME = "Feasibility Studio IFC service"
APP_VERSION = "1.0.0"
# Fixed header timestamp so identical input gives identical bytes.
HEADER_TIMESTAMP = "1970-01-01T00:00:00"


def guid_for(key: str) -> str:
    """Deterministic 22-char IFC GlobalId for a stable key such as 'storey:blk_A:0'."""
    return ifcopenshell.guid.compress(uuid.uuid5(GUID_NAMESPACE, key).hex)


def storey_name(index: int) -> str:
    """French storey naming: RDC, R+1, R+2 ... and R-1, R-2 for basements."""
    if index == 0:
        return "RDC"
    return f"R+{index}" if index > 0 else f"R{index}"


class _Builder:
    def __init__(self, req: BuildRequest) -> None:
        self.req = req
        self.f = ifcopenshell.file(schema="IFC4")
        self.sb = ShapeBuilder(self.f)
        self.assigned: set[int] = set()
        # (product, parent product or None, z) — applied top-down after all
        # relationships exist, because aggregate/assign_container rewrite
        # placements in an order that is not stable between runs.
        self.placements: list[tuple] = []

    # -- helpers ---------------------------------------------------------
    def entity(self, ifc_class: str, key: str, name: str | None = None, predefined_type: str | None = None):
        el = ifcopenshell.api.root.create_entity(self.f, ifc_class=ifc_class, name=name, predefined_type=predefined_type)
        el.GlobalId = guid_for(key)
        self.assigned.add(el.id())
        return el

    def place(self, product, parent=None, z: float = 0.0) -> None:
        self.placements.append((product, parent, float(z)))

    def apply_placements(self) -> None:
        for product, parent, z in self.placements:
            product.ObjectPlacement = self.f.createIfcLocalPlacement(
                parent.ObjectPlacement if parent is not None else None,
                self.f.createIfcAxis2Placement3D(self.f.createIfcCartesianPoint((0.0, 0.0, z))),
            )

    def pset(self, product, name: str, props: dict) -> None:
        props = {k: v for k, v in props.items() if v is not None}
        if props:
            pset = ifcopenshell.api.pset.add_pset(self.f, product=product, name=name)
            ifcopenshell.api.pset.edit_pset(self.f, pset=pset, properties=props)

    def extrusion(self, profile, height: float):
        solid = self.sb.extrude(profile, magnitude=float(height))
        return self.sb.get_representation(self.body, [solid])

    def profile(self, ring: Sequence[tuple[float, float]], name: str):
        curve = self.sb.polyline([(float(x), float(y)) for x, y in ring], closed=True)
        return self.sb.profile(curve, name=name)

    # -- build -----------------------------------------------------------
    def run(self) -> ifcopenshell.file:
        req, f = self.req, self.f
        p = req.project
        vid = p.versionId

        project = self.entity("IfcProject", f"project:{vid}", name=p.name)
        project.LongName = p.optionName
        project.Description = req.attribution
        project.Phase = "Feasibility"

        length = ifcopenshell.api.unit.add_si_unit(f, unit_type="LENGTHUNIT")
        area = ifcopenshell.api.unit.add_si_unit(f, unit_type="AREAUNIT")
        volume = ifcopenshell.api.unit.add_si_unit(f, unit_type="VOLUMEUNIT")
        degree = ifcopenshell.api.unit.add_conversion_based_unit(f, name="degree")
        units = [length, area, volume, degree]
        ifcopenshell.api.unit.assign_unit(f, units=units)
        project.UnitsInContext.Units = units  # the API stores a set; keep a stable order

        model = ifcopenshell.api.context.add_context(f, context_type="Model")
        self.body = ifcopenshell.api.context.add_context(
            f, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=model
        )
        footprint_ctx = ifcopenshell.api.context.add_context(
            f, context_type="Model", context_identifier="FootPrint", target_view="MODEL_VIEW", parent=model
        )

        self.georeference()
        self.pset(
            project,
            "FS_Export",
            {
                "ProjectId": p.id,
                "VersionId": vid,
                "OptionName": p.optionName,
                "Attribution": req.attribution,
                "GeneratedBy": f"{APP_NAME} {APP_VERSION}",
            },
        )

        site = self.entity("IfcSite", f"site:{vid}", name="Site")
        site.CompositionType = "ELEMENT"
        site.RefLatitude = ifcopenshell.util.geolocation.dd2dms(req.site.origin.lat, use_us=True)
        site.RefLongitude = ifcopenshell.util.geolocation.dd2dms(req.site.origin.lon, use_us=True)
        site.RefElevation = 0.0
        self.place(site)
        if req.site.plot:
            curve = self.sb.polyline([(float(x), float(y)) for x, y in req.site.plot], closed=True)
            ifcopenshell.api.geometry.assign_representation(
                f, product=site, representation=self.sb.get_representation(footprint_ctx, [curve])
            )
        ifcopenshell.api.aggregate.assign_object(f, products=[site], relating_object=project)

        for block in req.blocks:
            self.building(block, site)

        self.apply_placements()
        self.sort_relationship_members()
        self.stabilise_remaining_guids(vid)
        return f

    def georeference(self) -> None:
        s = self.req.site
        abscissa, ordinate = x_axis_from_north_angle(s.northAngle)
        ifcopenshell.api.georeference.add_georeferencing(self.f, ifc_class="IfcMapConversion", name=s.origin.crs)
        ifcopenshell.api.georeference.edit_georeferencing(
            self.f,
            projected_crs={"Name": s.origin.crs, "Description": "UTM projected CRS of the site origin"},
            coordinate_operation={
                "Eastings": float(s.originUtm[0]),
                "Northings": float(s.originUtm[1]),
                "OrthogonalHeight": 0.0,
                "XAxisAbscissa": abscissa,
                "XAxisOrdinate": ordinate,
                "Scale": 1.0,
            },
        )
        # Same rotation expressed as true north (anticlockwise from project north).
        # Local +Y points at azimuth northAngle, so true north is (-sin, cos) = (ordinate, abscissa).
        ifcopenshell.api.georeference.edit_true_north(self.f, true_north=(ordinate, abscissa))

    def building(self, block: Block, site) -> None:
        f = self.f
        building = self.entity("IfcBuilding", f"building:{block.id}", name=block.name)
        building.CompositionType = "ELEMENT"
        building.ElevationOfRefHeight = 0.0
        self.place(building, site)
        ifcopenshell.api.aggregate.assign_object(f, products=[building], relating_object=site)
        self.pset(building, "FS_Block", {"BlockId": block.id, "HeightM": float(block.heightM)})

        profile = self.profile(block.footprint, name=f"{block.name} footprint")
        storeys = []
        for st in sorted(block.storeys, key=lambda s: s.index):
            storeys.append(self.storey(block, st, building, profile))
        ifcopenshell.api.aggregate.assign_object(f, products=storeys, relating_object=building)

    def storey(self, block: Block, st: Storey, building, profile):
        f = self.f
        key = f"{block.id}:{st.index}"
        name = storey_name(st.index)
        storey = self.entity("IfcBuildingStorey", f"storey:{key}", name=name)
        storey.LongName = f"{block.name} {name}"
        storey.Description = st.use
        storey.CompositionType = "ELEMENT"
        storey.Elevation = float(st.elevationM)
        self.place(storey, building, st.elevationM)

        space = self.entity("IfcSpace", f"space:{key}", name=f"{block.name} {name}", predefined_type="SPACE")
        space.LongName = st.use
        space.CompositionType = "ELEMENT"
        self.place(space, storey)
        ifcopenshell.api.geometry.assign_representation(f, product=space, representation=self.extrusion(profile, st.heightM))
        ifcopenshell.api.aggregate.assign_object(f, products=[space], relating_object=storey)
        qto = ifcopenshell.api.pset.add_qto(f, product=space, name="Qto_SpaceBaseQuantities")
        ifcopenshell.api.pset.edit_qto(
            f,
            qto=qto,
            properties={
                "NetFloorArea": float(st.areaM2),
                "GrossFloorArea": float(st.areaM2),
                "Height": float(st.heightM),
            },
        )
        self.pset(space, "FS_Space", {"Use": st.use, "BlockId": block.id, "StoreyIndex": int(st.index)})

        proxy = self.entity(
            "IfcBuildingElementProxy", f"proxy:{key}", name=f"{block.name} {name} massing", predefined_type="USERDEFINED"
        )
        proxy.ObjectType = "Massing"
        self.place(proxy, storey)
        ifcopenshell.api.geometry.assign_representation(f, product=proxy, representation=self.extrusion(profile, st.heightM))
        ifcopenshell.api.spatial.assign_container(f, products=[proxy], relating_structure=storey)
        return storey

    def sort_relationship_members(self) -> None:
        """The API builds RelatedObjects & co. through Python sets, so their order
        varies between runs; sort every entity list on relationships and property
        sets by entity id (creation order) to keep the output byte-stable."""
        targets = [*self.f.by_type("IfcRelationship"), *self.f.by_type("IfcPropertySetDefinition")]
        for el in targets:
            for i, value in enumerate(el):
                if (
                    isinstance(value, tuple)
                    and len(value) > 1
                    and all(isinstance(v, ifcopenshell.entity_instance) for v in value)
                ):
                    el[i] = tuple(sorted(value, key=lambda v: v.id()))

    def stabilise_remaining_guids(self, vid: str) -> None:
        """Relationships, psets and qtos get random GlobalIds from the API; replace
        them with ids derived from creation order, which is fixed for a given input."""
        n = 0
        for el in sorted(self.f.by_type("IfcRoot"), key=lambda e: e.id()):
            if el.id() in self.assigned:
                continue
            el.GlobalId = guid_for(f"auto:{vid}:{n}:{el.is_a()}")
            n += 1


def build_ifc(req: BuildRequest) -> ifcopenshell.file:
    return _Builder(req).run()


def to_step_bytes(f: ifcopenshell.file, req: BuildRequest) -> bytes:
    f.header.file_name.name = f"{req.project.id}_{req.project.versionId}.ifc"
    f.header.file_name.time_stamp = HEADER_TIMESTAMP
    f.header.file_name.originating_system = f"{APP_NAME} {APP_VERSION}"
    f.header.file_name.preprocessor_version = f"IfcOpenShell {ifcopenshell.version}"
    f.header.file_description.description = ("ViewDefinition [ReferenceView_V1.2]",)
    return f.to_string().encode("utf-8")
