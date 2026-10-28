#!/usr/bin/env python3
"""Extract mesh arrays and skeleton metadata from generic AvatarAce body GLBs.

Read-only: exports geometry for offline analysis; never edits source models.
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
    summary = {"purpose": "Read-only full geometry export for MediaPipe-to-head mapping", "models": []}

    for filename in sys.argv[1:]:
        path = Path(filename)
        gltf = GLTF2().load(str(path))
        scene = trimesh.load(str(path), force="scene", process=False)

        nodes = []
        for i, node in enumerate(gltf.nodes or []):
            nodes.append({
                "index": i, "name": node.name or f"node_{i}",
                "mesh_index": node.mesh, "skin_index": node.skin,
                "translation": vec(node.translation or [0, 0, 0]),
                "rotation_xyzw": vec(node.rotation or [0, 0, 0, 1]),
                "scale": vec(node.scale or [1, 1, 1]),
                "children": node.children or []
            })

        joints = []
        for si, skin in enumerate(gltf.skins or []):
            for ji, node_index in enumerate(skin.joints or []):
                n = gltf.nodes[node_index]
                joints.append({
                    "skin_index": si, "joint_order": ji, "node_index": node_index,
                    "name": n.name or f"node_{node_index}"
                })

        mesh_records = []
        arrays = {}
        for mesh_i, node_name in enumerate(scene.graph.nodes_geometry):
            transform, geom_name = scene.graph.get(node_name)
            geom = scene.geometry.get(geom_name)
            if geom is None or not hasattr(geom, "vertices") or len(geom.vertices) == 0:
                continue

            # Store both local and node-transformed vertices; faces retain original local indexing.
            local_vertices = np.asarray(geom.vertices, dtype=np.float32)
            world_vertices = trimesh.transform_points(local_vertices, transform).astype(np.float32)
            faces = np.asarray(geom.faces, dtype=np.int32) if hasattr(geom, "faces") else np.empty((0, 3), dtype=np.int32)
            normals = np.asarray(geom.vertex_normals, dtype=np.float32) if hasattr(geom, "vertex_normals") else np.empty((0, 3), dtype=np.float32)
            safe = f"mesh_{mesh_i:02d}"
            arrays[f"{safe}_vertices_local"] = local_vertices
            arrays[f"{safe}_vertices_world"] = world_vertices
            arrays[f"{safe}_faces"] = faces
            arrays[f"{safe}_vertex_normals_local"] = normals

            lo, hi = world_vertices.min(axis=0), world_vertices.max(axis=0)
            mesh_records.append({
                "array_key": safe,
                "node_name": str(node_name), "geometry_name": str(geom_name),
                "vertex_count": int(len(local_vertices)), "face_count": int(len(faces)),
                "world_bounds_min_xyz": vec(lo), "world_bounds_max_xyz": vec(hi),
                "world_dimensions_xyz": vec(hi - lo), "world_center_xyz": vec((lo + hi) / 2),
                "node_world_transform_4x4": np.asarray(transform).round(8).tolist(),
                "candidate_head_by_name": any(k in (str(node_name) + " " + str(geom_name)).lower()
                                              for k in ("head", "face", "skull"))
            })

        mesh_records.sort(key=lambda m: (not m["candidate_head_by_name"], m["node_name"]))
        bounds = scene.bounds
        model = {
            "file": path.name,
            "scene_bounds_min_xyz": vec(bounds[0]),
            "scene_bounds_max_xyz": vec(bounds[1]),
            "scene_dimensions_xyz": vec(bounds[1] - bounds[0]),
            "nodes": nodes, "joints": joints, "mesh_geometry": mesh_records,
            "mesh_arrays_file": f"{path.stem}-mesh-arrays.npz",
            "mesh_arrays_keys": list(arrays.keys()),
            "notes": [
                "NPZ includes local and node-transformed vertices, triangle face indices, and local vertex normals for every geometry.",
                "Vertex arrays are geometry-local and node/world transformed; triangle indices index the corresponding vertex array.",
                "This export does not include skinned/deformed vertex positions or edit source GLBs; skinning joint/weight accessor export is a separate step if needed.",
                "Name-based head candidates are hints only, not proof of anatomical segmentation."
            ]
        }
        (output / f"{path.stem}.json").write_text(json.dumps(model, indent=2) + "\n", encoding="utf-8")
        np.savez_compressed(output / f"{path.stem}-mesh-arrays.npz", **arrays)
        summary["models"].append({
            "file": path.name, "report": f"{path.stem}.json",
            "mesh_arrays": f"{path.stem}-mesh-arrays.npz",
            "node_count": len(nodes), "joint_count": len(joints),
            "mesh_count": len(mesh_records),
            "vertices_total": int(sum(m["vertex_count"] for m in mesh_records)),
            "triangles_total": int(sum(m["face_count"] for m in mesh_records)),
            "named_head_candidates": [m["node_name"] for m in mesh_records if m["candidate_head_by_name"]]
        })

    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
