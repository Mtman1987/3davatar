#!/usr/bin/env python3
"""Export head-only geometry and facial rig landmarks from generic AvatarAce GLBs.

The source GLBs are read-only. Outputs contain only the spatially cropped head
surface plus head/neck/jaw/eye/facial-muscle joint references, not the full body.
"""
import json
import sys
from pathlib import Path

import numpy as np
import trimesh
from pygltflib import GLTF2


def vec(v):
    return [round(float(x), 7) for x in v]


def node_matrix(node):
    if node.matrix and len(node.matrix) == 16:
        return np.asarray(node.matrix, dtype=float).reshape((4, 4), order="F")
    t = np.eye(4)
    t[:3, 3] = np.asarray(node.translation or [0, 0, 0], dtype=float)
    x, y, z, w = node.rotation or [0, 0, 0, 1]
    rot = np.array([
        [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
        [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
        [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]
    ])
    s = np.diag(list(node.scale or [1, 1, 1]))
    t[:3, :3] = rot @ s
    return t


def main():
    output = Path("head-geometry-report")
    output.mkdir(exist_ok=True)
    summary = {"purpose": "Head-only surface crop plus facial rig reference landmarks", "models": []}

    for filename in sys.argv[1:]:
        path = Path(filename)
        gltf = GLTF2().load(str(path))
        nodes = gltf.nodes or []
        parents = {}
        for parent_i, node in enumerate(nodes):
            for child_i in (node.children or []):
                parents[child_i] = parent_i
        local_mats = [node_matrix(n) for n in nodes]
        world_mats = [None] * len(nodes)

        def world_matrix(i):
            if world_mats[i] is not None:
                return world_mats[i]
            p = parents.get(i)
            world_mats[i] = local_mats[i] if p is None else world_matrix(p) @ local_mats[i]
            return world_mats[i]

        node_names = [(n.name or f"node_{i}") for i, n in enumerate(nodes)]
        joint_ids = set()
        for skin in (gltf.skins or []):
            joint_ids.update(skin.joints or [])

        # Facial joints are used as anatomical anchors, not as the head surface itself.
        anchor_terms = (
            "head", "neck", "jaw", "eye", "orbicularis", "oris", "tongue",
            "levator", "oculi", "temporalis", "risorius", "cheek", "brow", "lip", "nose"
        )
        refs = []
        for i in sorted(joint_ids):
            name = node_names[i]
            low = name.lower()
            if any(term in low for term in anchor_terms):
                p = world_matrix(i)[:3, 3]
                refs.append({"node_index": i, "name": name, "world_position_xyz": vec(p)})

        head_refs = [r for r in refs if any(k in r["name"].lower() for k in ("head", "jaw", "eye", "orbicularis", "oris", "tongue", "levator", "oculi", "temporalis", "risorius", "cheek", "brow", "lip", "nose"))]
        neck_refs = [r for r in refs if "neck" in r["name"].lower()]
        if not head_refs:
            raise RuntimeError(f"No head/face reference joints found in {path}")

        points = np.asarray([r["world_position_xyz"] for r in head_refs], dtype=float)
        lo = points.min(axis=0)
        hi = points.max(axis=0)
        span = np.maximum(hi - lo, np.array([0.08, 0.12, 0.08]))
        center = (lo + hi) / 2

        # Expand the landmark envelope to include skull, forehead, cheeks and chin.
        # Keep the neck boundary near the neck joint where available.
        x_pad = max(float(span[0]) * 0.9, 0.075)
        z_pad = max(float(span[2]) * 1.8, 0.16)
        y_top = float(hi[1] + max(span[1] * 0.45, 0.07))
        y_bottom = float(lo[1] - max(span[1] * 0.18, 0.035))
        if neck_refs:
            neck_y = min(r["world_position_xyz"][1] for r in neck_refs)
            y_bottom = min(y_bottom, float(neck_y) - 0.015)
        crop_min = np.array([center[0] - x_pad, y_bottom, lo[2] - z_pad])
        crop_max = np.array([center[0] + x_pad, y_top, hi[2] + z_pad])

        scene = trimesh.load(str(path), force="scene", process=False)
        pieces_v, pieces_f, source_records = [], [], []
        offset = 0
        for mesh_i, node_name in enumerate(scene.graph.nodes_geometry):
            transform, geom_name = scene.graph.get(node_name)
            geom = scene.geometry.get(geom_name)
            if geom is None or not hasattr(geom, "vertices") or not hasattr(geom, "faces"):
                continue
            vertices = trimesh.transform_points(np.asarray(geom.vertices), transform)
            faces = np.asarray(geom.faces, dtype=np.int64)
            if not len(vertices) or not len(faces):
                continue
            centroids = vertices[faces].mean(axis=1)
            keep = np.all((centroids >= crop_min) & (centroids <= crop_max), axis=1)
            kept_faces = faces[keep]
            if not len(kept_faces):
                continue
            used = np.unique(kept_faces.reshape(-1))
            remap = np.full(len(vertices), -1, dtype=np.int64)
            remap[used] = np.arange(len(used))
            local_faces = remap[kept_faces]
            v = vertices[used].astype(np.float32)
            f = local_faces.astype(np.int32)
            pieces_v.append(v)
            pieces_f.append(f + offset)
            source_records.append({
                "source_node": str(node_name), "source_geometry": str(geom_name),
                "source_vertex_count": int(len(vertices)), "head_region_vertex_count": int(len(v)),
                "head_region_triangle_count": int(len(f))
            })
            offset += len(v)

        if not pieces_v:
            raise RuntimeError(f"Head crop produced no triangles for {path}; refusing to emit an empty report")
        vertices = np.concatenate(pieces_v, axis=0)
        faces = np.concatenate(pieces_f, axis=0)
        mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
        normals = np.asarray(mesh.vertex_normals, dtype=np.float32)
        stem = path.stem
        np.savez_compressed(output / f"{stem}-head-only.npz",
                            head_vertices_world=vertices, head_triangles=faces,
                            head_vertex_normals_world=normals)
        bounds_min, bounds_max = vertices.min(axis=0), vertices.max(axis=0)
        report = {
            "source_file": path.name,
            "output_arrays": f"{stem}-head-only.npz",
            "crop_bounds_world_xyz": {"min": vec(crop_min), "max": vec(crop_max)},
            "actual_head_surface_bounds_world_xyz": {"min": vec(bounds_min), "max": vec(bounds_max)},
            "head_surface_vertex_count": int(len(vertices)),
            "head_surface_triangle_count": int(len(faces)),
            "facial_reference_joints": refs,
            "source_geometry_contributions": source_records,
            "notes": [
                "Only triangles whose centroids lie inside the head-region crop are exported; original GLB is unchanged.",
                "The crop is an initial spatial extraction based on facial joint landmarks, not a hand-authored anatomical seam.",
                "Facial joint positions are reference anchors; the NPZ surface is bind-pose geometry, not GPU-skinned/deformed output.",
                "Check the crop visually before using it to drive face placement. The neck margin is intentionally retained for a stable attachment boundary."
            ]
        }
        (output / f"{stem}-head-only.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        summary["models"].append({
            "source_file": path.name, "report": f"{stem}-head-only.json",
            "arrays": f"{stem}-head-only.npz",
            "head_vertices": int(len(vertices)), "head_triangles": int(len(faces)),
            "facial_reference_joint_count": len(refs)
        })
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
