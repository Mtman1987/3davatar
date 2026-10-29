#!/usr/bin/env python3
"""Create no-cut face-recess candidates by deforming the existing mesh only.

No faces are deleted and no new objects/vertices are added. Approved cut
coordinates define the target recess bounds. Only existing front-facing
vertices inside that region are moved; all other vertex coordinates remain
unchanged.
"""
import bpy
import json
import sys
from pathlib import Path
from mathutils import Vector

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

    # Approved cut reference dimensions: do not alter these values.
    half_width = 0.095 if sex == "male" else 0.083
    forward_offset = -0.060
    downward_offset = -0.010
    cut_reference = head_world.copy()
    cut_reference.y += forward_offset
    cut_reference.z += downward_offset
    z_min = cut_reference.z - 0.045
    z_max = cut_reference.z + (0.105 if sex == "male" else 0.095)
    y_boundary = cut_reference.y - 0.020

    # The original cut removed front-side faces up to y_boundary. Instead,
    # pull existing front-facing vertices in this footprint onto that same
    # plane, leaving the mesh connected and adding/deleting no topology.
    # A narrow Z-only falloff protects the forehead/jaw outside the cavity;
    # there is intentionally no left/right cheek-wall falloff.
    transition = 0.008
    x_min, x_max = cut_reference.x - half_width, cut_reference.x + half_width
    changed_by_mesh = {}
    total_vertices = 0
    changed_vertices = 0
    max_displacement = 0.0

    for obj in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        mesh = obj.data
        before_count = len(mesh.vertices)
        total_vertices += before_count
        changed = 0
        for vert in mesh.vertices:
            world = obj.matrix_world @ vert.co
            if world.x < x_min or world.x > x_max or world.z < z_min or world.z > z_max:
                continue
            if world.y > y_boundary:
                continue
            # Blend into the small forehead ceiling and jaw floor; full depth
            # in the middle, with no side walls at the left/right edges.
            top_weight = smoothstep((z_max - world.z) / transition)
            bottom_weight = smoothstep((world.z - z_min) / transition)
            weight = min(top_weight, bottom_weight)
            if weight <= 0.0:
                continue
            target_y = y_boundary
            new_world_y = world.y + (target_y - world.y) * weight
            displacement = new_world_y - world.y
            if abs(displacement) < 1e-8:
                continue
            new_world = Vector((world.x, new_world_y, world.z))
            vert.co = obj.matrix_world.inverted() @ new_world
            changed += 1
            changed_vertices += 1
            max_displacement = max(max_displacement, abs(displacement))
        if changed:
            mesh.update()
            changed_by_mesh[obj.name] = {"vertices_deformed": changed, "vertices_before": before_count, "vertices_after": len(mesh.vertices)}
    if changed_vertices == 0:
        raise SystemExit("No vertices matched the approved deformation region; refusing to export unchanged candidate")

    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output_path), export_format="GLB",
                              use_selection=False, export_animations=True,
                              export_skins=True, export_morph=True)
    report = {
        "source": source, "candidate": str(output_path), "sex": sex,
        "method": "deform existing vertices only; no cuts; no new geometry",
        "topology_changed": False,
        "total_vertices_before": total_vertices,
        "total_vertices_after": sum(len(o.data.vertices) for o in bpy.context.scene.objects if o.type == "MESH"),
        "changed_vertices": changed_vertices,
        "max_absolute_y_displacement": round(float(max_displacement), 7),
        "head_bone_world_position_unchanged": [round(float(v), 7) for v in head_world],
        "approved_region_world": {
            "x_min": round(float(x_min), 7), "x_max": round(float(x_max), 7),
            "z_min": round(float(z_min), 7), "z_max": round(float(z_max), 7),
            "y_target": round(float(y_boundary), 7),
        },
        "changed_by_mesh": changed_by_mesh,
        "warning": "Visual inspection candidate. No polygons or objects were added or removed."
    }
    output_path.with_suffix(".report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
