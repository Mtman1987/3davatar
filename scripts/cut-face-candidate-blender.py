#!/usr/bin/env python3
"""Build face-cut candidates with a coordinate-defined flat backing patch.

The approved cut footprint is preserved exactly. The patch is a flat XZ quad
at the cut's front boundary, slightly toward the viewer so it closes the
opening in the inspection GLB. It is weighted to the existing head bone.
"""
import bpy
import bmesh
import json
import sys
from pathlib import Path
from mathutils import Vector

def args_after_dash():
    args = sys.argv
    return args[args.index("--") + 1:] if "--" in args else []

def main():
    args = args_after_dash()
    if len(args) != 3:
        raise SystemExit("usage: blender -b --python cut-face-candidate-blender.py -- INPUT.glb OUTPUT.glb male|female")
    source, output, sex = args
    if sex not in ("male", "female"):
        raise SystemExit("sex must be male or female")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)
    bpy.context.view_layer.update()

    armatures = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    head_hits = [(a, a.data.bones["head"]) for a in armatures if a.data.bones.get("head")]
    if len(head_hits) != 1:
        raise SystemExit(f"Expected exactly one armature bone named 'head'; found {len(head_hits)}")
    arm, head = head_hits[0]
    head_world = arm.matrix_world @ head.head_local

    # Keep the visually approved cut measurements unchanged.
    half_width = 0.095 if sex == "male" else 0.083
    forward_offset = -0.060
    downward_offset = -0.010
    cut_reference = head_world.copy()
    cut_reference.y += forward_offset
    cut_reference.z += downward_offset
    z_min = cut_reference.z - 0.045
    z_max = cut_reference.z + (0.105 if sex == "male" else 0.095)
    y_max = cut_reference.y - 0.020
    removed = {}
    total_before = total_after = 0
    skin_material = None

    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            continue
        if skin_material is None:
            for mat in obj.data.materials:
                if mat and any(k in mat.name.lower() for k in ("skin", "body", "face")):
                    skin_material = mat
                    break
            if skin_material is None and len(obj.data.materials):
                skin_material = obj.data.materials[0]
        mesh = obj.data
        before = len(mesh.polygons)
        total_before += before
        remove_indices = []
        for poly in mesh.polygons:
            center = obj.matrix_world @ poly.center
            if (abs(center.x - cut_reference.x) <= half_width and
                z_min <= center.z <= z_max and center.y <= y_max):
                remove_indices.append(poly.index)
        if remove_indices:
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
        raise SystemExit("No polygons fell inside the cut region; refusing to export unchanged candidate")

    # A genuinely flat surface: all four corners share one Y coordinate.
    # Slightly forward of the boundary so the patch visibly closes the cut.
    x_min, x_max = cut_reference.x - half_width, cut_reference.x + half_width
    y_plane = y_max - 0.001
    verts = [(x_min, y_plane, z_min), (x_max, y_plane, z_min),
             (x_max, y_plane, z_max), (x_min, y_plane, z_max)]
    patch_mesh = bpy.data.meshes.new(f"{sex}_face_flat_backing_mesh")
    patch_mesh.from_pydata(verts, [], [(0, 1, 2, 3)])
    patch_mesh.update()
    patch = bpy.data.objects.new(f"{sex}_face_flat_backing", patch_mesh)
    bpy.context.collection.objects.link(patch)
    patch["purpose"] = "Flat face-mounting/backing surface aligned to approved cut coordinates"
    patch["flat_plane_axis"] = "Blender Y"
    patch["plane_y"] = float(y_plane)
    patch["cut_x_min"] = float(x_min)
    patch["cut_x_max"] = float(x_max)
    patch["cut_z_min"] = float(z_min)
    patch["cut_z_max"] = float(z_max)
    if skin_material:
        patch.data.materials.append(skin_material)
    group = patch.vertex_groups.new(name="head")
    group.add(list(range(len(patch.data.vertices))), 1.0, "REPLACE")
    modifier = patch.modifiers.new("Head bone deformation", "ARMATURE")
    modifier.object = arm
    # Keep the patch's coordinates in the same scene/world space as the cut.
    patch.matrix_world = arm.matrix_world.copy() if False else patch.matrix_world

    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output_path), export_format="GLB", use_selection=False,
        export_animations=True, export_skins=True, export_morph=True,
    )
    report = {
        "source": source, "candidate": str(output_path), "sex": sex,
        "method": "original polygon cut plus a flat XZ backing quad",
        "head_bone_world_position_unchanged": [round(float(v), 7) for v in head_world],
        "cut_reference_world": [round(float(v), 7) for v in cut_reference],
        "cut_region_world": {
            "x_min": round(float(x_min), 7), "x_max": round(float(x_max), 7),
            "z_min": round(float(z_min), 7), "z_max": round(float(z_max), 7),
            "blender_y_max_front_boundary": round(float(y_max), 7),
        },
        "flat_backing_surface": {
            "object": patch.name, "plane_axis": "Blender Y",
            "y": round(float(y_plane), 7),
            "vertices_world": [[round(float(c), 7) for c in v] for v in verts],
            "all_vertices_share_same_y": len({round(v[1], 9) for v in verts}) == 1,
            "material": skin_material.name if skin_material else None,
            "weighted_to_head_bone": True,
        },
        "removed_polygons_by_mesh": removed,
        "total_polygons_before": total_before, "total_polygons_after": total_after,
        "warning": "Inspection candidate; verify patch visibility/material and fit in viewer before production use.",
    }
    output_path.with_suffix(".report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
