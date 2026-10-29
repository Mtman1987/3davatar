#!/usr/bin/env python3
"""Create experimental, non-destructive face-opening GLB candidates with Blender.

The source files are never overwritten. This is an intentionally rough first
pass using the approved +Z-front assumption and a box around the exact head bone.
It removes whole polygons only; it does not remesh or weld the boundary.
"""
import bpy
import bmesh
import json
import sys
from pathlib import Path
from mathutils import Vector

def arg_after_double_dash():
    args = sys.argv
    return args[args.index("--") + 1:] if "--" in args else []

def main():
    args = arg_after_double_dash()
    if len(args) != 3:
        raise SystemExit("usage: blender -b --python cut-face-candidate.py -- INPUT.glb OUTPUT.glb male|female")
    source, output, sex = args
    if sex not in ("male", "female"):
        raise SystemExit("sex must be male or female")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)
    bpy.context.view_layer.update()

    armatures = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    head_hits = []
    for arm in armatures:
        if arm.data.bones.get("head"):
            head_hits.append((arm, arm.data.bones["head"]))
    if len(head_hits) != 1:
        raise SystemExit(f"Expected exactly one armature bone named 'head'; found {len(head_hits)}")
    arm, head = head_hits[0]
    head_world = arm.matrix_world @ head.head_local

    # First-pass facial footprint. +Z is the front as approved by the user.
    half_width = 0.095 if sex == "male" else 0.083
    y_min = head_world.y - 0.045
    y_max = head_world.y + (0.105 if sex == "male" else 0.095)
    z_min = head_world.z + 0.020
    removed = {}
    total_before = total_after = 0

    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        mesh = obj.data
        before = len(mesh.polygons)
        total_before += before
        remove_indices = []
        # Polygon centers and transforms are evaluated in scene/world coordinates.
        for poly in mesh.polygons:
            center = obj.matrix_world @ poly.center
            if (abs(center.x - head_world.x) <= half_width and
                y_min <= center.y <= y_max and center.z >= z_min):
                remove_indices.append(poly.index)
        if remove_indices:
            # Delete through BMesh so UVs, materials, vertex groups and modifiers
            # are not rebuilt from scratch.
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.mode_set(mode="EDIT")
            bm = bmesh.from_edit_mesh(mesh)
            bm.faces.ensure_lookup_table()
            doomed = [bm.faces[i] for i in remove_indices if i < len(bm.faces)]
            bmesh.ops.delete(bm, geom=doomed, context="FACES_ONLY")
            bmesh.update_edit_mesh(mesh, loop_triangles=True, destructive=True)
            bpy.ops.object.mode_set(mode="OBJECT")
            removed[obj.name] = len(remove_indices)
        total_after += len(mesh.polygons)

    if not removed:
        raise SystemExit("No polygons fell inside the cut region; refusing to export an unchanged candidate")

    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=False,
        export_animations=True,
        export_skins=True,
        export_morph=True,
    )
    report = {
        "source": source,
        "candidate": str(output_path),
        "sex": sex,
        "cut_assumption": "+Z is front; polygon-centroid box around exact head bone",
        "head_world_position": [round(float(v), 7) for v in head_world],
        "cut_region_world": {
            "x_min": round(float(head_world.x - half_width), 7),
            "x_max": round(float(head_world.x + half_width), 7),
            "y_min": round(float(y_min), 7),
            "y_max": round(float(y_max), 7),
            "z_min": round(float(z_min), 7),
        },
        "removed_polygons_by_mesh": removed,
        "total_polygons_before": total_before,
        "total_polygons_after": total_after,
        "warning": "Experimental rough cut: whole-polygon centroid filter; inspect visually before use.",
    }
    report_path = output_path.with_suffix(".report.json")
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
