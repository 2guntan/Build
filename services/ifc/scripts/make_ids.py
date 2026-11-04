"""Regenerate app/massing.ids with ifctester's IDS authoring API.

Run from services/ifc:  .venv/bin/python scripts/make_ids.py
The generated file is committed; the service only reads it.
"""

from pathlib import Path

from ifctester import ids

OUT = Path(__file__).resolve().parent.parent / "app" / "massing.ids"


def build() -> ids.Ids:
    doc = ids.Ids(
        title="Feasibility Studio massing export",
        description="Minimum information requirements for massing IFC4 files produced by services/ifc.",
        author="feasibility-studio@example.com",
        version="1.0",
        purpose="Massing handoff to Archicad / Revit",
    )

    site = ids.Specification(
        name="Site exists",
        identifier="FS-01",
        description="The file contains at least one IfcSite.",
        minOccurs=1,
        maxOccurs="unbounded",
        ifcVersion=["IFC4"],
    )
    site.applicability.append(ids.Entity(name="IFCSITE"))
    site.requirements.append(ids.Attribute(name="GlobalId", cardinality="required"))
    doc.specifications.append(site)

    storey = ids.Specification(
        name="Storeys are named",
        identifier="FS-02",
        description="Every IfcBuildingStorey has a Name.",
        minOccurs=1,
        maxOccurs="unbounded",
        ifcVersion=["IFC4"],
    )
    storey.applicability.append(ids.Entity(name="IFCBUILDINGSTOREY"))
    storey.requirements.append(ids.Attribute(name="Name", cardinality="required"))
    doc.specifications.append(storey)

    space = ids.Specification(
        name="Spaces carry a net floor area",
        identifier="FS-03",
        description="Every IfcSpace has Qto_SpaceBaseQuantities.NetFloorArea.",
        minOccurs=0,
        maxOccurs="unbounded",
        ifcVersion=["IFC4"],
    )
    space.applicability.append(ids.Entity(name="IFCSPACE"))
    space.requirements.append(
        ids.Property(
            propertySet="Qto_SpaceBaseQuantities",
            baseName="NetFloorArea",
            dataType="IFCAREAMEASURE",
            cardinality="required",
        )
    )
    doc.specifications.append(space)
    return doc


if __name__ == "__main__":
    build().to_xml(str(OUT))
    ids.open(str(OUT), validate=True)  # round-trip through the IDS XSD
    print(f"wrote {OUT}")
