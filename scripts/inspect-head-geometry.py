#!/usr/bin/env python3
"""Extract geometry and skeleton metadata from AvatarAce generic body GLBs.

This is an inspection artifact generator only: it does not modify any model.
"""
import json
import sys
from pathlib import Path

import numpy as np
import trimesh
from pygltflib import GLTF2

def vec(v):
    return [round(float(x), 7) for x in v]

def main():
    output = Path("head-geometry-report")
    output.mkdir(exist_ok=True)
    summary = {"purpose": "Read-only geometry metadata for stable face fitting", "models": []}
    for filename in sys.argv[1:]:
        path = Path(filename)
        gltf = GLTF2().load(str(path))
        scene = trimesh.load(str(path), force="scene", process=False)
        nodes = []
        for i, node in enumerate(gltf.nodes or []):
            translation = node.translation or [0, 0, 0]
            rotation = node.rotation or [0, 0, 0, 1]
            scale = node.scale or [1, 1, 1]
            nodes.append({
                "index": i, "name": node.name or f"node_{i}",
                "mesh_index": node.mesh, "skin_index": node.skin,
                "translation": vec(translation), "rotation_xyzw": vec(rotation),
                "scale": vec(scale), "children": node.children or []
            })
        joints = []
        for si, skin in enumerate(gltf.skins or []):
            for ji, node_index in enumerate(skin.joints or []):
                n = gltf.nodes[node_index]
                joints.append({"skin_index": si, "joint_order": ji, "node_index": node_index,
                               "name": n.name or f"node_{node_index}"})
        mesh_records = []
        # Scene graph transforms are included by trimesh when accessing each node's transform.
        for node_name in scene.graph.nodes_geometry:
            transform, geom_name = scene.graph.get(node_name)
            geom = scene.geometry.get(geom_name)
            if geom is None or not hasattr(geom, "vertices") or len(geom.vertices) == 0:
                continue
            vertices = trimesh.transform_points(np.asarray(geom.vertices), transform)
            lo, hi = vertices.min(axis=0), vertices.max(axis=0)
            center = (lo + hi) / 2
            mesh_records.append({
                "node_name": str(node_name), "geometry_name": str(geom_name),
                "vertex_count": int(len(geom.vertices)),
                "face_count": int(len(geom.faces)) if hasattr(geom, "faces") else 0,
                "world_bounds_min_xyz": vec(lo), "world_bounds_max_xyz": vec(hi),
                "world_dimensions_xyz": vec(hi - lo), "world_center_xyz": vec(center),
                "candidate_head_by_name": any(k in (str(node_name) + " " + str(geom_name)).lower()
                                              for k in ("head", "face", "skull"))
            })
        mesh_records.sort(key=lambda m: (not m["candidate_head_by_name"], m["node_name"]))
        bounds = scene.bounds
        model = {
            "file": path.name, "scene_bounds_min_xyz": vec(bounds[0]),
            "scene_bounds_max_xyz": vec(bounds[1]), "scene_dimensions_xyz": vec(bounds[1] - bounds[0]),
            "nodes": nodes, "joints": joints, "mesh_geometry": mesh_records,
            "notes": [
                "Bounds are in scene/world coordinates as loaded by trimesh.",
                "Name matches are hints only; verify actual anatomy in the viewer.",
                "This report does not alter or upload modified GLB assets."
            ]
        }
        out = output / (path.stem + ".json")
        out.write_text(json.dumps(model, indent=2) + "\n", encoding="utf-8")
        summary["models"].append({"file": path.name, "report": str(out),
                                  "node_count": len(nodes), "joint_count": len(joints),
                                  "mesh_count": len(mesh_records),
                                  "named_head_candidates": [m["node_name"] for m in mesh_records if m["candidate_head_by_name"]]})
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))

if __name__ == "__main__":
    main()
