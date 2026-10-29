#!/usr/bin/env python3
"""Build experimental face-fit recess candidates without deleting head polygons.

The approved face-cut measurements define the footprint. Vertices in the
front-facing footprint are pushed inward (+Blender Y) with a smooth falloff,
leaving the source topology connected and preserving the original mesh surface
outside the fitting zone. This is a visual prototype, not production geometry.
"""
import bpy
import json
import math
import sys
from pathlib import Path

def args_after_dash():
    args = sys.argv
    return args[args.index("--") + 1:] if "--" in args else []

def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)

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

    # Same approved reference used by the prior visually checked cut candidates.
    half_width = 0.095 if sex == "male" else 0.083
    forward_offset = -0.060
    downward_offset = -0.010
    cut_reference = head_world.copy()
    cut_reference.y += forward_offset
    cut_reference.z += downward_offset
    z_min = cut_reference.z - 0.045
    z_max = cut_reference.z + (0.105 if sex == "male" else 0.095)
    y_max = cut_reference.y - 0.020

    # Smooth indentation depth. Center is pushed inward; displacement fades to
    # zero across a rounded perimeter instead of creating a hard shelf.
    max_inset = 0.035
    edge_fade_x = 0.018
    edge_fade_z = 0.018
    moved_by_mesh = {}
    total_vertices_before = total_vertices_after = 0

    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        mesh = obj.data
        total_vertices_before += len(mesh.vertices)
        moved = 0
        # Convert original world positions to world space, offset along Blender
        # +Y (into the head, opposite the -Y face-forward direction), then back.
        inv_world = obj.matrix_world.inverted()
        for vert in mesh.vertices:
            p = obj.matrix_world @ vert.co
            if p.y > y_max or p.z < z_min or p.z > z_max:
                continue
            dx = half_width - abs(p.x - cut_reference.x)
            dz = min(p.z - z_min, z_max - p.z)
            if dx <= 0.0 or dz <= 0.0:
                continue
            wx = smoothstep(dx / edge_fade_x) if dx < edge_fade_x else 1.0
            wz = smoothstep(dz / edge_fade_z) if dz < edge_fade_z else 1.0
            # Round the inset profile further near the top/bottom and sides.
            weight = wx * wz
            if weight <= 0.001:
                continue
            # A shallow center, smoothly tapered to the original surface.
            p.y += max_inset * weight
            vert.co = inv_world @ p
            moved += 1
        if moved:
            moved_by_mesh[obj.name] = moved
            mesh.update()
        total_vertices_after += len(mesh.vertices)

    if not moved_by_mesh:
        raise SystemExit("No vertices fell inside the recess region; refusing to export unchanged candidate")

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
        "method": "topology-preserving vertex displacement; no polygons deleted",
        "head_bone_world_position_unchanged": [round(float(v), 7) for v in head_world],
        "cut_reference_world": [round(float(v), 7) for v in cut_reference],
        "forward_offset_scene_units": forward_offset,
        "downward_offset_scene_units": downward_offset,
        "max_inset_scene_units": max_inset,
        "cut_region_world": {
            "x_min": round(float(cut_reference.x - half_width), 7),
            "x_max": round(float(cut_reference.x + half_width), 7),
            "z_min": round(float(z_min), 7),
            "z_max": round(float(z_max), 7),
            "blender_y_max_front_boundary": round(float(y_max), 7),
        },
        "moved_vertices_by_mesh": moved_by_mesh,
        "total_vertices_before": total_vertices_before,
        "total_vertices_after": total_vertices_after,
        "polygons_deleted": 0,
        "warning": "First visual prototype only. Confirm recess depth, footprint, face fit, skinning, and morph behavior in viewer before use.",
    }
    output_path.with_suffix(".report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
